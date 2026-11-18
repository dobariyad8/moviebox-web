import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";
export const client=createClient("https://nwbwlwfubsgjxroiqvum.supabase.co","sb_publishable_Dpoh9Yxn56DPl3P2DcP58Q_Pu230qN5",{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const TABLE="moviebox_user_backup",PREFIX="moviebox-autosync-v1:";
const KEYS={library:"moviebox-web-data-v1",movieWatchlist:"moviebox-rust-watchlist-v1",liveFavorites:"moviebox-live-favorites-v1"};
const DEFAULT={library:{items:[],favorites:[],history:[]},movieWatchlist:{},liveFavorites:{}};
const MAX=500000;
let user=null,enabled=false,base=null,revision=0,running=false,pending=false,blocked=false,timer=null,scheduled=null,latest="Off";
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=x=>JSON.parse(JSON.stringify(x));
function readData(){
 const result={};
 for(const [name,key] of Object.entries(KEYS)){
  try{const v=JSON.parse(localStorage.getItem(key)||"null");result[name]=v&&typeof v==="object"&&!Array.isArray(v)?v:clone(DEFAULT[name])}
  catch{result[name]=clone(DEFAULT[name])}
 }
 return result;
}
function valid(data){
 if(!data||!Array.isArray(data.library?.items)||!Array.isArray(data.library?.favorites)||!Array.isArray(data.library?.history))throw Error("Invalid library format.");
 if(data.library.items.some(x=>!x||typeof x.id!=="string"||typeof x.title!=="string"||typeof x.url!=="string"))throw Error("Invalid saved media.");
 if(!data.movieWatchlist||typeof data.movieWatchlist!=="object"||Array.isArray(data.movieWatchlist)||!data.liveFavorites||typeof data.liveFavorites!=="object"||Array.isArray(data.liveFavorites))throw Error("Invalid saved collections.");
 if(Object.keys(data.movieWatchlist).length>1500||Object.keys(data.liveFavorites).length>1500||data.library.items.length>5000)throw Error("Collection exceeds sync limits.");
 return data;
}
function decode(snapshot){
 if(snapshot?.version!==1)throw Error("Unknown cloud backup version.");
 return valid(snapshot.collections);
}
function notify(value){
 latest=value;
 window.dispatchEvent(new CustomEvent("moviebox:sync-status",{detail:{status:value,enabled,blocked}}));
}
function localChanged(){window.dispatchEvent(new Event("moviebox:remote-update"))}
function putLocal(collections){
 valid(collections);
 const writes=Object.entries(KEYS).map(([name,key])=>[key,JSON.stringify(collections[name])]);
 if(writes.some(([,str])=>new TextEncoder().encode(str).byteLength>MAX))throw Error("One collection exceeds browser storage limits.");
 const previous=writes.map(([key])=>[key,localStorage.getItem(key)]);
 try{for(const [key,value] of writes)localStorage.setItem(key,value)}
 catch(error){for(const [key,value] of previous){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value)}catch{}}throw error}
 localChanged();
}
function snapshotOf(data){const doc={version:1,savedAt:new Date().toISOString(),collections:valid(data)};if(new TextEncoder().encode(JSON.stringify(doc)).byteLength>MAX)throw Error("Sync data is too large (maximum ~488KB).");return doc}
async function fetchCloud(){
 const {data,error}=await client.from(TABLE).select("snapshot,revision,updated_at").eq("user_id",user.id).maybeSingle();
 if(error)throw error;
 return data;
}
function persist(){
 if(!user||!base)return;
 localStorage.setItem(PREFIX+user.id,JSON.stringify({revision,base}));
}
function stateFor(id){
 try{
  const data=JSON.parse(localStorage.getItem(PREFIX+id)||"null");
  if(data&&Number.isSafeInteger(data.revision)&&data.revision>=0&&data.base)return data;
 }catch{}
 return null;
}
// Three-way merge handles additions/removals in separate keys; same-key edits never overwrite silently.
function mergeMap(before,here,there){
 const result={},absent=Symbol("absent");
 for(const key of new Set([...Object.keys(before||{}),...Object.keys(here||{}),...Object.keys(there||{})])){
  const b=Object.hasOwn(before||{},key)?before[key]:absent,l=Object.hasOwn(here||{},key)?here[key]:absent,r=Object.hasOwn(there||{},key)?there[key]:absent;
  const changedL=!equal(l===absent?"__absent__":l,b===absent?"__absent__":b);
  const changedR=!equal(r===absent?"__absent__":r,b===absent?"__absent__":b);
  if(changedL&&changedR&&!equal(l===absent?"__absent__":l,r===absent?"__absent__":r))throw Error("Conflicting changes to '"+key+"'. Open Account & Sync to choose which copy to keep.");
  const value=changedL?l:r;
  if(value!==absent)result[key]=value;
 }
 return result;
}
function keyed(items,key="id"){return Object.fromEntries((items||[]).filter(x=>x&&typeof x[key]==="string").map(x=>[x[key],x]))}
function mergeSets(before,here,there){
 const a=new Set(before||[]),b=new Set(here||[]),c=new Set(there||[]),out=[];
 for(const key of new Set([...a,...b,...c])){
  const prior=a.has(key),l=b.has(key),r=c.has(key);
  const kept=l!==prior?l:r;
  if(kept)out.push(key);
 }
 return out;
}
function merge(before,here,there){
 return valid({
  library:{
   items:Object.values(mergeMap(keyed(before.library.items),keyed(here.library.items),keyed(there.library.items))),
   favorites:mergeSets(before.library.favorites,here.library.favorites,there.library.favorites),
   history:Object.values(mergeMap(keyed(before.library.history),keyed(here.library.history),keyed(there.library.history))).sort((a,b)=>(b.at||0)-(a.at||0)).slice(0,50)
  },
  movieWatchlist:mergeMap(before.movieWatchlist,here.movieWatchlist,there.movieWatchlist),
  liveFavorites:mergeMap(before.liveFavorites,here.liveFavorites,there.liveFavorites)
 });
}
async function upload(collections,remote){
 const snapshot=snapshotOf(collections),next=remote?remote.revision+1:1;
 if(remote){
  const {data,error}=await client.from(TABLE).update({snapshot,revision:next,updated_at:new Date().toISOString()}).eq("user_id",user.id).eq("revision",remote.revision).select("revision").maybeSingle();
  if(error)throw error;
  if(!data)throw Error("Another device updated the cloud; retry sync.");
 }else{
  const {error}=await client.from(TABLE).insert({user_id:user.id,snapshot,revision:1});
  if(error)throw error;
 }
 revision=next;base=clone(collections);persist();
}
async function syncOnce(){
 if(!enabled||!user||blocked||!navigator.onLine)return;
 if(running){pending=true;return}
 running=true;notify("Syncing…");
 try{
  const identity=user.id;
  const remote=await fetchCloud();
  if(!enabled||!user||user.id!==identity)return;
  const here=valid(readData()),there=remote?decode(remote.snapshot):clone(DEFAULT);
  if(!base)throw Error("This device needs a one-time sync setup.");
  if(!remote&&revision>0)throw Error("Cloud backup was removed. Sync is paused to protect the data on this device.");
  const missing=Object.entries(KEYS).some(([name,key])=>localStorage.getItem(key)===null&&!equal(base[name],DEFAULT[name]));
  if(missing)throw Error("Previously saved local data is missing. Sync is paused to prevent accidental deletion.");
  const localDirty=!equal(here,base),cloudDirty=remote?remote.revision!==revision:revision!==0;
  if(!localDirty&&!cloudDirty){notify("Up to date");return}
  if(!localDirty&&cloudDirty){
   putLocal(there);revision=remote?remote.revision:0;base=clone(there);persist();notify("Updated from cloud");return;
  }
  if(localDirty&&!cloudDirty){await upload(here,remote);notify("Saved to cloud");return}
  const combined=merge(base,here,there);
  if(equal(combined,there)){putLocal(there);revision=remote?.revision||0;base=clone(there);persist();notify("Merged from cloud");return}
  await upload(combined,remote);
  if(!equal(here,combined))putLocal(combined);
  notify("Changes merged and synced");
 }catch(e){blocked=/Conflicting changes|needs a one-time sync setup|Unknown cloud backup version|too large|exceeds|Cloud backup was removed|Previously saved local data is missing/.test(e.message);notify((blocked?"Sync paused: ":"Sync retry needed: ")+e.message)}
 finally{
  running=false;
  if(pending&&!blocked){pending=false;setTimeout(()=>syncOnce(),700)}
 }
}
function schedule(){
 if(!enabled||blocked)return;
 clearTimeout(scheduled);
 scheduled=setTimeout(()=>syncOnce(),1800);
}
function bootFor(userValue){
 const previous=user?.id;
 user=userValue;
 enabled=false;base=null;revision=0;blocked=false;pending=false;
 if(!user){notify("Guest mode");return}
 const state=stateFor(user.id);
 if(state){enabled=true;base=state.base;revision=state.revision;notify("Auto sync enabled");schedule()}
 else notify("Sync setup required");
}
client.auth.onAuthStateChange((event,session)=>{
 if(event==="SIGNED_OUT"){bootFor(null);return}
 if(session?.user&&session.user.id!==user?.id)bootFor(session.user);
});
client.auth.getUser().then(({data})=>{if(data?.user&&data.user.id!==user?.id)bootFor(data.user)}).catch(()=>{});
window.addEventListener("moviebox:changed",schedule);
window.addEventListener("storage",event=>{if(Object.values(KEYS).includes(event.key))schedule()});
window.addEventListener("focus",()=>{if(enabled)syncOnce()});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&enabled)syncOnce()});
window.addEventListener("online",()=>{if(enabled)syncOnce()});
timer=setInterval(()=>{if(enabled&&!document.hidden&&!blocked)syncOnce()},20000);
export const autoSync={
 get status(){return latest},get enabled(){return enabled},get blocked(){return blocked},
 async setup(which){
  const {data,error}=await client.auth.getUser();if(error||!data?.user)throw Error("Sign in first.");
  if(!user||user.id!==data.user.id)bootFor(data.user);
  if(running)throw Error("A sync is running. Try again.");
  const remote=await fetchCloud(),local=valid(readData());
  if(which==="cloud"){
   if(!remote)throw Error("No cloud backup to restore.");
   const cloud=decode(remote.snapshot);
   putLocal(cloud);revision=remote.revision;base=clone(cloud);
  }else if(which==="device"){
   await upload(local,remote);
  }else throw Error("Choose cloud or device.");
  enabled=true;blocked=false;persist();notify("Auto sync enabled");schedule();
 },
 async stop(){
  enabled=false;blocked=false;
  if(user)localStorage.removeItem(PREFIX+user.id);
  base=null;revision=0;clearTimeout(scheduled);notify("Auto sync off");
 },
 async retry(){blocked=false;await syncOnce()},
 async syncNow(){await syncOnce()}
};
