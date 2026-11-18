(()=>{
"use strict";
const ROOT="https://iptv-org.github.io/iptv/";
const countries=[["us","United States"],["in","India"],["gb","United Kingdom"],["ca","Canada"],["au","Australia"],["pk","Pakistan"],["bd","Bangladesh"],["ae","United Arab Emirates"],["sa","Saudi Arabia"],["np","Nepal"],["lk","Sri Lanka"],["de","Germany"],["fr","France"],["es","Spain"],["it","Italy"],["br","Brazil"],["mx","Mexico"],["jp","Japan"],["kr","South Korea"],["cn","China"],["tr","Turkey"],["za","South Africa"],["ng","Nigeria"],["ph","Philippines"],["id","Indonesia"],["sg","Singapore"],["nz","New Zealand"],["ru","Russia"]];
const categories=["animation","auto","business","classic","comedy","cooking","culture","documentary","education","entertainment","family","general","kids","legislative","lifestyle","movies","music","news","outdoor","relax","religious","science","series","shop","sports","travel","weather"];
const $=s=>document.querySelector(s);
const valid=s=>{try{const u=new URL(s);return ["https:","http:"].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password}catch{return false}};
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const KEY="moviebox-live-favorites-v1";
const HEALTH_KEY="moviebox-live-source-health-v1";
const HEALTH_TTL=14*24*60*60*1000;
const FAILURE_COOLDOWN=30*60*1000;
const HEALTH_MAX=1200;
let health={};
try{const value=JSON.parse(localStorage.getItem(HEALTH_KEY)||"{}");if(value&&typeof value==="object"&&!Array.isArray(value))health=value}catch{}
function sourceKey(url){return url}
function stats(url){const item=health[sourceKey(url)];return item&&Number.isFinite(item.at)&&Date.now()-item.at<HEALTH_TTL?item:null}
function recordSource(url,ok){
 const previous=stats(url)||{ok:0,fail:0};
 health[sourceKey(url)]={ok:Math.min(99,(previous.ok||0)+(ok?1:0)),fail:ok?0:Math.min(99,(previous.fail||0)+1),last:ok?"success":"failed",at:Date.now()};
 const entries=Object.entries(health).filter(([,value])=>value&&Number.isFinite(value.at)&&Date.now()-value.at<HEALTH_TTL).sort((a,b)=>b[1].at-a[1].at).slice(0,HEALTH_MAX);
 health=Object.fromEntries(entries);
 try{localStorage.setItem(HEALTH_KEY,JSON.stringify(health))}catch{}
}
function channelHealth(c){
 const item=stats(c.url);if(!item)return ["Not tested","unknown"];
 if(item.last==="success")return ["Played here","working"];
 if(item.last==="failed")return ["Failed recently","failed"];
 return ["Not tested","unknown"];
}
let favorites={};try{const saved=JSON.parse(localStorage.getItem(KEY)||"{}");if(saved&&typeof saved==="object"&&!Array.isArray(saved))favorites=saved}catch{}
let channelSources=[],channels=[],state={source:"country",selected:"us",query:"",page:1,httpsOnly:false},active=null,controller=null,hls=null,requestId=0,playAttempt=0,playTimeout=null,attemptedSources=new Set();
const PAGE=48;
const homeChannelParam=new URLSearchParams(location.search).get("channel");
let homeChannelOpened=false;
function handleHomeChannelLink(){
 if(!homeChannelParam||homeChannelOpened||!channels.length)return;
 const needle=homeChannelParam.trim().toLowerCase();
 const match=channels.find(c=>c.id?.toLowerCase()===needle||c.title.toLowerCase()===needle);
 if(match){homeChannelOpened=true;open(match);return}
 const saved=Object.values(favorites).find(c=>c&&typeof c.title==="string"&&(c.id?.toLowerCase()===needle||c.title.toLowerCase()===needle));
 if(saved){homeChannelOpened=true;open(saved)}
}

function persist(){try{localStorage.setItem(KEY,JSON.stringify(favorites))}catch{setStatus("Browser storage is full; favorites may not be saved.")}}
const key=c=>c.id||c.url;
const isSaved=c=>!!favorites[key(c)];
function setStatus(message){$("#live-status").textContent=message}
function stopVideo(){
 clearTimeout(playTimeout);playTimeout=null;
 const video=$("#live-video");video.onplay=null;video.onplaying=null;video.onwaiting=null;video.ontimeupdate=null;video.onerror=null;video.pause();
 if(hls){hls.destroy();hls=null}
 video.removeAttribute("src");video.load();
}
function parsePlaylist(text){
 if(!text.startsWith("#EXTM3U")&&!text.trimStart().startsWith("#EXTM3U"))throw Error("This playlist was not valid M3U data.");
 const list=[];let meta=null;const seen=new Set();
 for(const raw of text.replace(/^\uFEFF/,"").split(/\r?\n/)){
  const line=raw.trim();
  if(line.startsWith("#EXTINF:")){
   const attrs={};const re=/([\w-]+)="([^"]*)"/g;let m;
   while((m=re.exec(line))!==null)attrs[m[1]]=m[2];
   const comma=line.indexOf(",");
   const title=(attrs["tvg-name"]|| (comma>=0?line.slice(comma+1):"")||"Unnamed channel").trim();
   meta={title,group:attrs["group-title"]||"",logo:attrs["tvg-logo"]||"",id:attrs["tvg-id"]||"",language:attrs["tvg-language"]||"",country:attrs["tvg-country"]||""};
  }else if(line&&!line.startsWith("#")){
   if(meta&&valid(line)&&!seen.has(line)){
    seen.add(line);
    list.push({...meta,url:line});
   }
   meta=null;
  }
 }
 return list;
}
function playlist(){
 if(state.source==="world")return ROOT+"index.m3u";
 if(state.source==="category")return ROOT+"categories/"+state.selected+".m3u";
 return ROOT+"countries/"+state.selected+".m3u";
}
function options(){
 const picker=$("#live-selection"),wrap=$("#live-selection-wrap");
 picker.replaceChildren();
 wrap.hidden=state.source==="saved"||state.source==="world";
 if(wrap.hidden)return;
 const opts=state.source==="country"?countries:categories.map(v=>[v,v.charAt(0).toUpperCase()+v.slice(1)]);
 wrap.querySelector("label").textContent=state.source==="country"?"Country":"Category";
 for(const [value,name] of opts){const o=el("option",null,name);o.value=value;picker.append(o)}
 if(!opts.some(x=>x[0]===state.selected))state.selected=state.source==="country"?"us":"news";
 picker.value=state.selected;
}
async function load(force=false){
 requestId++;const rid=requestId;
 if(controller)controller.abort();
 controller=new AbortController();
 channels=[];state.page=1;render();
 if(state.source==="saved"){setStatus("Saved channels on this device.");channels=Object.values(favorites);window.MovieBoxGuide?.updateMatches();render();handleHomeChannelLink();return}
 const link=playlist();setStatus("Fetching live channels from iptv-org…");
 try{
  // Load at most 45 MB, on demand. Default country is intentionally small.
  const response=await fetch(link,{signal:controller.signal,cache:force?"reload":"default"});
  if(!response.ok)throw Error("Playlist request failed (HTTP "+response.status+")");
  const length=Number(response.headers.get("content-length")||0);
  if(length>45e6)throw Error("This playlist is too large for browser mode. Choose a country or category.");
  const text=await response.text();
  if(text.length>45e6)throw Error("Playlist too large. Choose a country or category.");
  const parsed=parsePlaylist(text);
  if(rid!==requestId)return;
  channels=parsed;
  window.MovieBoxGuide?.updateMatches();
  render();
  handleHomeChannelLink();
 }catch(e){
  if(e.name==="AbortError"||rid!==requestId)return;
  setStatus("Unable to load the public playlist: "+e.message+". Some network filters or CORS settings may block this request. Try a different country/category.");
  $("#live-results").replaceChildren();
 }
}
function visible(){
 const source=state.source==="saved"?Object.values(favorites):channels;
 const httpsFiltered=state.httpsOnly?source.filter(c=>c.url.startsWith("https:")):source;
 const q=state.query.trim().toLowerCase();
 return q?httpsFiltered.filter(c=>(c.title+" "+c.group+" "+c.country+" "+c.language).toLowerCase().includes(q)):httpsFiltered;
}
function render(){
 const list=visible();
 const total=Math.ceil(list.length/PAGE);
 state.page=Math.min(Math.max(state.page,1),Math.max(total,1));
 const start=(state.page-1)*PAGE,view=list.slice(start,start+PAGE);
 const dest=$("#live-results");dest.replaceChildren();
 $("#live-count").textContent=list.length.toLocaleString()+" channels";
 $("#live-heading").textContent=state.source==="saved"?"Favorite channels":state.source==="world"?"Worldwide channels":(state.source==="country"?countries.find(x=>x[0]===state.selected)?.[1]||"Country":state.selected.charAt(0).toUpperCase()+state.selected.slice(1))+" channels";
 if(!list.length){
  const msg=el("div","live-empty",state.source==="saved"?"No favorites yet. Choose a country and save channels you like.":channels.length?"No channels match your search.":"No channels to show yet.");
  dest.append(msg);
 }else{
  for(const c of view){
   const card=el("article","live-channel");
   const head=el("div","live-channel-head");
   const imgWrap=el("div","live-channel-logo");
   if(c.logo&&valid(c.logo)&&c.logo.startsWith("https:")){
    const img=el("img");img.src=c.logo;img.loading="lazy";img.alt="";img.referrerPolicy="no-referrer";img.onerror=()=>img.remove();imgWrap.append(img);
   }else imgWrap.textContent="▣";
   head.append(imgWrap);
   const titles=el("div","live-channel-title");
   titles.append(el("strong",null,c.title));
   titles.append(el("span",null,(c.group||c.language||"Live TV")+(c.url.startsWith("https:")?" · HTTPS":" · HTTP / VLC")));
   const [statusName,statusClass]=channelHealth(c);
   const badge=el("span","live-channel-health live-health-"+statusClass,statusName);
   badge.title="Local browser observation only; not a live channel uptime check.";
   titles.append(badge);
   if(window.MovieBoxGuide?.loaded()){
    const snippet=el("div","live-epg-brief");
    window.MovieBoxGuide.paintChannel(c,snippet);
    titles.append(snippet);
   }
   head.append(titles);
   card.append(head);
   const foot=el("div","live-channel-actions");
   const play=el("button","live-play","▶ Watch");play.type="button";play.addEventListener("click",()=>open(c));
   const fav=el("button","live-star",isSaved(c)?"♥":"♡");fav.type="button";fav.title=isSaved(c)?"Remove favorite":"Save favorite";
   fav.setAttribute("aria-label",fav.title);
   fav.addEventListener("click",()=>{
    if(isSaved(c))delete favorites[key(c)];else favorites[key(c)]=c;
    persist();render();
   });
   const guideButton=el("button","live-guide-button","▦ Guide");
   guideButton.type="button";guideButton.addEventListener("click",()=>window.MovieBoxGuide?.show(c));
   foot.append(play,guideButton,fav);card.append(foot);dest.append(card);
  }
 }
 setStatus(list.length?list.length.toLocaleString()+" channel streams listed · "+(start+1)+"–"+Math.min(start+PAGE,list.length)+" shown · Availability not guaranteed":state.source==="saved"?"Favorites are stored only in this browser.":channels.length?"No matching channels.":"No channel streams in this selection.");
 const paging=$("#live-pagination");paging.hidden=total<=1;$("#live-page").textContent="Page "+state.page+" of "+total;$("#live-prev").disabled=state.page===1;$("#live-next").disabled=state.page>=total;
}
function playerStatus(msg){$("#live-player-status").textContent=msg}
function matchingSources(c){
 const same=channels.filter(x=>(c.id&&x.id===c.id)||(!c.id&&!x.id&&x.title===c.title));
 const seen=new Set();
 const list=[c,...same].filter(x=>{if(!valid(x.url)||seen.has(x.url))return false;seen.add(x.url);return true});
 const rank=x=>{
  const item=stats(x.url);
  const https=x.url.startsWith("https:")?200:0;
  const success=item?.last==="success"?150:0;
  const recentFail=item?.last==="failed"&&Date.now()-item.at<FAILURE_COOLDOWN?-170:0;
  return https+success+recentFail;
 };
 return list.sort((a,b)=>rank(b)-rank(a));
}
function tryNextBrowserSource(failedIndex,reason){
 if(!active||!$("#live-player").open)return;
 const candidates=channelSources.map((c,i)=>({c,i})).filter(({c,i})=>i!==failedIndex&&c.url.startsWith("https:")&&!attemptedSources.has(i));
 const best=candidates.find(({c})=>{const h=stats(c.url);return !h||h.last!=="failed"||Date.now()-h.at>=FAILURE_COOLDOWN;})||candidates[0];
 const next=best?best.i:-1;
 if(next!==-1){
  playerStatus(reason+" Trying alternate HTTPS source "+(next+1)+" of "+channelSources.length+"…");
  selectSource(next,true);
 }else{
  playerStatus(reason+" No more HTTPS sources for this channel. It may be offline, blocked by CORS, restricted, or use an unsupported codec. Try again later or select a different channel.");
 }
}
function selectSource(index,automatic=false){
 if(!channelSources[index])return;
 const source=channelSources[index];active=source;
 const current=++playAttempt;
 if(!automatic)attemptedSources.clear();
 attemptedSources.add(index);
 $("#live-mirror").value=String(index);
 $("#live-player-meta").textContent=[active.group,active.country,active.language].filter(Boolean).join(" · ");
 $("#live-favorite").textContent=isSaved(active)?"♥ Saved":"♡ Save channel";
 stopVideo();
 const u=new URL(active.url),video=$("#live-video");
 const suffix=channelSources.length>1?" (source "+(index+1)+" of "+channelSources.length+")":"";
 if(u.protocol==="http:"){
  playerStatus("This channel uses HTTP"+suffix+". Browsers block HTTP video on HTTPS sites. Select an HTTPS source if available; otherwise browser playback isn't possible for this listing.");
  return;
 }
 const fail=(message)=>{
  if(playAttempt!==current||!$("#live-player").open||source.url!==active?.url)return;
  clearTimeout(playTimeout);
  recordSource(source.url,false);
  tryNextBrowserSource(index,message);
 };
 const success=()=>{
  if(playAttempt!==current||source.url!==active?.url)return;
  clearTimeout(playTimeout);
  recordSource(source.url,true);
  playerStatus("Live playback connected"+suffix+". This browser will prioritize working sources next time.");
  render();
 };
 video.onplay=()=>{if(playAttempt===current&&!playTimeout){playTimeout=setTimeout(()=>fail("The channel did not start after playback was requested."),15000)}};
 video.onplaying=()=>{success();video.onwaiting=()=>{
   if(playAttempt!==current||video.paused)return;
   clearTimeout(playTimeout);
   playTimeout=setTimeout(()=>fail("Playback stalled and did not recover."),15000);
  };
 };
 video.ontimeupdate=()=>{if(playAttempt===current&&video.readyState>=3){clearTimeout(playTimeout);playTimeout=null}};
 video.onerror=()=>fail("The stream could not be decoded or loaded.");
 playTimeout=setTimeout(()=>fail("The channel did not start within 15 seconds."),15000);
 const maybeHls=/\.m3u8(?:$|[?#])/i.test(u.pathname+u.search);
 if(maybeHls&&window.Hls?.isSupported()){
  try{
   hls=new window.Hls({enableWorker:true,maxBufferLength:25,liveSyncDurationCount:3});
   hls.on(window.Hls.Events.ERROR,(_,event)=>{
    if(event.fatal)fail("The HLS stream could not be loaded in this browser.");
   });
   hls.on(window.Hls.Events.MANIFEST_PARSED,()=>{
    if(current!==playAttempt)return;
    video.play().catch(error=>{if(error?.name==="NotAllowedError"){clearTimeout(playTimeout);playTimeout=null;playerStatus("Press Play to start the channel"+suffix+"; autoplay is blocked by your browser.")}else playerStatus("Select Play to start the channel"+suffix+".")});
   });
   hls.attachMedia(video);
   hls.loadSource(source.url);
   playerStatus("Loading HLS broadcast"+suffix+"…");
  }catch{fail("The HLS player could not start.")}
 }else{
  video.src=source.url;video.load();
  video.play().catch(error=>{if(error?.name==="NotAllowedError"){clearTimeout(playTimeout);playTimeout=null;playerStatus("Press Play to start the channel"+suffix+"; autoplay is blocked by your browser.")}else playerStatus("Select Play to start the channel"+suffix+"; the stream may require user interaction.")});
  playerStatus("Connecting to channel"+suffix+"…");
 }
}
function open(c){
 channelSources=matchingSources(c);
 attemptedSources.clear();
 if(!channelSources.length)return;
 $("#live-player-title").textContent=c.title;
 const picker=$("#live-mirror"),wrapper=$("#live-mirror-picker");
 picker.replaceChildren();
 wrapper.hidden=channelSources.length<2;
 for(const [i,item] of channelSources.entries()){
  const option=el("option",null,"Source "+(i+1)+" · "+(new URL(item.url).hostname)+(item.url.startsWith("http:")?" · HTTP":" · HTTPS"));
  option.value=String(i);picker.append(option);
 }
 $("#live-player").showModal();
 selectSource(0);
}
function close(){++playAttempt;stopVideo();active=null;channelSources=[];attemptedSources.clear();$("#live-player").close()}
function openVLC(){
 if(!active)return;
 const u=active.url,ua=navigator.userAgent||"";
 if(/iPhone|iPad|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)){
  location.href="vlc-x-callback://x-callback-url/stream?url="+encodeURIComponent(u);
 }else if(/Android/i.test(ua)){
  if(navigator.share)navigator.share({url:u,title:active.title}).catch(()=>playerStatus("Share cancelled. Use Copy URL if VLC did not open."));
  else copyURL();
 }else{
  playerStatus("Requesting desktop VLC launch. Approve the browser's prompt if displayed. Windows requires the one-time MovieBox VLC launcher.");
  location.href="movieboxvlc://open?url="+encodeURIComponent(u);
 }
}
async function copyURL(){
 if(!active)return;
 try{await navigator.clipboard.writeText(active.url);playerStatus("Copied stream URL. Paste into VLC → Open Network Stream.")}
 catch{playerStatus("Clipboard unavailable. Try selecting Copy URL in a secure browser.")}
}
$("#live-source").addEventListener("change",e=>{
 state.source=e.target.value;state.selected=state.source==="category"?"news":"us";state.query="";$("#live-query").value="";options();load();
});
$("#live-selection").addEventListener("change",e=>{state.selected=e.target.value;load()});
$("#live-query").addEventListener("input",e=>{state.query=e.target.value;state.page=1;render()});
$("#live-https-only").addEventListener("change",e=>{state.httpsOnly=e.target.checked;state.page=1;render()});
$("#live-refresh").addEventListener("click",()=>load(true));
$("#live-reset-health").addEventListener("click",()=>{if(!confirm("Clear playback success/failure history on this device?"))return;health={};try{localStorage.removeItem(HEALTH_KEY)}catch{}render();setStatus("Playback status history cleared on this device.")});
$("#live-prev").addEventListener("click",()=>{if(state.page>1){state.page--;render();scrollTo({top:260,behavior:"smooth"})}});
$("#live-next").addEventListener("click",()=>{state.page++;render();scrollTo({top:260,behavior:"smooth"})});
$("#live-mirror").addEventListener("change",e=>selectSource(Number(e.target.value)));
$("#live-next-source").addEventListener("click",()=>{if(!channelSources.length)return;const next=(Number($("#live-mirror").value)+1)%channelSources.length;selectSource(next)});
$("#live-close").addEventListener("click",close);
$("#live-player").addEventListener("cancel",e=>{e.preventDefault();close()});
$("#live-vlc").addEventListener("click",openVLC);
$("#live-copy").addEventListener("click",copyURL);
$("#live-favorite").addEventListener("click",()=>{if(!active)return;if(isSaved(active))delete favorites[key(active)];else favorites[key(active)]=active;persist();$("#live-favorite").textContent=isSaved(active)?"♥ Saved":"♡ Save channel";if(state.source==="saved")render()});

if(window.MovieBoxGuide)window.MovieBoxGuide.configure({channels:()=>state.source==="saved"?Object.values(favorites):channels,watch:open,render});
options();load();
})();