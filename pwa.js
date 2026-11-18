(()=>{
"use strict";
if("serviceWorker" in navigator&&location.protocol==="https:"){
 window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}),{once:true});
}
let installPrompt=null;
window.addEventListener("beforeinstallprompt",event=>{
 event.preventDefault();installPrompt=event;
 const button=document.querySelector("#install-app");
 if(button)button.hidden=false;
});
const install=document.querySelector("#install-app");
if(install){
 install.addEventListener("click",async()=>{
  if(!installPrompt)return;
  const prompt=installPrompt;installPrompt=null;
  install.hidden=true;
  try{await prompt.prompt()}catch{}
 });
 window.addEventListener("appinstalled",()=>{install.hidden=true;installPrompt=null});
}
if(!document.body.classList.contains("live-body")){
 const isInput=tag=>["INPUT","TEXTAREA","SELECT"].includes(tag);
 document.addEventListener("keydown",event=>{
  if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)||isInput(event.target?.tagName)||event.ctrlKey||event.metaKey||event.altKey)return;
  if(document.querySelector('dialog[open]')||document.querySelector(".player-layer:not(.hidden)")||document.querySelector(".modal-layer:not(.hidden)"))return;
  const candidates=[...document.querySelectorAll('a[href],button:not([disabled]),[tabindex="0"]')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=="hidden");
  const active=document.activeElement;
  if(!candidates.includes(active)){candidates[0]?.focus();return}
  const r=active.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  let best=null,score=Infinity;
  for(const item of candidates){
   if(item===active)continue;
   const b=item.getBoundingClientRect(),dx=b.left+b.width/2-cx,dy=b.top+b.height/2-cy;
   const forward=event.key==="ArrowRight"?dx:event.key==="ArrowLeft"?-dx:event.key==="ArrowDown"?dy:-dy;
   const cross=event.key==="ArrowRight"||event.key==="ArrowLeft"?Math.abs(dy):Math.abs(dx);
   if(forward<5)continue;
   const rank=forward+cross*2.5;
   if(rank<score){best=item;score=rank}
  }
  if(best){event.preventDefault();best.focus({preventScroll:true});best.scrollIntoView({block:"nearest",inline:"nearest"})}
 });
}
})();