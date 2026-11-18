(()=>{
"use strict";
const API="https://iptv-org.github.io/api/guides.json";
const $=selector=>document.querySelector(selector);
const CAP_COMPRESSED=12*1024*1024,CAP_TEXT=30*1024*1024;
let guide=new Map(),loadedAt=null,loadedLabel="",focused=null,channelsProvider=()=>[],watchChannel=()=>{},refreshChannels=()=>{};
let activeLoad=null;
const textNode=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n};
const status=(message)=>{$("#epg-status").textContent=message};
const normalizeId=id=>String(id||"").trim().toLowerCase();
function keys(c){
 const id=String(c?.id||"");
 const base=id.split("@")[0];
 return [...new Set([id,base].filter(Boolean).map(normalizeId))];
}
function parseTime(value){
 const v=String(value||"").trim();
 const match=/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-])(\d{2})(\d{2}))?/.exec(v);
 if(!match){const n=Date.parse(v);return Number.isFinite(n)?n:null}
 const [,year,month,day,hour,minute,second="00",sign,hh="00",mm="00"]=match;
 let utc=Date.UTC(+year,+month-1,+day,+hour,+minute,+second);
 if(sign){
  const offset=(+hh*60+(+mm))*60000;
  utc+=sign==="+"?-offset:offset;
 }
 return Number.isFinite(utc)?utc:null;
}
function parseXmltv(text){
 const parser=new DOMParser();
 const doc=parser.parseFromString(text,"application/xml");
 if(doc.querySelector("parsererror")||doc.documentElement?.localName!=="tv")throw Error("Invalid XMLTV file. Expected a <tv> document with <programme> entries.");
 const out=new Map();
 const rows=doc.getElementsByTagName("programme");
 if(rows.length>120000)throw Error("Guide contains too many programmes. Choose a smaller country/site guide.");
 let parsed=0;
 for(const entry of rows){
  const id=normalizeId(entry.getAttribute("channel"));
  const start=parseTime(entry.getAttribute("start")),end=parseTime(entry.getAttribute("stop"));
  if(!id||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
  const titles=entry.getElementsByTagName("title"),descs=entry.getElementsByTagName("desc");
  const title=titles[0]?.textContent?.trim()||"Program title unavailable";
  const desc=descs[0]?.textContent?.trim()||"";
  if(!out.has(id))out.set(id,[]);
  out.get(id).push({title:title.slice(0,300),desc:desc.slice(0,900),start,end});
  parsed++;
 }
 for(const list of out.values())list.sort((a,b)=>a.start-b.start);
 return {guide:out,parsed};
}
function programmeList(c){
 for(const id of keys(c)){
  const rows=guide.get(id);
  if(rows?.length)return rows;
 }
 return [];
}
function nowNext(c,now=Date.now()){
 const rows=programmeList(c);
 if(!rows.length)return null;
 let current=null,next=null;
 // Binary search first programme whose start is after now; overlapping entries are handled by the backward scan.
 let lo=0,hi=rows.length;
 while(lo<hi){const m=(lo+hi)>>1;if(rows[m].start<=now)lo=m+1;else hi=m}
 for(let i=lo-1;i>=0&&i>=lo-35;i--){if(rows[i].start<=now&&rows[i].end>now){current=rows[i];break}}
 for(let i=lo;i<rows.length;i++){if(rows[i].end>now){next=rows[i];break}}
 return {current,next};
}
function fmt(when){
 return new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(new Date(when));
}
function paintChannel(c,element){
 const data=nowNext(c);
 if(!data){element.textContent="No guide available";element.className="live-epg-brief live-epg-none";return}
 const {current,next}=data;
 element.replaceChildren();
 element.className="live-epg-brief";
 const now=textNode("div",null,current?"Now · "+current.title:"No program currently listed");
 element.append(now);
 if(next)element.append(textNode("small",null,"Next · "+fmt(next.start)+" · "+next.title));
}
function getSummary(c){
 const data=nowNext(c);
 if(!data)return null;
 return {now:data.current?.title||null,next:data.next?.title||null};
}
function show(c){
 focused=c;
 const modal=$("#epg-dialog");$("#epg-title").textContent=c.title+" · TV Guide";
 const day=new Intl.DateTimeFormat(undefined,{weekday:"long",month:"short",day:"numeric"}).format(new Date());
 $("#epg-date-label").textContent="Times shown in your device's time zone · "+day;
 const dest=$("#epg-programmes");dest.replaceChildren();
 const now=Date.now(),items=programmeList(c).filter(item=>item.end>now-3*3600000&&item.start<now+48*3600000).slice(0,150);
 if(!items.length){dest.append(textNode("p","epg-empty",guide.size?"No current or upcoming programs in this guide for this channel.":"Load an XMLTV guide first to see the schedule."))}
 else{
  for(const item of items){
   const current=item.start<=now&&item.end>now;
   const row=textNode("div","epg-program"+(current?" epg-program-current":""));
   const times=textNode("div","epg-program-time",fmt(item.start)+" – "+fmt(item.end));
   const info=textNode("div","epg-program-info");
   info.append(textNode("strong",null,item.title));
   if(item.desc)info.append(textNode("p",null,item.desc));
   if(current)info.append(textNode("span","epg-on-now","ON NOW"));
   row.append(times,info);dest.append(row);
  }
 }
 $("#epg-watch-channel").disabled=!c.url;
 modal.showModal();
}
function close(){focused=null;$("#epg-dialog").close()}
function apply(parsed,label){
 guide=parsed.guide;loadedAt=Date.now();loadedLabel=label;
 let matching=0;const seen=new Set();
 for(const c of channelsProvider()){const key=c.id||c.url;if(seen.has(key))continue;seen.add(key);if(programmeList(c).length)matching++}
 $("#epg-loaded-count").textContent=matching+" matching channels";
 status("Loaded "+parsed.parsed.toLocaleString()+" program entries from "+label+". "+matching+" channel IDs matched this playlist. Times use your device's time zone.");
 refreshChannels();
}
async function toText(data){
 if(data.byteLength>CAP_COMPRESSED)throw Error("Guide file exceeds the 12 MB download limit.");
 const bytes=new Uint8Array(data);
 const gz=bytes[0]===0x1f&&bytes[1]===0x8b;
 let raw=data;
 if(gz){
  if(!("DecompressionStream" in window))throw Error("Your browser does not support gzip XMLTV guides. Try an uncompressed XMLTV file.");
  const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"));
  raw=await new Response(stream).arrayBuffer();
 }
 if(raw.byteLength>CAP_TEXT)throw Error("Uncompressed guide exceeds 30 MB. Select a smaller regional guide.");
 return new TextDecoder("utf-8",{fatal:false}).decode(raw);
}
async function loadData(arrayBuffer,label){
 const text=await toText(arrayBuffer);
 if(!text.trimStart().startsWith("<?xml")&&!text.trimStart().startsWith("<tv"))throw Error("This is not an XMLTV file.");
 const parsed=parseXmltv(text);
 if(!parsed.parsed)throw Error("This XMLTV source contains no usable program entries.");
 apply(parsed,label);
}
async function loadUrl(url){
 let parsed;
 try{parsed=new URL(url);if(parsed.protocol!=="https:"&&parsed.protocol!=="http:")throw Error()}catch{status("Enter a valid HTTP or HTTPS XMLTV URL.");return}
 if(parsed.protocol==="http:"&&location.protocol==="https:"){status("HTTP guide files cannot be fetched directly from an HTTPS website. Use an HTTPS guide or upload the downloaded XMLTV file.");return}
 if(activeLoad)activeLoad.abort();
 const controller=new AbortController();activeLoad=controller;
 const button=$("#epg-load-url");button.disabled=true;
 status("Loading XMLTV schedule…");
 try{
  const response=await fetch(parsed.toString(),{signal:controller.signal,cache:"no-store"});
  if(!response.ok)throw Error("Guide server returned HTTP "+response.status);
  const size=Number(response.headers.get("content-length")||0);
  if(size>CAP_COMPRESSED)throw Error("Guide file exceeds the 12 MB limit.");
  const buffer=await response.arrayBuffer();
  if(activeLoad!==controller)return;
  await loadData(buffer,parsed.hostname);
 }catch(error){
  if(error.name==="AbortError")return;
  status("Could not load guide: "+error.message+". Some guide hosts block browser access (CORS); download and upload their XMLTV file instead.");
 }finally{if(activeLoad===controller)activeLoad=null;button.disabled=false}
}
async function loadFile(file){
 if(!file)return;
 if(file.size>CAP_COMPRESSED){status("File exceeds 12 MB. Choose a smaller XMLTV guide.");return}
 status("Reading guide file…");
 try{await loadData(await file.arrayBuffer(),file.name)}
 catch(error){status("Could not read guide: "+error.message)}
}
async function discover(){
 const button=$("#epg-find-sources");button.disabled=true;
 status("Finding EPG sources that match this playlist's channel IDs…");
 try{
  const response=await fetch(API,{cache:"default"});
  if(!response.ok)throw Error("Guide directory unavailable (HTTP "+response.status+")");
  const list=await response.json();
  if(!Array.isArray(list))throw Error("Unexpected guide directory data");
  const current=new Set(channelsProvider().flatMap(keys));
  const sources=new Map();
  for(const item of list){
   if(!current.has(normalizeId(item.channel)))continue;
   for(const src of item.sources||[]){
    if(src.format&&String(src.format).toUpperCase()!=="XML")continue;
    const u=src.url;
    if(typeof u!=="string"||!u.startsWith("https://"))continue;
    const existing=sources.get(u)||{url:u,count:0,host:src.host||new URL(u).hostname};
    existing.count++;sources.set(u,existing);
   }
  }
  const matches=Array.from(sources.values()).sort((a,b)=>b.count-a.count).slice(0,60);
  const select=$("#epg-source-select");select.replaceChildren();
  for(const row of matches){const option=textNode("option",null,row.host+" · "+row.count+" matched channel mapping(s)");option.value=row.url;select.append(option)}
  $("#epg-discovery").hidden=!matches.length;
  if(!matches.length)status("No published EPG sources matched the channel IDs in this selection. You can still load an XMLTV URL or file.");
  else status("Found "+matches.length+" matching source(s). Choose one and select Use selected source. Some sources may not allow browser access.");
 }catch(error){status("Guide discovery failed: "+error.message+". You can still load an XMLTV URL or upload a file.")}
 finally{button.disabled=false}
}
function clearGuide(){
 if(activeLoad)activeLoad.abort();
 guide=new Map();loadedAt=null;loadedLabel="";
 $("#epg-loaded-count").textContent="Guide not loaded";
 status("TV guide cleared. Use public source discovery or import an XMLTV guide to see program schedules.");
 refreshChannels();
}
$("#epg-load-url").addEventListener("click",()=>loadUrl($("#epg-url").value.trim()));
$("#epg-file").addEventListener("change",event=>{const file=event.target.files?.[0];loadFile(file);event.target.value=""});
$("#epg-find-sources").addEventListener("click",discover);
$("#epg-load-selected").addEventListener("click",()=>{const url=$("#epg-source-select").value;if(url){$("#epg-url").value=url;loadUrl(url)}});
$("#epg-clear").addEventListener("click",clearGuide);
$("#epg-close").addEventListener("click",close);
$("#epg-dialog").addEventListener("cancel",event=>{event.preventDefault();close()});
$("#epg-watch-channel").addEventListener("click",()=>{const c=focused;if(c){close();watchChannel(c)}});
window.MovieBoxGuide={getSummary,paintChannel,show,configure(options){channelsProvider=options.channels;watchChannel=options.watch;refreshChannels=options.render},loaded(){return !!loadedAt},guideName(){return loadedLabel}};
})();