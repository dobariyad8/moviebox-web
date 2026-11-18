const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const {TextEncoder} = require("node:util");
const source = fs.readFileSync(require("node:path").join(__dirname,"..","cloud-sync.js"),"utf8")
  .replace(/^import [^\n]+\n/,"").replace("export const client=","const client=").replace("export const autoSync=","const autoSync=");

const KEY={library:"moviebox-web-data-v1",movieWatchlist:"moviebox-rust-watchlist-v1",liveFavorites:"moviebox-live-favorites-v1"};
const lib={items:[{id:"a",title:"A",url:"https://example.test/a"}],favorites:["a"],history:[]};
const clone = x => JSON.parse(JSON.stringify(x));
const tick = () => new Promise(resolve => setImmediate(resolve));

function backend(){
 const database = {row:null,selected:[]}, listeners=[];
 const client={
  auth:{
   getUser:async()=>({data:{user:{id:"user-1"}}}),
   onAuthStateChange:handler=>{listeners.push(handler)}
  },
  from:()=>{
   let action="select", body=null, rev, columns="snapshot,revision,updated_at";
   const chain={
    select:selection=>{columns=selection;database.selected.push(selection);return chain},
    eq:(key,value)=>{if(key==="revision")rev=value;return chain},
    maybeSingle:async()=>{
     if(action==="update"){
      if(!database.row||database.row.revision!==rev)return {data:null,error:null};
      database.row={...database.row,...clone(body)};
      return {data:{revision:database.row.revision},error:null};
     }
     if(!database.row)return {data:null,error:null};
     const result=Object.fromEntries(columns.split(",").map(k=>k.trim()).filter(k=>Object.hasOwn(database.row,k)).map(k=>[k,clone(database.row[k])]));
     return {data:result,error:null};
    },
    update:obj=>{action="update";body=obj;return chain},
    insert:async obj=>{
     if(database.row)return {error:new Error("duplicate")};
     database.row={...clone(obj),updated_at:new Date().toISOString()};
     return {error:null};
    }
   };
   return chain;
  }
 };
 return {database,client,listeners};
}
function makeDevice(server,initial={}){
 const storage=new Map(Object.entries(initial));
 const events=new Map();
 const localStorage={
  getItem:k=>storage.has(k)?storage.get(k):null,
  setItem:(k,v)=>storage.set(k,String(v)),
  removeItem:k=>storage.delete(k)
 };
 const on=(name,listener)=>{
  if(!events.has(name))events.set(name,[]);
  events.get(name).push(listener);
 };
 class FakeEvent{constructor(type,options){this.type=type;this.detail=options?.detail}}
 const window={
  addEventListener:on,
  dispatchEvent:event=>{for(const fn of events.get(event.type)||[])fn(event)}
 };
 const document={hidden:false,addEventListener:on};
 const context={createClient:()=>server.client,localStorage,window,document,navigator:{onLine:true},
  setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,TextEncoder,CustomEvent:FakeEvent,Event:FakeEvent,
  Date,JSON,Set,Map,Symbol,Error,Object,Array,Number,RegExp};
 const autoSync=vm.runInNewContext(source+"\nautoSync",vm.createContext(context),{filename:"cloud-sync.js"});
 return {autoSync,localStorage,events};
}

test("first device can upload and second device can restore and sync",async()=>{
 const server=backend();
 const a=makeDevice(server,{[KEY.library]:JSON.stringify(lib)});
 await tick();
 await a.autoSync.setup("device");
 assert.equal(server.database.row.revision,1);
 a.localStorage.setItem(KEY.movieWatchlist,JSON.stringify({film:{id:"film",title:"Film"}}));
 await a.autoSync.syncNow();
 assert.equal(server.database.row.revision,2);
 const b=makeDevice(server);
 await tick();
 await b.autoSync.setup("cloud");
 assert.equal(JSON.parse(b.localStorage.getItem(KEY.movieWatchlist)).film.title,"Film");
 b.localStorage.setItem(KEY.liveFavorites,JSON.stringify({news:{title:"News",url:"https://example.test/live"}}));
 await b.autoSync.syncNow();
 const expanded=clone(lib);
 expanded.items.push({id:"b",title:"B",url:"https://example.test/b"});
 a.localStorage.setItem(KEY.library,JSON.stringify(expanded));
 await a.autoSync.syncNow();
 await b.autoSync.syncNow();
 assert.equal(JSON.parse(b.localStorage.getItem(KEY.library)).items.length,2);
 assert.equal(Object.keys(server.database.row.snapshot.collections.liveFavorites).length,1);
 assert.equal(a.autoSync.blocked,false);
 assert.equal(b.autoSync.blocked,false);
});

test("conflicting modifications pause sync rather than overwrite",async()=>{
 const server=backend(), a=makeDevice(server);
 await tick();
 await a.autoSync.setup("device");
 a.localStorage.setItem(KEY.movieWatchlist,JSON.stringify({x:{id:"x",title:"Initial"}}));
 await a.autoSync.syncNow();
 const b=makeDevice(server);
 await tick();
 await b.autoSync.setup("cloud");
 a.localStorage.setItem(KEY.movieWatchlist,JSON.stringify({x:{id:"x",title:"A"}}));
 b.localStorage.setItem(KEY.movieWatchlist,JSON.stringify({x:{id:"x",title:"B"}}));
 await a.autoSync.syncNow();
 await b.autoSync.syncNow();
 assert.equal(b.autoSync.blocked,true);
 assert.match(b.autoSync.status,/Conflicting changes/);
 assert.equal(server.database.row.snapshot.collections.movieWatchlist.x.title,"A");
});

test("idle sync polls only the cloud revision, not the full snapshot",async()=>{
 const server=backend(),device=makeDevice(server,{[KEY.library]:JSON.stringify(lib)});
 await tick();await device.autoSync.setup("device");
 server.database.selected.length=0;
 await device.autoSync.syncNow();
 assert.deepEqual(server.database.selected,["revision"]);
 assert.equal(device.autoSync.status,"Up to date");
});

test("unexpected cloud deletion pauses sync",async()=>{
 const server=backend(),a=makeDevice(server,{[KEY.library]:JSON.stringify(lib)});
 await tick();await a.autoSync.setup("device");
 server.database.row=null;
 await a.autoSync.syncNow();
 assert.equal(a.autoSync.blocked,true);
 assert.match(a.autoSync.status,/Cloud backup was removed/);
});

test("unexpected local collection deletion pauses sync",async()=>{
 const server=backend(),a=makeDevice(server,{[KEY.library]:JSON.stringify(lib)});
 await tick();await a.autoSync.setup("device");
 a.localStorage.removeItem(KEY.library);
 await a.autoSync.syncNow();
 assert.equal(a.autoSync.blocked,true);
 assert.match(a.autoSync.status,/Previously saved local data is missing/);
});
