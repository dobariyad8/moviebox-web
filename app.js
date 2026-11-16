(() => {
"use strict";
const KEY="moviebox-web-data-v1";
const emptyData=()=>({items:[],favorites:[],history:[]});
let data;
try { data=Object.assign(emptyData(),JSON.parse(localStorage.getItem(KEY)||"{}")); } catch {data=emptyData();}
for(const k of ["items","favorites","history"]) if(!Array.isArray(data[k]))data[k]=[];
let route="home",filter="All",query="",currentStreamUrl="";
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const names={home:"Home",library:"My Library",live:"Live TV",favorites:"Favorites",history:"Recently Played",settings:"Settings"};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(data))}catch{notice("Browser storage full; export your library.")}};
const notice=msg=>{const n=$("#toast");n.textContent=msg;n.classList.remove("hidden");clearTimeout(notice.timer);notice.timer=setTimeout(()=>n.classList.add("hidden"),3500)};
const acceptable=s=>{try{const u=new URL(s);return u.protocol==="https:"||(u.protocol==="http:"&&["localhost","127.0.0.1"].includes(u.hostname))}catch{return false}};
const action=(name,label,cls="primary")=>'<button class="'+cls+'" data-action="'+name+'">'+label+"</button>";
const heading=(title,subtitle)=>'<h1 class="page-title">'+title+'</h1><p class="page-subtitle">'+subtitle+"</p>";
const card=item=>{
const fav=data.favorites.includes(item.id),types={"Movie":"▶","Series":"▤","Anime":"✦","Live TV":"▣","Video":"▶"};
return '<article class="media-card"><div class="poster"><span class="poster-symbol">'+(types[item.type]||"▶")+'</span><span class="type-tag">'+esc(item.type)+'</span><button class="favorite-card'+(fav?" saved":"")+'" data-action="favorite" data-id="'+esc(item.id)+'">'+(fav?"♥":"♡")+'</button></div><div class="media-info"><h3>'+esc(item.title)+'</h3><p>'+esc(item.group||"Your collection")+'</p><button data-action="play" data-id="'+esc(item.id)+'">▶ Play now</button></div></article>';
};
const grid=items=>items.length?'<div class="grid">'+items.map(card).join("")+"</div>":'<div class="empty"><div class="empty-icon">▧</div><h3>Nothing here yet</h3><p>Add a legally accessible stream or import your own M3U playlist to get started.</p>'+action("open-add","＋ Add media")+"</div>";
const matches=item=>!query||(item.title+" "+(item.group||"")+" "+item.type).toLowerCase().includes(query);
function render(){
 document.title=names[route]+" · MovieBox Web";
 $("#page-crumb").textContent=names[route].toUpperCase();
 $$("[data-route]").forEach(el=>el.classList.toggle("active",el.dataset.route===route));
 let h="",items=data.items.filter(matches);
 if(route==="home"){
  const recent=data.history.map(x=>data.items.find(i=>i.id===x.id)).filter(Boolean).slice(0,6);
  h='<div class="hero"><div><div class="eyebrow">✦ YOUR PERSONAL CINEMA</div><h1>Your entertainment.<br>One beautiful space.</h1><p>Build your own media library, watch compatible streams and enjoy your collection on phone or desktop.</p><div class="actions">'+action("open-add","＋ Add media")+action("open-import","▣ Import M3U playlist","secondary")+'</div></div><span class="hero-badge">▶</span></div><div class="stats"><div class="stat"><strong>'+data.items.length+'</strong><span>Media items</span></div><div class="stat"><strong>'+data.items.filter(i=>i.type==="Live TV").length+'</strong><span>Live channels</span></div><div class="stat"><strong>'+data.favorites.length+'</strong><span>Favorites saved</span></div></div>';
  if(recent.length)h+='<section class="section"><div class="section-heading"><h2>Recently played</h2></div>'+grid(recent)+'</section>';
  h+='<section class="section"><div class="section-heading"><h2>Your collection</h2></div>'+grid(items.slice().reverse().slice(0,12))+"</section>";
 } else if(route==="settings"){
  h=heading("Settings","Manage your local library and device data.");
  h+='<section class="panel"><h3>Backup & privacy</h3><p>Media links are stored only in this browser and do not automatically sync across devices.</p><div class="settings-row"><div>Export library<small>Download all items, favorites and history</small></div>'+action("export","Export","secondary")+'</div><div class="settings-row"><div>Restore backup<small>Import a previous library JSON file</small></div>'+action("restore","Restore","secondary")+'</div><div class="settings-row"><div class="danger">Clear library<small>Remove this browser’s stored collection</small></div>'+action("clear","Clear","secondary")+"</div></section>";
  h+='<section class="panel warning"><h3>Playback and sources</h3><p>This is an independent web interface inspired by MovieBox-TUI. Its provider search is not connected. Playback requires direct URLs that you are authorized to use and that the browser supports. Some sources will not work because of codec, CORS, authentication, or HTTPS restrictions.</p></section>';
 }else{
  const subtitles={library:"Everything you added in one place.",live:"Your imported live TV channels.",favorites:"The media you bookmarked.",history:"Pick up where you left off."};
  if(route==="live")items=items.filter(i=>i.type==="Live TV");
  if(route==="favorites")items=items.filter(i=>data.favorites.includes(i.id));
  if(route==="history")items=data.history.map(x=>items.find(i=>i.id===x.id)).filter(Boolean);
  h=heading(names[route],subtitles[route]);
  if(route==="library"||route==="favorites"||route==="history"){
    h+='<div class="toolbar">'+["All","Movie","Series","Anime","Video","Live TV"].map(t=>'<button class="chip'+(t===filter?" active":"")+'" data-action="filter" data-filter="'+t+'">'+t+"</button>").join("")+action("open-import","＋ Import M3U","chip")+"</div>";
    items=items.filter(i=>filter==="All"||i.type===filter);
  }else{
    const groups=[...new Set(items.map(i=>i.group).filter(Boolean))];
    h+='<div class="toolbar"><button class="chip'+(filter==="All"?" active":"")+'" data-action="filter" data-filter="All">All channels</button>'+groups.map(g=>'<button class="chip'+(filter===g?" active":"")+'" data-action="filter" data-filter="'+esc(g)+'">'+esc(g)+"</button>").join("")+"</div>";
    items=items.filter(i=>filter==="All"||i.group===filter);
  }
  h+=grid(items);
 }
 $("#content").innerHTML=h;
}
function go(r){route=names[r]?r:"home";filter="All";query="";$("#search").value="";location.hash=route;render();scrollTo({top:0,behavior:"smooth"});}
function modal(title,body){$("#dialog-title").textContent=title;$("#dialog-body").innerHTML=body;$("#modal-layer").classList.remove("hidden");document.body.style.overflow="hidden";}
function dismiss(){$("#modal-layer").classList.add("hidden");document.body.style.overflow="";}
function addForm(){modal("Add media",'<form id="add-form"><div class="two-col"><label class="field">Title<input name="title" required maxlength="120" placeholder="Enter a title"></label><label class="field">Type<select name="type"><option>Movie</option><option>Series</option><option>Anime</option><option>Video</option><option>Live TV</option></select></label></div><label class="field">Stream URL<input type="url" name="url" required placeholder="https://example.com/video.mp4"></label><label class="field">Collection / category<input name="group" maxlength="80" placeholder="Optional"></label><p class="form-help">Use media URLs you have permission to access. HTTPS is required on a deployed site.</p><div class="form-actions">'+action("close","Cancel","secondary")+'<button class="primary" type="submit">Add to library</button></div></form>');}
function importForm(){modal("Import M3U playlist",'<form id="import-form"><label class="upload-box">▣ Choose a .m3u or .m3u8 file<input type="file" name="playlist" accept=".m3u,.m3u8,text/plain"></label><label class="field">Or paste M3U text<textarea name="playlisttext" placeholder="#EXTM3U"></textarea></label><p class="form-help">Up to 15 MB. Playlist content is processed only in this browser.</p><div class="form-actions">'+action("close","Cancel","secondary")+'<button class="primary" type="submit">Import playlist</button></div></form>');}
function insert(items){let n=0;const urls=new Set(data.items.map(i=>i.url));for(const i of items){if(!acceptable(i.url)||urls.has(i.url))continue;urls.add(i.url);data.items.push({id:uid(),title:i.title.slice(0,120),url:i.url,type:i.type||"Video",group:(i.group||"").slice(0,80)});n++;}save();render();return n;}
function parse(text){const result=[];let meta=null;for(const raw of text.replace(/^\uFEFF/,"").split(/\r?\n/)){const line=raw.trim();if(line.startsWith("#EXTINF:")){const title=line.match(/tvg-name="([^"]*)"/i),group=line.match(/group-title="([^"]*)"/i);meta={title:(title?.[1]||line.slice(line.lastIndexOf(",")+1).trim()||"Unnamed channel"),group:group?.[1]||""};}else if(line&&!line.startsWith("#")){if(meta&&acceptable(line))result.push({...meta,url:line,type:"Live TV"});meta=null;}}return result;}
function closePlayer(){currentStreamUrl="";const v=$("#video");v.pause();v.removeAttribute("src");v.load();$("#player-layer").classList.add("hidden");document.body.style.overflow="";}
function play(id){const i=data.items.find(x=>x.id===id);if(!i)return;currentStreamUrl=i.url;data.history=[{id,at:Date.now()},...data.history.filter(x=>x.id!==id)].slice(0,50);save();$("#player-title").textContent=i.title;$("#player-message").textContent="Playback depends on the browser and source. Some streams require external players, authentication or CORS support.";$("#player-layer").classList.remove("hidden");document.body.style.overflow="hidden";$("#video").src=i.url;$("#video").play().catch(()=>{});render();}
function exportLibrary(){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=u;a.download="moviebox-library.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function restore(){const el=document.createElement("input");el.type="file";el.accept=".json,application/json";el.onchange=async()=>{const f=el.files?.[0];if(!f||f.size>5000000)return notice("Invalid or oversized file.");try{const o=JSON.parse(await f.text());if(!Array.isArray(o.items))throw Error();const items=o.items.filter(i=>i&&typeof i.id==="string"&&typeof i.title==="string"&&typeof i.url==="string"&&acceptable(i.url)).slice(0,5000).map(i=>({id:i.id,title:i.title.slice(0,120),url:i.url,type:["Movie","Series","Anime","Video","Live TV"].includes(i.type)?i.type:"Video",group:String(i.group||"").slice(0,80)}));const ids=new Set(items.map(i=>i.id));data={items,favorites:(o.favorites||[]).filter(x=>ids.has(x)),history:(o.history||[]).filter(x=>x&&ids.has(x.id)).slice(0,50)};save();render();notice("Library restored.");}catch{notice("Could not restore backup.");}};el.click();}

async function copyStream(){
  if(!currentStreamUrl||!acceptable(currentStreamUrl))return notice("No valid stream URL available.");
  try{await navigator.clipboard.writeText(currentStreamUrl);notice("Stream URL copied. Paste into VLC → Open Network Stream.");}
  catch{
    const field=document.createElement("textarea");
    field.value=currentStreamUrl;field.readOnly=true;field.style.position="fixed";field.style.opacity="0";
    document.body.appendChild(field);field.select();
    const succeeded=document.execCommand("copy");field.remove();
    notice(succeeded?"Stream URL copied.":"Copy unavailable on this browser.");
  }
}
function openVlc(){
  if(!currentStreamUrl||!acceptable(currentStreamUrl))return notice("No valid stream URL available.");
  const ua=navigator.userAgent||"";
  if(/iPhone|iPad|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)){
    const url="vlc-x-callback://x-callback-url/stream?url="+encodeURIComponent(currentStreamUrl);
    $("#vlc-help").textContent="If VLC does not open, choose Copy stream URL, then paste it into VLC's Network Stream screen.";
    window.location.href=url;
  }else if(/Android/i.test(ua)){
    $("#vlc-help").textContent="Choose VLC from the Android share sheet, if offered. Otherwise paste the stream URL into VLC → More → New stream.";
    if(navigator.share){
      navigator.share({url:currentStreamUrl,title:$("#player-title").textContent}).catch(()=>{});
    }else{copyStream();}
  }else{
    $("#vlc-help").textContent="Launching VLC through the MovieBox desktop link handler. On Windows, the one-time setup is at github.com/dobariyad8/moviebox-web/tree/main/desktop-vlc; use Copy stream URL if no app opens.";
    window.location.href="movieboxvlc://open?url="+encodeURIComponent(currentStreamUrl);
  }
}
$("#open-vlc").addEventListener("click",openVlc);
$("#copy-stream").addEventListener("click",copyStream);

$("#add-top").addEventListener("click",addForm);
$("#close-dialog").addEventListener("click",dismiss);
$("#close-player").addEventListener("click",closePlayer);
$("#modal-layer").addEventListener("click",e=>{if(e.target.id==="modal-layer")dismiss();});
$("#search").addEventListener("input",e=>{query=e.target.value.toLowerCase().trim();if(route==="settings")route="library";render();});
document.addEventListener("click",e=>{const b=e.target.closest("[data-action],[data-route]");if(!b)return;if(b.dataset.route){go(b.dataset.route);return;}const a=b.dataset.action,id=b.dataset.id;if(a==="open-add")addForm();else if(a==="open-import")importForm();else if(a==="close")dismiss();else if(a==="play")play(id);else if(a==="favorite"){data.favorites=data.favorites.includes(id)?data.favorites.filter(x=>x!==id):[...data.favorites,id];save();render();}else if(a==="filter"){filter=b.dataset.filter;render();}else if(a==="export")exportLibrary();else if(a==="restore")restore();else if(a==="clear"&&confirm("Delete all locally stored media and history?")){data=emptyData();save();render();notice("Library cleared.");}});
document.addEventListener("submit",async e=>{if(e.target.id==="add-form"){e.preventDefault();const f=new FormData(e.target),i={title:String(f.get("title")||"").trim(),url:String(f.get("url")||"").trim(),type:String(f.get("type")),group:String(f.get("group")||"").trim()};if(!i.title||!acceptable(i.url))return notice("Enter a title and valid HTTPS URL.");const n=insert([i]);dismiss();notice(n?"Added to library.":"This URL already exists.");}else if(e.target.id==="import-form"){e.preventDefault();const form=e.target,file=form.elements.playlist.files?.[0];if(file&&file.size>15*1024*1024)return notice("File exceeds 15 MB.");const txt=file?await file.text():form.elements.playlisttext.value;if(!txt.trim())return notice("Choose a playlist or paste text.");const n=insert(parse(txt));dismiss();go("live");notice("Imported "+n+" channels.");}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){dismiss();closePlayer();}if(e.key==="/"&&!["INPUT","TEXTAREA"].includes(document.activeElement.tagName)){e.preventDefault();$("#search").focus();}});
$("#video").addEventListener("error",()=>{$("#player-message").textContent="This stream is not directly supported by your browser. Check codec, HTTPS and CORS compatibility.";});
const initial=location.hash.slice(1);route=names[initial]?initial:"home";render();
if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("./sw.js").catch(()=>{});
})();