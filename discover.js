(()=>{
"use strict";
const API="https://moviebox-web-api.onrender.com";
const STORE="moviebox-rust-watchlist-v1";
const $=s=>document.querySelector(s);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean=x=>String(x||"").replace(/<[^>]*>/g,"").trim();
const validImage=u=>/^https:\/\//i.test(String(u||""))?u:"";
let saved={};try{const v=JSON.parse(localStorage.getItem(STORE)||"{}");saved=v&&typeof v==="object"&&!Array.isArray(v)?v:{}}catch{}
let results=[],showSaved=false,seq=0,page=1,lastQuery="",request=null,lastCount=0;
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
  box.innerHTML='<div class="detail-layout"><div>'+(image?'<img referrerpolicy="no-referrer" src="'+esc(image)+'" alt="">':"")+'</div><div><div class="detail-meta">'+esc(x.type)+' · '+esc(d.year||x.year)+(d.imdb_rating?' · ★ '+esc(d.imdb_rating):"")+'</div>'+(d.tagline?'<h3>'+esc(d.tagline)+'</h3>':"")+'<p>'+esc(clean(d.description)||"No description available.")+'</p><p>'+esc(genres.join(", "))+(d.duration?" · "+esc(d.duration):"")+'</p>'+seasonHtml+'<p class="form-help">Provider details only. Browser playback is not connected yet.</p></div></div>';
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
count();render();
const q=new URLSearchParams(location.search).get("q");if(q){$("#q").value=q;search(q,1)}
})();