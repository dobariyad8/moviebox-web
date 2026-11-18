import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm";
const URL_BASE="https://nwbwlwfubsgjxroiqvum.supabase.co";
const PUBLISHABLE_KEY="sb_publishable_Dpoh9Yxn56DPl3P2DcP58Q_Pu230qN5";
const TABLE="moviebox_user_backup";
const LIBRARY_KEY="moviebox-web-data-v1";
const MOVIES_KEY="moviebox-rust-watchlist-v1";
const LIVE_KEY="moviebox-live-favorites-v1";
const MAX_BYTES=500000;
const $=selector=>document.querySelector(selector);
const client=createClient(URL_BASE,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
let currentUser=null,cloudBackup=null,busy=false;
function message(text){$("#account-auth-message").textContent=text}
function status(text){$("#account-backup-status").textContent=text}
function read(key,fallback){
 try{const value=JSON.parse(localStorage.getItem(key)||"null");return value&&typeof value==="object"&&!Array.isArray(value)?value:fallback}catch{return fallback}
}
function currentData(){return {
 library:read(LIBRARY_KEY,{items:[],favorites:[],history:[]}),
 movieWatchlist:read(MOVIES_KEY,{}),
 liveFavorites:read(LIVE_KEY,{})
}}
function counts(data){
 return {
 library:Array.isArray(data.library?.items)?data.library.items.length:0,
 movies:Object.keys(data.movieWatchlist||{}).length,
 channels:Object.keys(data.liveFavorites||{}).length
 }
}
function line(text){const p=document.createElement("p");p.textContent=text;return p}
function showSummary(target,data,date){
 const destination=$(target);destination.replaceChildren();
 if(!data){destination.append(line("No backup available yet."));return}
 const c=counts(data);
 destination.append(line(c.library+" library item(s)"),line(c.movies+" saved movie/series title(s)"),line(c.channels+" favorite TV channel(s)"));
 if(date){const stamp=new Date(date);if(!Number.isNaN(stamp.getTime()))destination.append(line("Last backed up: "+stamp.toLocaleString()))}
}
function utf8Bytes(text){return new TextEncoder().encode(text).byteLength}
function validateSnapshot(data){
 if(!data||typeof data!=="object"||Array.isArray(data)||data.version!==1)throw Error("Unsupported cloud backup format.");
 const v=data.collections;
 if(!v||typeof v!=="object"||Array.isArray(v))throw Error("Cloud backup is missing collections.");
 const library=v.library, movies=v.movieWatchlist,live=v.liveFavorites;
 if(!library||!Array.isArray(library.items)||!Array.isArray(library.favorites)||!Array.isArray(library.history))throw Error("Invalid personal library data.");
 if(!movies||typeof movies!=="object"||Array.isArray(movies)||!live||typeof live!=="object"||Array.isArray(live))throw Error("Invalid saved titles or channel favorites.");
 if(library.items.length>5000||library.favorites.length>10000||library.history.length>500||Object.keys(movies).length>1500||Object.keys(live).length>1500)throw Error("Backup contains too many items.");
 if(library.items.some(x=>!x||typeof x.id!=="string"||typeof x.title!=="string"||typeof x.url!=="string"))throw Error("Backup contains invalid library items.");
 if(Object.values(movies).some(x=>!x||typeof x!=="object"||typeof x.id!=="string"||typeof x.title!=="string"))throw Error("Backup contains invalid saved titles.");
 if(Object.values(live).some(x=>!x||typeof x!=="object"||typeof x.title!=="string"||typeof x.url!=="string"))throw Error("Backup contains invalid live favorites.");
 return v;
}
async function refresh(){
 if(!currentUser)return;
 const {data,error}=await client.from(TABLE).select("snapshot,revision,updated_at").eq("user_id",currentUser.id).maybeSingle();
 if(error)throw error;
 cloudBackup=data;
 showSummary("#account-cloud-details",data?.snapshot?.collections,data?.updated_at);
 status(data?"Backup available":"No cloud backup");
 $("#account-restore").disabled=!data;
}
function setBusy(next){
 busy=next;
 for(const id of ["#account-signin button","#account-signout","#account-upload","#account-restore","#account-refresh"]){const b=$(id);if(b)b.disabled=next}
 if(!next)$("#account-restore").disabled=!cloudBackup;
}
async function sessionChanged(user){
 currentUser=user;
 $("#account-signin").hidden=!!user;
 $("#account-signedin").hidden=!user;
 $("#account-backup").hidden=!user;
 $("#account-status-label").textContent=user?"Signed in":"Guest";
 if(!user){$("#account-user").textContent="";cloudBackup=null;message("Guest mode: your content remains on this browser.");return}
 $("#account-user").textContent="Signed in as "+(user.email||"MovieBox member");
 message("Signed in. Backups remain manual; nothing has been uploaded or restored.");
 showSummary("#account-local-details",currentData());
 try{await refresh()}catch(e){status("Cannot load backup: "+e.message)}
}
$("#account-signin").addEventListener("submit",async event=>{
 event.preventDefault();if(busy)return;
 const email=$("#account-email").value.trim();if(!email)return;
 setBusy(true);message("Sending your sign-in link…");
 try{
  const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
  if(error)throw error;
  message("If the address is eligible, a sign-in link will arrive by email. Open it on this device to finish signing in.");
 }catch(e){message("Unable to send sign-in link: "+e.message)}
 finally{setBusy(false)}
});
$("#account-signout").addEventListener("click",async()=>{
 if(busy)return;setBusy(true);
 try{const {error}=await client.auth.signOut();if(error)throw error;await sessionChanged(null)}
 catch(e){message("Sign-out failed: "+e.message)}finally{setBusy(false)}
});
$("#account-refresh").addEventListener("click",async()=>{
 if(!currentUser||busy)return;setBusy(true);status("Checking cloud…");
 try{await refresh();showSummary("#account-local-details",currentData())}catch(e){status("Unable to refresh: "+e.message)}finally{setBusy(false)}
});
$("#account-upload").addEventListener("click",async()=>{
 if(!currentUser||busy)return;
 const collections=currentData(),snapshot={version:1,savedAt:new Date().toISOString(),collections};
 const size=utf8Bytes(JSON.stringify(snapshot));
 if(size>MAX_BYTES){status("Current library is too large to back up ("+Math.round(size/1024)+" KB); limit is approximately 488 KB.");return}
 const info=counts(collections),wouldReplace=!!cloudBackup;
 const confirmText=(wouldReplace?"Replace the cloud backup currently associated with your account?":"Create a cloud backup of this device?")+
  "\n\nItems: "+info.library+" library, "+info.movies+" movie titles, "+info.channels+" live favorites."+
  "\n\nSome saved items may include private media URLs. This action uploads them to Supabase.";
 if(!confirm(confirmText))return;
 setBusy(true);status("Uploading backup…");
 try{
  const revision=(cloudBackup?.revision||0)+1;
  if(cloudBackup){
   // Optimistic locking prevents replacing newer backups from another device.
   const {data,error}=await client.from(TABLE).update({snapshot,revision,updated_at:new Date().toISOString()})
    .eq("user_id",currentUser.id).eq("revision",cloudBackup.revision).select("revision").maybeSingle();
   if(error)throw error;
   if(!data)throw Error("This backup was changed on another device. Refresh before uploading again.");
  }else{
   const {error}=await client.from(TABLE).insert({user_id:currentUser.id,snapshot,revision:1});
   if(error)throw error;
  }
  await refresh();status("Backup saved to your private account.");
 }catch(e){status("Backup failed: "+e.message)}
 finally{setBusy(false)}
});
$("#account-restore").addEventListener("click",async()=>{
 if(!currentUser||busy)return;
 setBusy(true);status("Checking latest cloud backup…");
 try{
  await refresh();
  if(!cloudBackup){status("No cloud backup is available.");return}
  const data=validateSnapshot(cloudBackup.snapshot);
  const cloud=counts(data),local=counts(currentData());
  const warning="Restore your cloud backup to this device?\n\nCloud: "+cloud.library+" library, "+cloud.movies+" movie titles, "+cloud.channels+" TV favorites.\nCurrent device: "+local.library+" library, "+local.movies+" movie titles, "+local.channels+" TV favorites.\n\nThis REPLACES the three saved collections in this browser. Export a personal-library backup first if you want to preserve existing data.";
  if(!confirm(warning)){status("Restore cancelled. Local collections are unchanged.");return}
  const payloads=[[LIBRARY_KEY,data.library],[MOVIES_KEY,data.movieWatchlist],[LIVE_KEY,data.liveFavorites]].map(([key,value])=>[key,JSON.stringify(value)]);
  if(payloads.some(([,value])=>utf8Bytes(value)>MAX_BYTES))throw Error("Cloud collection is too large for browser storage.");
  // Stage the originals so a storage failure can roll back all three collections.
  const original=payloads.map(([key])=>[key,localStorage.getItem(key)]);
  try{for(const [key,value] of payloads)localStorage.setItem(key,value)}
  catch(e){for(const [key,value] of original){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value)}catch{}}throw e}
  status("Restore finished. Reloading MovieBox collections…");location.reload();
 }catch(e){status("Restore failed: "+e.message)}
 finally{setBusy(false)}
});
client.auth.onAuthStateChange((_event,session)=>{
 // Supabase warns against awaiting other Supabase calls synchronously inside this callback.
 setTimeout(()=>sessionChanged(session?.user||null),0);
});
try{
 const {data,error}=await client.auth.getUser();
 if(error&&error.name!=="AuthSessionMissingError")message("Session check: "+error.message);
 await sessionChanged(data?.user||null);
}catch(e){message("Account initialization failed: "+e.message);$("#account-status-label").textContent="Unavailable"}
