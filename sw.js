const CACHE='biblioteca-otaku-v23-audit';
const CORE=['./','./index.html','./css/style.css?v=23','./js/store.js?v=23','./js/api.js?v=23','./js/sync.js','./js/app.js?v=23','./js/ai.js?v=23','./js/ui.js?v=23','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>{
 e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
 e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('biblioteca-otaku-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.origin!==location.origin||u.pathname.includes('/api/')||/\/(?:signin-with-chatgpt|signout-with-chatgpt|callback)/.test(u.pathname))return;
 const catalog=u.pathname.endsWith('/novels-catalog.json');
 const key=e.request.mode==='navigate'?new URL('./index.html',self.location.href).href:catalog?u.origin+u.pathname:e.request;
 const fresh=e.request.mode==='navigate'||catalog||/\.(?:js|css)$/i.test(u.pathname);
 const update=async()=>{
  const response=await fetch(e.request);
  if(response.ok&&e.request.cache!=='no-store'){
   try{const cache=await caches.open(CACHE);await cache.put(key,response.clone())}catch(e){}
  }
  return response;
 };
 e.respondWith((async()=>{
  const cache=await caches.open(CACHE),saved=await cache.match(key);
  if(!fresh&&saved)return saved;
  try{return await update()}catch(e){return saved||new Response('Sem conexão. Tente novamente quando estiver online.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})}
 })());
});
