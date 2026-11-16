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
let selectedTitle=null,selectedDetails=null,selectedUrl="",sourceAbort=null;
const normalize=x=>({id:String(x.id?.value||""),provider:String(x.id?.provider||"moviebox"),title:String(x.title||"Untitled"),year:String(x.year||"—"),type:x.media_type==="series"?"TV Show":"Movie",image:validImage(x.poster_url),description:String(x.description||""),seasons:Array.isArray(x.seasons)?x.seasons:[],genres:Array.isArray(x.genres)?x.genres:[],rating:x.imdb_rating||"",duration:x.duration||""});
const key=x=>x.provider+":"+x.id;
function save(){try{localStorage.setItem(STORE,JSON.stringify(saved))}catch{alert("Cannot save: browser storage is full.")}count();}
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
function findItem(id){return results.find(x=>key(x)===id)||saved[id]}
async function detail(id){
 const x=findItem(id);if(!x)return;
 $("#detail-title").textContent=x.title;
 const box=$("#detail-content");
 box.innerHTML='<p class="form-help">Fetching details from MovieBox…</p>';
 $("#detail").showModal();
 try{
  const data=await requestJSON("/api/details?provider="+encodeURIComponent(x.provider)+"&id="+encodeURIComponent(x.id));
  if(!$("#detail").open)return;
  const d=data.item||{},genres=Array.isArray(d.genres)?d.genres:[],seasons=Array.isArray(d.seasons)?d.seasons:[],image=validImage(d.poster_url||x.image);
  const seasonHtml=seasons.length?'<h3>Seasons & episodes</h3><div class="season-list">'+seasons.map(s=>'<details><summary>Season '+esc(s.number)+' · '+(Array.isArray(s.episodes)?s.episodes.length:0)+' episodes</summary><ul>'+(Array.isArray(s.episodes)?s.episodes.map(ep=>'<li>Episode '+esc(ep.number)+': '+esc(ep.title||"Untitled")+'</li>').join(""):"")+'</ul></details>').join("")+'</div>':"";
  selectedTitle=x;selectedDetails=d;
  box.innerHTML='<div class="detail-layout"><div>'+(image?'<img referrerpolicy="no-referrer" src="'+esc(image)+'" alt="">':"")+'</div><div><div class="detail-meta">'+esc(x.type)+' · '+esc(d.year||x.year)+(d.imdb_rating?' · ★ '+esc(d.imdb_rating):"")+'</div>'+(d.tagline?'<h3>'+esc(d.tagline)+'</h3>':"")+'<p>'+esc(clean(d.description)||"No description available.")+'</p><p>'+esc(genres.join(", "))+(d.duration?" · "+esc(d.duration):"")+'</p>'+seasonHtml+'<button class="discover-button" type="button" id="watch-now">▶ Watch Now · Choose source</button><p class="form-help">Source lookup requires private API access. Browser and VLC playback depend on the returned URL.</p></div></div>';
 }catch(e){box.innerHTML='<p>Could not load provider details: '+esc(e.message)+'</p>';}
}
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
 const v=$("#watch-video");v.pause();v.removeAttribute("src");v.load();v.hidden=true;
}
function clearStream(){
 selectedUrl="";haltVideo();
 $("#watch-vlc").disabled=true;$("#watch-copy").disabled=true;
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
function openWatch(){
 if(!selectedTitle)return;
 $("#detail").close();
 clearStream();
 $("#watch-title").textContent="Watch · "+selectedTitle.title;
 $("#watch-sources").replaceChildren();
 $("#watch-episode-selectors").replaceChildren();
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
}
function releaseRows(releases){
 const dest=$("#watch-sources");dest.replaceChildren();
 let usable=0;
 releases.forEach((rel,i)=>{
  const mirrors=Array.isArray(rel.mirrors)?rel.mirrors:[];
  for(const mirror of mirrors){
   const card=document.createElement("div");card.className="source-row";
   const info=document.createElement("div");
   const title=document.createElement("strong");
   title.textContent=(rel.quality||"Quality unspecified")+" · "+(mirror.label||rel.filename||"Source");
   const sub=document.createElement("small");
   const extraHeaders=Array.isArray(mirror.headers)?mirror.headers.length>0:!!mirror.headers;
   const direct=mirror.direct_file===true;
   const allowed=direct&&!extraHeaders&&validStream(mirror.resolver_url);
   const inBrowser=allowed&&browserCompatibleURL(mirror.resolver_url);
   sub.textContent=[rel.codec,rel.language,rel.size_bytes?Math.round(rel.size_bytes/1048576)+" MB":null,allowed?(inBrowser?"HTTPS · Browser / VLC":"HTTP · VLC / Copy URL only"):"External resolution or headers required"].filter(Boolean).join(" · ");
   info.append(title,sub);card.appendChild(info);
   const btn=document.createElement("button");btn.type="button";btn.textContent=allowed?"Select":"Unavailable";btn.disabled=!allowed;
   if(allowed){usable++;btn.addEventListener("click",()=>chooseStream(mirror.resolver_url,card));}
   card.appendChild(btn);dest.appendChild(card);
  }
 });
 return usable;
}
function chooseStream(url,card){
 if(!validStream(url))return;
 selectedUrl=url;
 document.querySelectorAll(".source-row").forEach(x=>x.classList.remove("chosen"));
 card.classList.add("chosen");
 $("#watch-copy").disabled=false;$("#watch-vlc").disabled=false;
 const video=$("#watch-video");haltVideo();
 if(browserCompatibleURL(url)){
  video.hidden=false;video.src=url;video.load();
  setWatchStatus("HTTPS source selected. Try Play in Browser, Open in VLC, or Copy URL.");
 }else{
  setWatchStatus("HTTP source selected. Browser playback is disabled on this HTTPS site. Use Open in VLC or Copy URL.");
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
 const season=$("#watch-season")?.value||"1",episode=$("#watch-episode")?.value||"1";
 try{
  const path="/api/streams?provider="+encodeURIComponent(selectedTitle.provider)+"&id="+encodeURIComponent(selectedTitle.id)+"&season="+encodeURIComponent(season)+"&episode="+encodeURIComponent(episode);
  const response=await fetch(API+path,{headers:{"Accept":"application/json","Authorization":"Bearer "+token},signal:sourceAbort.signal});
  const payload=await response.json().catch(()=>({}));
  if(response.status===401){forgetToken();throw new Error("Saved access was rejected. Check or update STREAM_ACCESS_TOKEN in Render, then enter it again.");}
  if(!response.ok)throw new Error(payload.error?.message||"API error "+response.status);
  keepToken(token);
  const releases=Array.isArray(payload.releases)?payload.releases:[];
  const ready=releaseRows(releases);
  setWatchStatus(releases.length?releases.length+" release(s) returned. "+ready+" direct HTTP/HTTPS mirror(s) without extra headers.":"No releases returned for this title/episode.");
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
  copyWatchURL();
  $("#watch-instructions").textContent="On desktop, VLC → Media → Open Network Stream → paste the copied URL.";
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
$("#watch-vlc").addEventListener("click",openWatchVLC);
$("#watch-video").addEventListener("error",()=>{
 if(selectedUrl)setWatchStatus("Browser cannot play this source. Try Open in VLC or Copy URL.");
});

count();render();
const q=new URLSearchParams(location.search).get("q");if(q){$("#q").value=q;search(q,1)}
})();