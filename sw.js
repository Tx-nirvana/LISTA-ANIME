const CACHE='biblioteca-otaku-v17';
const CORE=['./','./index.html','./css/style.css','./js/store.js','./js/api.js','./js/sync.js','./js/app.js','./js/ai.js','./js/reader.js','./manifest.webmanifest'];

self.addEventListener('install',e=>{
 e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
 e.waitUntil(caches.keys()
  .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  .then(()=>self.clients.claim()));
});

self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.origin!==location.origin)return;

 // HTML, JS e CSS: tenta sempre a versão mais nova primeiro.
 const freshAsset=e.request.mode==='navigate'||/\.(?:js|css)$/i.test(u.pathname);
 if(freshAsset){
  e.respondWith(
   fetch(e.request).then(r=>{
    if(r&&r.ok){
     const cp=r.clone();
     caches.open(CACHE).then(c=>c.put(e.request.mode==='navigate'?'./index.html':e.request,cp));
    }
    return r;
   }).catch(()=>e.request.mode==='navigate'?caches.match('./index.html'):caches.match(e.request))
  );
  return;
 }

 e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{
  if(r&&r.ok){const cp=r.clone();caches.open(CACHE).then(x=>x.put(e.request,cp));}
  return r;
 })));
});
