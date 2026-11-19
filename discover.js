(()=>{
"use strict";
const API="https://moviebox-web-api.onrender.com";
const STORE="moviebox-rust-watchlist-v1";
const TOKEN_STORE="moviebox-private-api-token-v1";
let sessionToken="";
const $=s=>document.querySelector(s);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean=x=>String(x||"").replace(/<[^>]*>/g,"").trim();
const validImage=u=>/^https:\/\//i.test(String(u||""))?u:"";
let saved={};try{const v=JSON.parse(localStorage.getItem(STORE)||"{}");saved=v&&typeof v==="object"&&!Array.isArray(v)?v:{}}catch{}
let results=[],showSaved=false,seq=0,page=1,lastQuery="",request=null,lastCount=0;
let selectedTitle=null,selectedDetails=null,selectedUrl="",sourceAbort=null,playerHls=null,playerSource=null;
const suggestedItems=new Map();
const normalize=x=>({id:String(x.id?.value||""),provider:String(x.id?.provider||"moviebox"),title:String(x.title||"Untitled"),year:String(x.year||"—"),type:x.media_type==="series"?"TV Show":"Movie",image:validImage(x.poster_url),description:String(x.description||""),seasons:Array.isArray(x.seasons)?x.seasons:[],genres:Array.isArray(x.genres)?x.genres:[],rating:x.imdb_rating||"",duration:x.duration||""});
const key=x=>x.provider+":"+x.id;
function save(){try{localStorage.setItem(STORE,JSON.stringify(saved));window.dispatchEvent(new Event("moviebox:changed"))}catch{alert("Cannot save: browser storage is full.")}count();}
function count(){$("#saved-count").textContent=Object.keys(saved).length}
function status(message){$("#status").textContent=message}
function activeItems(){return showSaved?Object.values(saved):results.filter(x=>(x.type==="Movie"&&$("#movies").checked)||(x.type==="TV Show"&&$("#series").checked))}
function render(){
 const items=activeItems();
 $("#results-title").textContent=showSaved?"My watchlist":"MovieBox search results";
 if(showSaved)status(items.length+" saved title"+(items.length===1?"":"s"));
 else if(results.length)status(items.length+" matching title"+(items.length===1?"":"s")+" · Page "+page);
 else if(!lastQuery)status("Enter a title above to search the MovieBox provider.");
 const currentProvider=$("#provider").value;
 $("#results").innerHTML=items.map(x=>'<article class="discover-card"><div class="discover-poster">'+(x.image?'<img loading="lazy" referrerpolicy="no-referrer" src="'+esc(x.image)+'" alt="Poster for '+esc(x.title)+'">':"▶")+'</div><div class="discover-card-body"><h3>'+esc(x.title)+'</h3><p>'+esc(x.type)+' · '+esc(x.year)+'</p><div class="discover-card-actions"><button data-detail="'+esc(key(x))+'">Details</button><button class="'+(saved[key(x)]?"saved":"")+'" data-save="'+esc(key(x))+'">'+(saved[key(x)]?"♥ Saved":"♡ Save")+'</button></div></div></article>').join("")||'<div class="discover-message">'+(showSaved?"No saved titles yet.":"No matching titles to display.")+'</div>';
 $("#pager").hidden=showSaved||!lastQuery;
 $("#page-number").textContent="Page "+page;
 $("#prev-page").disabled=page<=1;
 $("#next-page").disabled=lastCount===0;
}
async function requestJSON(path, signal){
 const response=await fetch(API+path,{headers:{Accept:"application/json"},signal});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(body.error?.message||"API error "+response.status);
 return body;
}
async function search(q,targetPage=1){
 q=q.trim();if(q.length<2)return;
 if(request)request.abort();
 request=new AbortController();
 const signal=request.signal,call=++seq;
 showSaved=false;$("#saved-filter").classList.remove("selected");
 lastQuery=q;page=targetPage;results=[];lastCount=0;
 $("#results-title").textContent="MovieBox search results";
 $("#results").innerHTML='<div class="discover-message">Searching MovieBox provider…</div>';
 $("#pager").hidden=true;status("Contacting the Rust backend…");
 try{
  const data=await requestJSON("/api/search?provider="+encodeURIComponent($("#provider").value)+"&query="+encodeURIComponent(q)+"&page="+page,signal);
  if(call!==seq)return;
  const raw=Array.isArray(data.items)?data.items:[];
  results=raw.map(normalize).filter(x=>x.id);
  lastCount=raw.length;
  render();
  if(!raw.length)status("No matches found on this page.");
 }catch(e){if(e.name==="AbortError"||call!==seq)return;results=[];$("#results").innerHTML='<div class="discover-message">Search failed: '+esc(e.message)+'. Retry shortly if Render is starting up.</div>';status("MovieBox API could not complete the search.");$("#pager").hidden=true;}
}
function findItem(id){return results.find(x=>key(x)===id)||saved[id]||suggestedItems.get(id)}
async function detail(id,goStraightToWatch=false){
 const x=findItem(id);if(!x)return;
 $("#detail-title").textContent=x.title;
 const box=$("#detail-content");
 box.innerHTML='<p class="form-help">Fetching details from MovieBox…</p>';
 if(!goStraightToWatch)$("#detail").showModal();
 try{
  const data=await requestJSON("/api/details?provider="+encodeURIComponent(x.provider)+"&id="+encodeURIComponent(x.id));
  if(!goStraightToWatch&&!$("#detail").open)return;
  const d=data.item||{},genres=Array.isArray(d.genres)?d.genres:[],seasons=Array.isArray(d.seasons)?d.seasons:[],image=validImage(d.poster_url||x.image);
  const seasonHtml=seasons.length?'<h3>Seasons & episodes</h3><div class="season-list">'+seasons.map(s=>'<details><summary>Season '+esc(s.number)+' · '+(Array.isArray(s.episodes)?s.episodes.length:0)+' episodes</summary><ul>'+(Array.isArray(s.episodes)?s.episodes.map(ep=>'<li>Episode '+esc(ep.number)+': '+esc(ep.title||"Untitled")+'</li>').join(""):"")+'</ul></details>').join("")+'</div>':"";
  selectedTitle=x;selectedDetails=d;
  if(goStraightToWatch){openWatch(true);return;}
  box.innerHTML='<div class="detail-layout"><div>'+(image?'<img referrerpolicy="no-referrer" src="'+esc(image)+'" alt="">':"")+'</div><div><div class="detail-meta">'+esc(x.type)+' · '+esc(d.year||x.year)+(d.imdb_rating?' · ★ '+esc(d.imdb_rating):"")+'</div>'+(d.tagline?'<h3>'+esc(d.tagline)+'</h3>':"")+'<p>'+esc(clean(d.description)||"No description available.")+'</p><p>'+esc(genres.join(", "))+(d.duration?" · "+esc(d.duration):"")+'</p>'+seasonHtml+'<button class="discover-button" type="button" id="watch-now">▶ Watch Now · Choose source</button><p class="form-help">Source lookup requires private API access. Browser and VLC playback depend on the returned URL.</p></div></div>';
 }catch(e){if(goStraightToWatch){status("Could not open Watch Now: "+e.message);return;}box.innerHTML='<p>Could not load provider details: '+esc(e.message)+'</p>';}
}

// Explore shelves are verified against the live MovieBox-TUI search catalog.
// Candidates are only displayed when MovieBox returns an exact title match.
// This does NOT claim that the title has a verified video stream.
const RECOMMENDATION_SEEDS={
 hollywood:["Project Hail Mary","Scream 7","Superman","F1 The Movie","Jurassic World Rebirth","The Fantastic Four First Steps"],
 bollywood:["Border 2","Alpha","Saiyaara","Dhurandhar","War 2","Drishyam 3"],
 series:["Stranger Things","Wednesday","The Boys","Panchayat","The Family Man","Kohrra"]
};
const RECO_STORAGE="moviebox-recommendations-v1";
const RECO_TTL=6*60*60*1000;
let recommendationSequence=0;
function normalizedTitle(title){
 return String(title||"").toLowerCase()
  .replace(/\[(?:hindi|english|tamil|telugu|dubbed)[^\]]*\]/gi,"")
  .replace(/\s*\((?:2025|2026)\)\s*$/,"")
  .replace(/[^a-z0-9]+/g," ").trim();
}
function candidateMatch(item,seed,category){
 if(!item.id||item.provider!=="moviebox"||normalizedTitle(item.title)!==normalizedTitle(seed))return false;
 if(category==="series")return item.type==="TV Show";
 if(item.type!=="Movie")return false;
 const year=Number.parseInt(item.year,10);
 return !Number.isFinite(year)||(year>=2025&&year<=2026);
}
function cachedRecommendations(){
 try{
  const data=JSON.parse(localStorage.getItem(RECO_STORAGE)||"null");
  if(data&&data.version===1&&Date.now()-data.cachedAt<RECO_TTL
    &&Object.keys(RECOMMENDATION_SEEDS).every(k=>Array.isArray(data.categories?.[k]))){
   return data.categories;
  }
 }catch{}
 return null;
}
function renderRecommendationSection(category,items,busy=false){
 const area=$("#reco-"+category);
 if(!area)return;
 area.replaceChildren();
 if(busy){
  const state=document.createElement("p");state.className="explore-reco-loading";
  state.textContent="Checking recent titles in MovieBox…";area.appendChild(state);return;
 }
 if(!items.length){
  const state=document.createElement("p");state.className="explore-reco-empty";
  state.textContent="No matching recent titles were returned by MovieBox right now. Try a search above.";
  area.appendChild(state);return;
 }
 for(const item of items){
  const id=key(item);
  suggestedItems.set(id,item);
  const card=document.createElement("article");card.className="explore-reco-card";
  const image=document.createElement("div");image.className="explore-reco-art";
  if(item.image){
   const poster=document.createElement("img");poster.src=item.image;poster.alt="";
   poster.loading="lazy";poster.referrerPolicy="no-referrer";image.appendChild(poster);
  }else{
   image.textContent=item.type==="TV Show"?"▤":"▶";
  }
  const body=document.createElement("div");body.className="explore-reco-card-body";
  const label=document.createElement("p");label.className="explore-reco-label";
  label.textContent=item.type+" · "+(item.year==="—"?"MovieBox catalog":item.year);
  const title=document.createElement("h4");title.textContent=item.title;
  const controls=document.createElement("div");controls.className="explore-reco-actions";
  const watch=document.createElement("button");watch.type="button";watch.className="explore-reco-watch";
  watch.textContent="▶ Watch Now";watch.dataset.recoWatch=id;
  watch.setAttribute("aria-label","Watch "+item.title);
  const details=document.createElement("button");details.type="button";details.className="explore-reco-details";
  details.textContent="Details";details.dataset.recoDetail=id;
  controls.append(watch,details);body.append(label,title,controls);card.append(image,body);area.append(card);
 }
}
async function findRecommendation(seed,category){
 const controller=new AbortController();
 const abortTimer=setTimeout(()=>controller.abort(),16000);
 try{
  const data=await requestJSON("/api/search?provider=moviebox&query="+encodeURIComponent(seed)+"&page=1",controller.signal);
  const list=Array.isArray(data.items)?data.items.map(normalize):[];
  return list.find(item=>candidateMatch(item,seed,category))||null;
 }finally{clearTimeout(abortTimer)}
}
async function loadRecommendations(force=false){
 const shelves=$("#explore-recommendations");
 if(!shelves)return;
 const generation=++recommendationSequence;
 const cached=!force&&cachedRecommendations();
 if(cached){
  for(const category of Object.keys(RECOMMENDATION_SEEDS)){
   const titles=cached[category].filter(x=>x&&typeof x.id==="string"&&typeof x.provider==="string");
   renderRecommendationSection(category,titles);
  }
  return;
 }
 const refresh=$("#recommendations-refresh");refresh.disabled=true;refresh.textContent="Refreshing…";
 const categories={};
 await Promise.all(Object.entries(RECOMMENDATION_SEEDS).map(async ([category,seeds])=>{
  renderRecommendationSection(category,[],true);
  const found=[],seen=new Set();
  for(const seed of seeds){
   if(generation!==recommendationSequence)return;
   try{
    const item=await findRecommendation(seed,category);
    if(item&&!seen.has(key(item))){found.push(item);seen.add(key(item))}
   }catch{}
   if(found.length>=4)break;
  }
  if(generation!==recommendationSequence)return;
  categories[category]=found;
  renderRecommendationSection(category,found);
 }));
 if(generation===recommendationSequence){
  if(Object.keys(categories).length===3&&Object.values(categories).some(list=>list.length>0)){
   try{localStorage.setItem(RECO_STORAGE,JSON.stringify({version:1,cachedAt:Date.now(),categories}))}catch{}
  }
  refresh.disabled=false;refresh.textContent="↻ Refresh";
 }
}
$("#explore-recommendations").addEventListener("click",async event=>{
 const button=event.target.closest("[data-reco-watch],[data-reco-detail]");
 if(!button||button.disabled)return;
 const id=button.dataset.recoWatch||button.dataset.recoDetail;
 button.disabled=true;
 const label=button.textContent;
 button.textContent=button.dataset.recoWatch?"Opening player…":"Opening details…";
 try{
  if(button.dataset.recoWatch)await detail(id,true);
  else await detail(id);
 }finally{
  button.disabled=false;button.textContent=label;
 }
});
$("#recommendations-refresh").addEventListener("click",()=>loadRecommendations(true));
loadRecommendations();

$("#discover-form").addEventListener("submit",e=>{e.preventDefault();search($("#q").value,1)});
$("#provider").addEventListener("change",()=>{if(lastQuery)search(lastQuery,1)});
$("#movies").addEventListener("change",render);$("#series").addEventListener("change",render);
$("#results").addEventListener("click",e=>{const b=e.target.closest("[data-detail],[data-save]");if(!b)return;const id=b.dataset.detail||b.dataset.save;if(b.dataset.detail){detail(id);return;}const x=findItem(id);if(!x)return;if(saved[id])delete saved[id];else saved[id]=x;save();render();});
$("#saved-filter").addEventListener("click",()=>{showSaved=!showSaved;$("#saved-filter").classList.toggle("selected",showSaved);render()});
$("#prev-page").addEventListener("click",()=>{if(page>1)search(lastQuery,page-1)});
$("#next-page").addEventListener("click",()=>{if(lastCount)search(lastQuery,page+1)});
$("#detail-close").addEventListener("click",()=>$("#detail").close());
$("#detail").addEventListener("click",e=>{if(e.target===$("#detail"))$("#detail").close()});

function validStream(url){
 try{
  const u=new URL(url);
  return (u.protocol==="https:"||u.protocol==="http:")&&!u.username&&!u.password;
 }catch{return false}
}
function browserCompatibleURL(url){
 try{return new URL(url).protocol==="https:"}catch{return false}
}
function setWatchStatus(msg){$("#watch-status").textContent=msg}
function haltVideo(){
 const v=$("#watch-video");v.pause();
 if(playerHls){playerHls.destroy();playerHls=null}
 v.removeAttribute("src");v.load();v.hidden=true;
}
function clearStream(){
 selectedUrl="";playerSource=null;haltVideo();
 $("#watch-vlc").disabled=true;$("#watch-copy").disabled=true;
 $("#watch-play").disabled=true;$("#watch-fullscreen").disabled=true;
}
function isHlsStream(url){
 try{const u=new URL(url);return u.pathname.toLowerCase().endsWith(".m3u8")}catch{return false}
}
function movieLinkInfo(url){
 try{
  const u=new URL(url);
  const hevc=/(?:^|\/)h265(?:\/|$)/i.test(u.pathname)||/(?:hevc|h265)/i.test(u.searchParams.get("codec")||"");
  // Some providers use t as an expiry timestamp. Treat it as an indicator, not a guarantee.
  const timestamp=u.searchParams.get("t")||"";
  const expires=/^1\d{9}$/.test(timestamp)?Number(timestamp)*1000:null;
  const expired=expires!==null&&expires<Date.now();
  return {hevc,expires,expired};
 }catch{return {hevc:false,expires:null,expired:false}}
}
function hevcSupport(){
 const video=$("#watch-video");
 return video.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"')||video.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"');
}
function browserCanTry(url,capabilities){
 if(!validStream(url))return false;
 // An ordinary HTTPS MP4 can be attempted directly even when provider metadata
 // lists extra headers. <video> cannot attach arbitrary headers; playback may
 // still fail, but rejecting it before testing prevents usable sources on iOS.
 if(browserCompatibleURL(url)){
  try{
   const path=new URL(url).pathname.toLowerCase();
   const looksLikeVideo=[".mp4",".m4v",".webm",".m3u8"].some(ext=>path.endsWith(ext));
   return looksLikeVideo||Boolean(capabilities.direct&&!capabilities.needsHeaders);
  }catch{return false}
 }
 // The HTTP gateway cannot forward provider-specific headers and requires a
 // provider-verified direct file and an operator-approved hostname.
 return capabilities.direct&&!capabilities.needsHeaders&&url.startsWith("http://")&&!isHlsStream(url);
}
async function browserPlaybackURL(url,capabilities){
 if(browserCompatibleURL(url))return url;
 if(!browserCanTry(url,capabilities))throw Error("This source cannot use the in-app player.");
 const token=$("#watch-token").value.trim()||sessionToken;
 if(token.length<24)throw Error("Enter your private API token to authorize HTTP playback.");
 const response=await fetch(API+"/api/playback/prepare",{
  method:"POST",
  headers:{"Accept":"application/json","Content-Type":"application/json","Authorization":"Bearer "+token},
  body:JSON.stringify({url,direct_file:capabilities.direct,needs_headers:capabilities.needsHeaders})
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(result.error?.message||"Gateway unavailable (HTTP "+response.status+").");
 if(typeof result.playback_url!=="string"||!/^\/api\/playback\/file\/[0-9a-f]{64}$/.test(result.playback_url))
  throw Error("The server returned an invalid playback address.");
 return API+result.playback_url;
}
async function playInBrowser(){
 const source=playerSource;
 if(!source||!browserCanTry(selectedUrl,source)){setWatchStatus("This source cannot be played directly by the secure browser player.");return}
 const info=movieLinkInfo(selectedUrl);
 if(info.expired){setWatchStatus("This signed movie link appears expired. Press Find sources for a fresh URL, then select a newly returned source.");return}
 if(source.needsHeaders&&browserCompatibleURL(selectedUrl)){
  setWatchStatus("Trying direct HTTPS playback. This provider lists extra headers that a browser cannot supply; playback may be blocked by the media host.");
 }
 const video=$("#watch-video");
 haltVideo();video.hidden=false;
 $("#watch-fullscreen").disabled=false;
 try{
  const playbackURL=await browserPlaybackURL(selectedUrl,source);
  if(isHlsStream(playbackURL)&&window.Hls?.isSupported()){
   playerHls=new window.Hls({enableWorker:true,maxBufferLength:35});
   playerHls.on(window.Hls.Events.ERROR,(_,event)=>{
    if(event.fatal)setWatchStatus("HLS failed to load. The server may block CORS, or the source may be unavailable. Try another source or VLC.");
   });
   playerHls.on(window.Hls.Events.MANIFEST_PARSED,()=>video.play().catch(err=>{
    setWatchStatus(err.name==="NotAllowedError"?"Press Play on the video to start.":"The video could not start: "+err.message);
   }));
   playerHls.attachMedia(video);
   playerHls.loadSource(playbackURL);
   setWatchStatus("Loading movie in the built-in HLS player…");
  }else{
   video.src=playbackURL;video.load();
   await video.play();
   setWatchStatus("Playing directly in MovieBox. Use the video controls for seeking and volume.");
  }
 }catch(err){
  setWatchStatus(err?.name==="NotAllowedError"?"Press Play in the video controls.":"Browser playback failed: "+(err.message||"Unsupported or unavailable source.")+" Try another source or VLC.");
 }
}
async function movieFullscreen(){
 const v=$("#watch-video");if(v.hidden)return;
 try{
  if(document.fullscreenElement)await document.exitFullscreen();
  else if(v.requestFullscreen)await v.requestFullscreen();
  else if(typeof v.webkitEnterFullscreen==="function")v.webkitEnterFullscreen();
 }catch{setWatchStatus("Fullscreen isn't supported on this browser or device.")}
}
function watchClose(){
 if(sourceAbort)sourceAbort.abort();sourceAbort=null;clearStream();
 $("#watch-token").value="";
 $("#watch-dialog").close();
}
function getSavedToken(){
 try{return localStorage.getItem(TOKEN_STORE)||""}catch{return ""}
}
function removeSavedToken(){
 try{localStorage.removeItem(TOKEN_STORE)}catch{}
}
function keepToken(token){
 sessionToken=token;
 if($("#watch-remember").checked){
  try{localStorage.setItem(TOKEN_STORE,token)}
  catch{setWatchStatus("Could not save token on this device; it will work for this page session only.")}
 }else{removeSavedToken()}
}
function forgetToken(){
 sessionToken="";removeSavedToken();
 $("#watch-token").value="";
 $("#watch-remember").checked=false;
 setWatchStatus("Saved token forgotten. Enter your token again to load sources.");
}
function openWatch(autoFind=false){
 if(!selectedTitle)return;
 if($("#detail").open)$("#detail").close();
 clearStream();
 $("#watch-title").textContent="Watch · "+selectedTitle.title;
 $("#watch-sources").replaceChildren();
 $("#watch-episode-selectors").replaceChildren();
 const dubs=Array.isArray(selectedDetails?.dubs)?selectedDetails.dubs:[];
 if(dubs.length){
  const label=document.createElement("label");
  label.textContent="Audio ";
  const select=document.createElement("select");
  select.id="watch-audio";
  const original=document.createElement("option");
  original.value=selectedTitle.id;
  original.textContent="Original";
  select.appendChild(original);
  for(const dub of dubs){
   const subjectId=String(dub.subject_id||"");
   if(!subjectId||subjectId===selectedTitle.id)continue;
   const opt=document.createElement("option");
   opt.value=subjectId;
   opt.textContent=String(dub.language||dub.label||"Alternate audio");
   select.appendChild(opt);
  }
  const selectedLang=/\[(Hindi|Tamil|Telugu|Kannada|Malayalam)\]/i.exec(selectedTitle.title)?.[1];
  if(selectedLang){
   const match=Array.from(select.options).find(o=>o.textContent.toLowerCase()===selectedLang.toLowerCase());
   if(match)select.value=match.value;
  }
  label.appendChild(select);
  $("#watch-episode-selectors").appendChild(label);
  select.addEventListener("change",()=>{clearStream();$("#watch-sources").replaceChildren();setWatchStatus("Audio selection changed. Choose Find sources.");});
 }
 const seasons=Array.isArray(selectedDetails?.seasons)?selectedDetails.seasons:[];
 if(seasons.length){
  const season=document.createElement("select"),episode=document.createElement("select");
  season.id="watch-season";episode.id="watch-episode";
  for(const row of seasons){
   const opt=document.createElement("option");
   opt.value=String(row.number);opt.textContent="Season "+row.number;season.appendChild(opt);
  }
  const refresh=()=>{
   const row=seasons.find(x=>String(x.number)===season.value);
   episode.replaceChildren();
   for(const ep of row?.episodes||[]){
    const opt=document.createElement("option");
    opt.value=String(ep.number);
    opt.textContent="Episode "+ep.number+(ep.title?" · "+ep.title:"");
    episode.appendChild(opt);
   }
   if(!episode.options.length){
    const opt=document.createElement("option");opt.value="1";opt.textContent="Episode 1";episode.appendChild(opt);
   }
   clearStream();$("#watch-sources").replaceChildren();
  };
  season.addEventListener("change",refresh);
  const ls=document.createElement("label");ls.textContent="Season ";ls.appendChild(season);
  const le=document.createElement("label");le.textContent="Episode ";le.appendChild(episode);
  $("#watch-episode-selectors").append(ls,le);
  refresh();
 }
 const remembered=getSavedToken();
 $("#watch-token").value=remembered||sessionToken;
 $("#watch-remember").checked=!!remembered || !sessionToken;
 setWatchStatus(remembered?"Saved access token loaded from this device. Select Find sources.":"Enter the private API token once, then select Find sources.");
 $("#watch-dialog").showModal();
 if(autoFind&&$("#watch-token").value.trim().length>=24){
  queueMicrotask(()=>{if($("#watch-dialog").open)loadSources()});
 }
}
function releaseRows(releases){
 const dest=$("#watch-sources");dest.replaceChildren();
 let available=0, browserReady=0;
 releases.forEach((rel)=>{
  const mirrors=Array.isArray(rel.mirrors)?rel.mirrors:[];
  for(const mirror of mirrors){
   const url=String(mirror.resolver_url||"");
   const networkURL=validStream(url);
   const headers=Array.isArray(mirror.headers)?mirror.headers:[];
   const needsHeaders=headers.length>0;
   const direct=mirror.direct_file===true;
   const browserReadyForMirror=networkURL&&browserCanTry(url,{direct,needsHeaders});
   const mediaInfo=movieLinkInfo(url);
   const card=document.createElement("div");card.className="source-row";
   const info=document.createElement("div");
   const title=document.createElement("strong");
   title.textContent=(rel.quality||"Quality unspecified")+" · "+(mirror.label||rel.filename||"Source");
   const sub=document.createElement("small");
   const descriptor=browserReadyForMirror?(url.startsWith("http:")?"HTTP · secure gateway required":needsHeaders?"Browser attempt · provider headers may block playback":"Browser / VLC possible"):networkURL?(needsHeaders?"VLC may require request headers":direct?"VLC / Copy URL":"Unverified source · Try VLC"):"No HTTP/HTTPS stream address";
   sub.textContent=[rel.codec,mediaInfo.hevc?"H.265 / HEVC":null,mediaInfo.expired?"Signed URL expired · refresh sources":null,rel.language,rel.size_bytes?Math.round(rel.size_bytes/1048576)+" MB":null,descriptor].filter(Boolean).join(" · ");
   info.append(title,sub);card.appendChild(info);
   const btn=document.createElement("button");btn.type="button";btn.textContent=networkURL?"Select":"Unavailable";btn.disabled=!networkURL;
   if(networkURL){
    available++;if(browserReadyForMirror)browserReady++;
    btn.addEventListener("click",()=>chooseStream(url,card,{direct,needsHeaders,browserReady:browserReadyForMirror}));
   }
   card.appendChild(btn);dest.appendChild(card);
  }
 });
 return {available,browserReady};
}
function chooseStream(url,card,capabilities){
 if(!validStream(url))return;
 selectedUrl=url;
 document.querySelectorAll(".source-row").forEach(x=>x.classList.remove("chosen"));
 card.classList.add("chosen");
 $("#watch-copy").disabled=false;$("#watch-vlc").disabled=false;
 haltVideo();playerSource=capabilities;
 $("#watch-play").disabled=!capabilities.browserReady;
 $("#watch-fullscreen").disabled=true;
 const info=movieLinkInfo(url);
 if(info.expired){
  setWatchStatus("This signed movie URL appears to have expired. Select Find sources to retrieve a fresh link; retrying the expired URL cannot fix it.");
 }else if(info.hevc&&!hevcSupport()){
  setWatchStatus("This movie appears to use H.265/HEVC, which your browser may not decode. You can try Play in browser; otherwise choose an H.264 source or use VLC.");
 }else if(capabilities.browserReady){
  setWatchStatus(capabilities.needsHeaders&&browserCompatibleURL(url)?"Try Play in browser. This HTTPS file lists provider request headers that the browser cannot add; the media server may reject playback.":url.startsWith("http:")?"HTTP media selected. Play in browser will request a secure link from your approved media gateway.":"This HTTPS source may play in MovieBox. Select Play in browser"+(isHlsStream(url)?" for HLS.":"."));
 }else if(capabilities.needsHeaders){
  setWatchStatus("This source requires additional request headers. You can copy its URL or try VLC, but it may not play without the required headers; browser playback is disabled.");
 }else if(!capabilities.direct){
  setWatchStatus("This source is not verified as a direct media file. VLC may follow its network URL, or it may require further resolution. Browser playback is disabled.");
 }else{
  setWatchStatus("HTTP source selected. Use Open in VLC or Copy URL. Browser playback is disabled on this HTTPS website.");
 }
}
async function loadSources(){
 if(!selectedTitle)return;
 const token=$("#watch-token").value.trim();
 if(token.length<24){setWatchStatus("Enter the same private token configured as STREAM_ACCESS_TOKEN on Render (at least 24 characters).");return}
 if(sourceAbort)sourceAbort.abort();
 sourceAbort=new AbortController();
 const b=$("#load-sources");b.disabled=true;clearStream();
 $("#watch-sources").replaceChildren();
 setWatchStatus("Requesting source listings from your Rust API…");
 const isSeries=selectedTitle.type==="TV Show";
 const season=isSeries?($("#watch-season")?.value||"1"):"0";
 const episode=isSeries?($("#watch-episode")?.value||"1"):"0";
 try{
  const audioId=$("#watch-audio")?.value||selectedTitle.id;
  const path="/api/streams?provider="+encodeURIComponent(selectedTitle.provider)+"&id="+encodeURIComponent(audioId)+"&season="+encodeURIComponent(season)+"&episode="+encodeURIComponent(episode);
  const response=await fetch(API+path,{headers:{"Accept":"application/json","Authorization":"Bearer "+token},signal:sourceAbort.signal});
  const payload=await response.json().catch(()=>({}));
  if(response.status===401){forgetToken();throw new Error("Saved access was rejected. Check or update STREAM_ACCESS_TOKEN in Render, then enter it again.");}
  if(!response.ok)throw new Error(payload.error?.message||"API error "+response.status);
  keepToken(token);
  const releases=Array.isArray(payload.releases)?payload.releases:[];
  const ready=releaseRows(releases);
  setWatchStatus(releases.length?releases.length+" release(s) returned. "+ready.available+" selectable network source(s), including "+ready.browserReady+" potential browser-compatible source(s).":"No releases returned for this title/episode.");
 }catch(e){
  if(e.name!=="AbortError"){
   const message=String(e.message||"");
   if(/no stream sources available|no playable files|no usable streams|placeholder/i.test(message)){
    setWatchStatus("No playable source was returned for this title or episode. Search and details can work even when a provider has no stream. Try another title or episode; VLC cannot play without an actual network URL.");
   }else{
    setWatchStatus("Source lookup failed: "+message);
   }
  }
 }finally{b.disabled=false}
}
async function copyWatchURL(){
 if(!selectedUrl)return;
 try{await navigator.clipboard.writeText(selectedUrl);setWatchStatus("Copied stream URL. Paste it into VLC → Open Network Stream.");}
 catch{setWatchStatus("Clipboard unavailable. Use the browser share sheet or a different browser.");}
}
function openWatchVLC(){
 if(!selectedUrl)return;
 const ua=navigator.userAgent||"";
 if(/iPhone|iPad|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)){
  $("#watch-instructions").textContent="If VLC does not launch, copy the URL and paste it into VLC's Network Stream option.";
  location.href="vlc-x-callback://x-callback-url/stream?url="+encodeURIComponent(selectedUrl);
 }else if(/Android/i.test(ua)){
  $("#watch-instructions").textContent="If Android does not offer VLC, copy the URL and paste it in VLC → New Stream.";
  if(navigator.share)navigator.share({url:selectedUrl,title:selectedTitle?.title||"Stream"}).catch(()=>{});
  else copyWatchURL();
 }else{
  // Desktop launch requires a custom protocol registered on this device.
  // Do not silently substitute clipboard copying for the Open button.
  const launch="movieboxvlc://open?url="+encodeURIComponent(selectedUrl);
  $("#watch-instructions").textContent="Requesting VLC launch… If your browser says no app is registered, install the one-time Windows VLC launcher below. You can also use Copy URL.";
  setWatchStatus("Attempting to open VLC on your desktop. Approve your browser's external-app prompt if shown.");
  window.location.href=launch;
 }
}
$("#detail-content").addEventListener("click",e=>{if(e.target.closest("#watch-now"))openWatch()});
$("#watch-close").addEventListener("click",watchClose);
$("#watch-forget").addEventListener("click",forgetToken);
$("#watch-remember").addEventListener("change",()=>{
 if(!$("#watch-remember").checked)removeSavedToken();
 else if(sessionToken.length>=24){try{localStorage.setItem(TOKEN_STORE,sessionToken)}catch{}}
});
$("#watch-dialog").addEventListener("cancel",e=>{e.preventDefault();watchClose()});
$("#load-sources").addEventListener("click",loadSources);
$("#watch-copy").addEventListener("click",copyWatchURL);
$("#watch-play").addEventListener("click",playInBrowser);
$("#watch-fullscreen").addEventListener("click",movieFullscreen);
$("#watch-vlc").addEventListener("click",openWatchVLC);
$("#desktop-vlc-setup").hidden=!/Windows NT/i.test(navigator.userAgent);
$("#watch-video").addEventListener("error",()=>{
 if(!selectedUrl)return;
 const info=movieLinkInfo(selectedUrl);
 setWatchStatus(info.expired?"This signed movie link appears expired. Choose Find sources for a fresh one.":info.hevc?"H.265/HEVC movie couldn't play. This browser or device may not support its codec, or the link may be unavailable. Try another H.264 source or VLC.":"Browser could not play this source. Check link validity and browser codec support, or try another source.");
});

window.addEventListener("moviebox:remote-update",()=>{try{const v=JSON.parse(localStorage.getItem(STORE)||"{}");saved=v&&typeof v==="object"&&!Array.isArray(v)?v:{}}catch{saved={}}count();render()});
count();render();
const queryParams=new URLSearchParams(location.search);
const requestedItem=queryParams.get("item");
if(requestedItem&&saved[requestedItem])detail(requestedItem,queryParams.get("watch")==="1");
else {
 const q=queryParams.get("q");if(q){$("#q").value=q;search(q,1)}
}
})();