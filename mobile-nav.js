(() => {
"use strict";
// Shared mobile navigation across Home, Explore, Live TV and Account.
const pathname=location.pathname.split("/").pop()||"index.html";
const onHome=pathname==="index.html";
const current=()=>onHome?["library","favorites"].includes(location.hash.slice(1))?location.hash.slice(1):"home":pathname==="discover.html"?"explore":pathname==="live-tv.html"?"live":pathname==="account.html"?"account":"home";
const tabs=[
 {id:"home",href:"index.html#home",glyph:"⌂",label:"Home"},
 {id:"explore",href:"discover.html",glyph:"⌕",label:"Explore"},
 {id:"library",href:"index.html#library",glyph:"▤",label:"Library"},
 {id:"live",href:"live-tv.html",glyph:"▣",label:"Live TV"},
 {id:"favorites",href:"index.html#favorites",glyph:"♡",label:"Saved"}
];
function element(tag,className,text){
 const el=document.createElement(tag);
 if(className)el.className=className;
 if(text!==undefined)el.textContent=text;
 return el;
}
const header=element("header","mb-mobile-header");
header.setAttribute("aria-label","Mobile app header");
const brand=element("a","mb-mobile-brand");
brand.href="index.html#home";
const mark=element("span","mb-brand-mark","▶");
const name=element("span","mb-brand-name","moviebox");
const dot=element("span","mb-brand-dot",".");
name.appendChild(dot);brand.append(mark,name);
const actions=element("div","mb-mobile-actions");
const sync=element("span","mb-mobile-sync");
const account=element("a","mb-mobile-account");
account.innerHTML='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
account.href="account.html";account.setAttribute("aria-label","Account and sync");account.title="Account & Sync";
actions.append(sync);
if(onHome){
 const add=element("button","mb-mobile-add","+");
 add.type="button";add.setAttribute("aria-label","Add media");add.title="Add media";
 add.addEventListener("click",()=>document.querySelector("#add-top")?.click());
 actions.append(add);
}
actions.append(account);header.append(brand,actions);
document.body.prepend(header);
const nav=element("nav","mb-mobile-nav");
nav.setAttribute("aria-label","Main mobile navigation");
for(const tab of tabs){
 const link=element("a","mb-mobile-tab");
 link.href=tab.href;link.dataset.mbTab=tab.id;
 const glyph=element("span","mb-mobile-glyph",tab.glyph);
 glyph.setAttribute("aria-hidden","true");
 const label=element("span","mb-mobile-tab-label",tab.label);
 link.append(glyph,label);
 nav.appendChild(link);
}
document.body.appendChild(nav);
function refresh(){
 const value=current();
 for(const link of nav.querySelectorAll("[data-mb-tab]")){
  const active=link.dataset.mbTab===value;
  link.classList.toggle("active",active);
  if(active)link.setAttribute("aria-current","page");
  else link.removeAttribute("aria-current");
 }
 account.classList.toggle("active",value==="account");
}
if(onHome){
 nav.addEventListener("click",event=>{
  const anchor=event.target.closest("[data-mb-tab]");
  if(!anchor)return;
  const tab=anchor.dataset.mbTab;
  if(!["home","library","favorites"].includes(tab))return;
  event.preventDefault();
  // Home routes are client-rendered; dispatch through existing route buttons
  // rather than relying on a same-document hash change.
  const local=document.querySelector(`#desktop-nav [data-route="${tab}"]`);
  if(local)local.click();
  else location.hash=tab;
  refresh();
 });
}
window.addEventListener("hashchange",refresh);
refresh();
})();
