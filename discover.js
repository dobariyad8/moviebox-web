(()=>{
"use strict";
const $=s=>document.querySelector(s);
const escapeHTML=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const STORE="moviebox-discover-watchlist-v1";
let saved={};try{saved=JSON.parse(localStorage.getItem(STORE)||"{}")||{}}catch{saved={}}
let results=[],showSaved=false,seq=0;
const fmtYear=v=>v?String(v).slice(0,4):"Year unknown";
const plain=x=>String(x||"").replace(/<[^>]*>/g,"").trim();
function updateCount(){$("#saved-count").textContent=Object.keys(saved).length;}
function normalizeMovie(x){return{id:"movie:"+x.trackId,title:x.trackName,year:fmtYear(x.releaseDate),type:"Movie",image:x.artworkUrl100?.replace("100x100bb","600x900bb")||"",description:x.longDescription||x.shortDescription||"",genre:x.primaryGenreName||"",sourceUrl:x.trackViewUrl||"",rating:"",runtime:x.trackTimeMillis?Math.round(x.trackTimeMillis/60000)+" min":"",seasons:[]};}
function normalizeShow(x){const s=x.show||x;return{id:"tv:"+s.id,title:s.name,year:fmtYear(s.premiered),type:"TV Show",image:s.image?.original||s.image?.medium||"",description:plain(s.summary),genre:(s.genres||[]).join(", "),sourceUrl:s.officialSite||s.url||"",rating:s.rating?.average||"",runtime:s.runtime?s.runtime+" min":"",seasons:[]};}
function render(){const items=showSaved?Object.values(saved):results;
$("#results-title").textContent=showSaved?"My watchlist":"Search results";$("#status").textContent=showSaved?items.length+" saved titles":items.length?items.length+" results from public movie and TV catalogs":"Enter a title above to get started.";
$("#results").innerHTML=items.length?items.map(x=>'<article class="discover-card"><div class="discover-poster">'+(x.image?'<img loading="lazy" src="'+escapeHTML(x.image)+'" alt="Poster for '+escapeHTML(x.title)+'">':"▶")+'</div><div class="discover-card-body"><h3>'+escapeHTML(x.title)+'</h3><p>'+escapeHTML(x.type)+' · '+escapeHTML(x.year)+'</p><div class="discover-card-actions"><button data-detail="'+escapeHTML(x.id)+'">Details</button><button class="'+(saved[x.id]?"saved":"")+'" data-save="'+escapeHTML(x.id)+'">'+(saved[x.id]?"♥ Saved":"♡ Save")+'</button></div></div></article>').join(""):'<div class="discover-message">'+(showSaved?"Your watchlist is empty. Save some titles to find them here.":"Search for a movie or TV show to see results.")+'</div>';}
async function search(q){const call=++seq;showSaved=false;$("#saved-filter").classList.remove("selected");$("#status").textContent="Searching public catalogs…";$("#results").innerHTML='<div class="discover-message">Searching…</div>';const jobs=[];
if($("#movies").checked)jobs.push(fetch("https://itunes.apple.com/search?term="+encodeURIComponent(q)+"&entity=movie&limit=30&country=US").then(r=>{if(!r.ok)throw Error("Movies unavailable");return r.json()}).then(j=>j.results.map(normalizeMovie)).catch(()=>[]));
if($("#series").checked)jobs.push(fetch("https://api.tvmaze.com/search/shows?q="+encodeURIComponent(q)).then(r=>{if(!r.ok)throw Error("Shows unavailable");return r.json()}).then(j=>j.map(normalizeShow)).catch(()=>[]));
if(!jobs.length){$("#results").innerHTML='<div class="discover-message">Select at least one media type.</div>';return;}
const all=(await Promise.all(jobs)).flat();if(call!==seq)return;results=all.filter(i=>i.id&&i.title);if(!results.length)$("#status").textContent="No matching titles found, or the catalog services could not be reached.";render();if(!results.length)$("#status").textContent="No results found. Check spelling or retry in a moment.";}
async function detail(id){const x=results.find(i=>i.id===id)||saved[id];if(!x)return;$("#detail-title").textContent=x.title;const box=$("#detail-content");const goodUrl=x.sourceUrl&&/^https:\/\//.test(x.sourceUrl);box.innerHTML='<div class="detail-layout"><div>'+(x.image?'<img src="'+escapeHTML(x.image)+'" alt="">':"")+'</div><div><div class="detail-meta">'+escapeHTML(x.type)+' · '+escapeHTML(x.year)+(x.rating?' · ★ '+escapeHTML(x.rating):"")+'</div><p>'+escapeHTML(x.description||"No synopsis available.")+'</p><p>'+escapeHTML(x.genre||"")+(x.runtime?" · "+escapeHTML(x.runtime):"")+'</p><div id="seasons-slot"></div>'+(goodUrl?'<a class="discover-button" href="'+escapeHTML(x.sourceUrl)+'" target="_blank" rel="noopener noreferrer">View source listing ↗</a>':"")+'<p>Catalog metadata only. This title does not include a playable stream.</p></div></div>';$("#detail").showModal();
if(x.type==="TV Show"){try{const response=await fetch("https://api.tvmaze.com/shows/"+encodeURIComponent(id.slice(3))+"/seasons");if(!response.ok)return;const seasons=await response.json();if($("#detail").open&&$("#detail-title").textContent===x.title){const target=$("#seasons-slot");const list=seasons.slice(0,30).map(s=>'<li>Season '+escapeHTML(s.number??"—")+' · '+escapeHTML(s.episodeOrder??"Unknown")+' episodes</li>').join("");target.innerHTML=seasons.length?"<strong>Seasons</strong><ul>"+list+"</ul>":"";}}catch{}}
}
$("#discover-form").addEventListener("submit",e=>{e.preventDefault();search($("#q").value.trim());});
$("#results").addEventListener("click",e=>{const b=e.target.closest("[data-detail],[data-save]");if(!b)return;if(b.dataset.detail){detail(b.dataset.detail);return;}const id=b.dataset.save,x=results.find(i=>i.id===id)||saved[id];if(!x)return;if(saved[id])delete saved[id];else saved[id]=x;try{localStorage.setItem(STORE,JSON.stringify(saved))}catch{alert("Storage full; cannot save title.");}updateCount();render();});
$("#saved-filter").addEventListener("click",()=>{showSaved=!showSaved;$("#saved-filter").classList.toggle("selected",showSaved);render();});
$("#detail-close").addEventListener("click",()=>$("#detail").close());
$("#detail").addEventListener("click",e=>{if(e.target===$("#detail"))$("#detail").close()});
updateCount();render();
const q=new URLSearchParams(location.search).get("q");if(q){$("#q").value=q;search(q);}
})();