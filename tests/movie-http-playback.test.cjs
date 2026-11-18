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
 return code.slice(start,end);
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
