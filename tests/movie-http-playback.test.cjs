const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const code=fs.readFileSync(path.join(__dirname,"..","discover.js"),"utf8");
const extract=(name,next)=>{
 const start=code.indexOf("function "+name+"(");
 assert.ok(start>=0,"helper exists: "+name);
 const end=code.indexOf("function "+next+"(",start);
 assert.ok(end>start,"next helper exists: "+next);
 return code.slice(start,code.lastIndexOf("\n",end));
};
const funcs=extract("validStream","browserCompatibleURL")+
 extract("browserCompatibleURL","setWatchStatus")+
 extract("isHlsStream","browserCanTry")+
 extract("browserCanTry","browserPlaybackURL");
const {validStream,browserCompatibleURL,isHlsStream,browserCanTry}=new Function("URL",funcs+"return {validStream,browserCompatibleURL,isHlsStream,browserCanTry};")(URL);
test("HTTP direct video is eligible for approved gateway",()=>{
 assert.equal(browserCanTry("http://media.example.org/movie.mp4",{direct:true,needsHeaders:false}),true);
 assert.equal(browserCanTry("https://media.example.org/movie.mp4",{direct:true,needsHeaders:false}),true);
});
test("HTTPS MP4 without provider direct-file metadata is still tryable",()=>{
 assert.equal(browserCanTry("https://bcdn.hakunaymatata.com/resource/h265/sample.mp4?sign=redacted",{direct:false,needsHeaders:false}),true);
 assert.equal(browserCanTry("https://media.example.org/resolver?id=1",{direct:false,needsHeaders:false}),false);
});
test("HTTP HLS and unresolved sources stay blocked",()=>{
 assert.equal(browserCanTry("http://media.example.org/movie.m3u8",{direct:true,needsHeaders:false}),false);
 assert.equal(browserCanTry("http://media.example.org/movie.mp4",{direct:false,needsHeaders:false}),false);
 assert.equal(browserCanTry("http://media.example.org/movie.mp4",{direct:true,needsHeaders:true}),false);
});
test("HLS detection with query parameters",()=>{
 assert.equal(isHlsStream("https://media.example.org/movie.m3u8?sig=one"),true);
 assert.equal(isHlsStream("https://media.example.org/movie.mp4?sig=one"),false);
});
test("unsafe URL schemes and embedded credentials are rejected",()=>{
 assert.equal(validStream("file:///etc/passwd"),false);
 assert.equal(validStream("javascript:alert(1)"),false);
 assert.equal(validStream("http://user:pass@media.example.org/video.mp4"),false);
});
test("browser HTTP playback never directly points video to insecure source",()=>{
 assert.match(code,/fetch\(API\+"\/api\/playback\/prepare"/);
 assert.match(code,/video\.src=playbackURL/);
 assert.match(code,/if\(browserCompatibleURL\(url\)\)return url/);
});

test("signed H.265 movie links warn about codec and an elapsed timestamp",()=>{
 const start=code.indexOf("function movieLinkInfo(");
 const end=code.indexOf("function hevcSupport(",start);
 assert.ok(start>=0&&end>start);
 const getInfo=new Function("URL","Date",code.slice(start,end)+"return movieLinkInfo;")(URL,{now:()=>Date.parse("2026-11-19T03:27:00Z")});
 const info=getInfo("https://bcdn.hakunaymatata.com/resource/h265/sample.mp4?sign=redacted&t=1795057163");
 assert.equal(info.hevc,true);
 assert.equal(info.expired,true);
 assert.equal(info.expires,1795057163000);
 const future=getInfo("https://media.example.org/resource/h264/sample.mp4?t=1895057163");
 assert.equal(future.hevc,false);
 assert.equal(future.expired,false);
});
