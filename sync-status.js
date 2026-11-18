import {autoSync} from "./cloud-sync.js";
const destination=document.querySelector(".top-actions")||document.querySelector(".discover-header");
if(destination){
 const link=document.createElement("a");
 link.href="account.html";
 link.className="moviebox-sync-chip";
 link.setAttribute("aria-live","polite");
 link.hidden=true;
 destination.prepend(link);
 const update=()=>{
  const enabled=autoSync.enabled,blocked=autoSync.blocked;
  link.hidden=!enabled&&!blocked;
  if(link.hidden)return;
  const state=autoSync.status;
  link.classList.toggle("moviebox-sync-error",blocked||state.startsWith("Sync retry needed"));
  const label=blocked?"Sync paused":state==="Syncing…"?"Syncing…":state.startsWith("Sync retry needed")?"Sync retry needed":"Synced";
  link.textContent=(blocked?"! ":"● ")+label;
  link.title=state+" · Open Account & Sync";
 };
 window.addEventListener("moviebox:sync-status",update);
 update();
}
