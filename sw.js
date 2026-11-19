const CACHE="moviebox-web-shell-v8";
const APP_SHELL=["./","./index.html","./discover.html","./live-tv.html","./offline.html","./styles.css","./app.js","./discover.css","./discover.js","./live-tv.css","./live-tv.js","./tv-guide.js","./pwa.js","./account.html","./account.js","./cloud-sync.js","./sync-status.js","./mobile-nav.js","./mobile-nav.css","./account.css","./manifest.webmanifest","./icon.svg"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("moviebox-web-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 // No API responses, video, channel lists, or streamed content are cached.
 if(/\/(api|backend)\//.test(url.pathname)||/\.(m3u8?|mp4|mpd|ts)(?:$|\?)/i.test(url.pathname))return;
 if(event.request.mode==="navigate"){
  event.respondWith(fetch(event.request).then(response=>{
   if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{})}
   return response;
  }).catch(async()=>await caches.match(event.request)||await caches.match("./offline.html")));
  return;
 }
 const isShell=APP_SHELL.some(path=>url.pathname===new URL(path,self.registration.scope).pathname);
 if(!isShell)return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{})}
  return response;
 }).catch(()=>caches.match(event.request)));
});
