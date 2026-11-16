(()=>{
"use strict";
const ROOT="https://iptv-org.github.io/iptv/";
const countries=[["us","United States"],["in","India"],["gb","United Kingdom"],["ca","Canada"],["au","Australia"],["pk","Pakistan"],["bd","Bangladesh"],["ae","United Arab Emirates"],["sa","Saudi Arabia"],["np","Nepal"],["lk","Sri Lanka"],["de","Germany"],["fr","France"],["es","Spain"],["it","Italy"],["br","Brazil"],["mx","Mexico"],["jp","Japan"],["kr","South Korea"],["cn","China"],["tr","Turkey"],["za","South Africa"],["ng","Nigeria"],["ph","Philippines"],["id","Indonesia"],["sg","Singapore"],["nz","New Zealand"],["ru","Russia"]];
const categories=["animation","auto","business","classic","comedy","cooking","culture","documentary","education","entertainment","family","general","kids","legislative","lifestyle","movies","music","news","outdoor","relax","religious","science","series","shop","sports","travel","weather"];
const $=s=>document.querySelector(s);
const valid=s=>{try{const u=new URL(s);return ["https:","http:"].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password}catch{return false}};
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const KEY="moviebox-live-favorites-v1";
let favorites={};try{const saved=JSON.parse(localStorage.getItem(KEY)||"{}");if(saved&&typeof saved==="object"&&!Array.isArray(saved))favorites=saved}catch{}
let channelSources=[],channels=[],state={source:"country",selected:"us",query:"",page:1},active=null,controller=null,hls=null,requestId=0;
const PAGE=48;
function persist(){try{localStorage.setItem(KEY,JSON.stringify(favorites))}catch{setStatus("Browser storage is full; favorites may not be saved.")}}
const key=c=>c.id||c.url;
const isSaved=c=>!!favorites[key(c)];
function setStatus(message){$("#live-status").textContent=message}
function stopVideo(){
 const video=$("#live-video");video.pause();
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
 if(state.source==="saved"){setStatus("Saved channels on this device.");channels=Object.values(favorites);render();return}
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
  render();
 }catch(e){
  if(e.name==="AbortError"||rid!==requestId)return;
  setStatus("Unable to load the public playlist: "+e.message+". Some network filters or CORS settings may block this request. Try a different country/category.");
  $("#live-results").replaceChildren();
 }
}
function visible(){
 const source=state.source==="saved"?Object.values(favorites):channels;
 const q=state.query.trim().toLowerCase();
 return q?source.filter(c=>(c.title+" "+c.group+" "+c.country+" "+c.language).toLowerCase().includes(q)):source;
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
   titles.append(el("span",null,c.group||c.language||"Live TV"));
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
   foot.append(play,fav);card.append(foot);dest.append(card);
  }
 }
 setStatus(list.length?list.length.toLocaleString()+" channel streams listed · "+(start+1)+"–"+Math.min(start+PAGE,list.length)+" shown · Availability not guaranteed":state.source==="saved"?"Favorites are stored only in this browser.":channels.length?"No matching channels.":"No channel streams in this selection.");
 const paging=$("#live-pagination");paging.hidden=total<=1;$("#live-page").textContent="Page "+state.page+" of "+total;$("#live-prev").disabled=state.page===1;$("#live-next").disabled=state.page>=total;
}
function playerStatus(msg){$("#live-player-status").textContent=msg}
function matchingSources(c){
 const same=channels.filter(x=>(c.id&&x.id===c.id)||(!c.id&&!x.id&&x.title===c.title));
 const ordered=[c,...same];
 const seen=new Set();
 return ordered.filter(x=>{if(!valid(x.url)||seen.has(x.url))return false;seen.add(x.url);return true});
}
function selectSource(index){
 if(!channelSources[index])return;
 active=channelSources[index];
 $("#live-mirror").value=String(index);
 $("#live-player-meta").textContent=[active.group,active.country,active.language].filter(Boolean).join(" · ");
 $("#live-favorite").textContent=isSaved(active)?"♥ Saved":"♡ Save channel";
 stopVideo();
 const u=new URL(active.url),video=$("#live-video");
 const suffix=channelSources.length>1?" · Source "+(index+1)+" of "+channelSources.length:"";
 if(u.protocol==="http:"){playerStatus("HTTP source"+suffix+": this HTTPS page cannot embed it. Choose Open in VLC or Copy URL. If VLC cannot open it, try the next source.");return}
 const maybeHls=/\.m3u8(?:$|[?#])/i.test(u.pathname+u.search);
 if(maybeHls&&window.Hls?.isSupported()){
  try{
   hls=new window.Hls({enableWorker:true,maxBufferLength:25,liveSyncDurationCount:3});
   hls.loadSource(active.url);hls.attachMedia(video);
   hls.on(window.Hls.Events.MANIFEST_PARSED,()=>video.play().catch(()=>playerStatus("Select Play to start streaming"+suffix+".")));
   hls.on(window.Hls.Events.ERROR,(_,event)=>{if(event.fatal)playerStatus("Source failed in browser. Try another source or VLC; the stream may be offline or CORS-blocked.")});
   playerStatus("Connecting to live stream"+suffix+"…");
  }catch{playerStatus("Unable to prepare browser playback. Try another source or VLC.")}
 }else{
  video.src=active.url;video.load();
  video.play().catch(()=>playerStatus("Select Play or try a different source or VLC."));
  playerStatus(maybeHls?"Browser HLS support unavailable. Try VLC.":"Trying native browser playback"+suffix+". VLC may support more formats.");
 }
}
function open(c){
 channelSources=matchingSources(c);
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
function close(){stopVideo();active=null;channelSources=[];$("#live-player").close()}
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
function openFullPlaylistVLC(){
 const playlistUrl=ROOT+"index.m3u";
 const ua=navigator.userAgent||"";
 const message=$("#live-full-playlist-status");
 if(/iPhone|iPad|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)){
  message.textContent="Requesting VLC to open the complete channel playlist. If VLC does not open, use the Playlist URL link.";
  location.href="vlc-x-callback://x-callback-url/stream?url="+encodeURIComponent(playlistUrl);
 }else if(/Android/i.test(ua)){
  message.textContent="Choose VLC when prompted. If VLC isn't offered, use the Playlist URL link or VLC's Open Network Stream feature.";
  if(navigator.share)navigator.share({url:playlistUrl,title:"iptv-org full live TV playlist"}).catch(()=>{});
  else location.href=playlistUrl;
 }else{
  message.textContent="Launching the full iptv-org playlist in VLC. Approve your browser's external-app prompt if one appears.";
  location.href="movieboxvlc://open?url="+encodeURIComponent(playlistUrl);
 }
}
$("#live-open-all-vlc").addEventListener("click",openFullPlaylistVLC);
$("#live-source").addEventListener("change",e=>{
 state.source=e.target.value;state.selected=state.source==="category"?"news":"us";state.query="";$("#live-query").value="";options();load();
});
$("#live-selection").addEventListener("change",e=>{state.selected=e.target.value;load()});
$("#live-query").addEventListener("input",e=>{state.query=e.target.value;state.page=1;render()});
$("#live-refresh").addEventListener("click",()=>load(true));
$("#live-prev").addEventListener("click",()=>{if(state.page>1){state.page--;render();scrollTo({top:260,behavior:"smooth"})}});
$("#live-next").addEventListener("click",()=>{state.page++;render();scrollTo({top:260,behavior:"smooth"})});
$("#live-mirror").addEventListener("change",e=>selectSource(Number(e.target.value)));
$("#live-next-source").addEventListener("click",()=>{if(!channelSources.length)return;const next=(Number($("#live-mirror").value)+1)%channelSources.length;selectSource(next)});
$("#live-close").addEventListener("click",close);
$("#live-player").addEventListener("cancel",e=>{e.preventDefault();close()});
$("#live-vlc").addEventListener("click",openVLC);
$("#live-copy").addEventListener("click",copyURL);
$("#live-favorite").addEventListener("click",()=>{if(!active)return;if(isSaved(active))delete favorites[key(active)];else favorites[key(active)]=active;persist();$("#live-favorite").textContent=isSaved(active)?"♥ Saved":"♡ Save channel";if(state.source==="saved")render()});
$("#live-video").addEventListener("error",()=>{if(active)playerStatus("This stream cannot play directly in your browser. Try VLC or another channel.")});
options();load();
})();