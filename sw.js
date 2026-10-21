const CACHE='biblioteca-otaku-v29',COVERS='biblioteca-otaku-covers-v1';
const CORE=['./','./index.html','./css/style.css?v=29','./css/features.css?v=29','./js/features-core.js?v=29','./js/store.js?v=29','./js/api.js?v=29','./js/sync.js','./js/app.js?v=29','./js/ai.js?v=29','./js/ui.js?v=29','./js/features.js?v=29','./js/profile-auth.js?v=29','./js/sharing.js?v=29','./js/discovery.js?v=29','./js/public-model.js?v=29','./js/public-config.js?v=29','./icon.svg','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./novels-catalog.json'];
const KEEP=new Set([CACHE,COVERS,'biblioteca-otaku-api-v1']);
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('biblioteca-otaku-')&&!KEEP.has(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
async function save(cache,key,response,max){
 try{await cache.put(key,response);if(max){const keys=await cache.keys();await Promise.all(keys.slice(0,Math.max(0,keys.length-max)).map(k=>cache.delete(k)))}}catch(e){/* Cache é descartável; nunca limpa a biblioteca. */}
}
self.addEventListener('message',e=>{
 if(e.data?.type!=='cache-viewed-covers'||!Array.isArray(e.data.urls))return;
 const urls=e.data.urls.slice(0,60);e.waitUntil((async()=>{const cache=await caches.open(COVERS);for(const raw of urls){try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||await cache.match(raw))continue;const response=await fetch(raw,{mode:'no-cors',credentials:'omit',referrerPolicy:'no-referrer'});if(response.ok||response.type==='opaque')await save(cache,raw,response,60)}catch(error){}}})());
});
self.addEventListener('fetch',e=>{
 const request=e.request;if(request.method!=='GET')return;const u=new URL(request.url);
 if(request.destination==='image'&&['https:','http:'].includes(u.protocol)&&!u.searchParams.has('access_token')){
  e.respondWith((async()=>{
   const cache=await caches.open(COVERS),saved=await cache.match(request);if(saved)return saved;
   try{const response=await fetch(request);if(response.ok||response.type==='opaque')await save(cache,request,response.clone(),60);return response}catch(error){return (await (await caches.open(CACHE)).match(new URL('./icon.svg',self.location.href).href))||new Response('',{status:503})}
  })());return;
 }
 // Não guarda autenticação, documentos públicos revogáveis ou serviços externos.
 if(u.origin!==location.origin||/\/(?:api|rest|auth)\//.test(u.pathname)||/\/(?:signin-with-chatgpt|signout-with-chatgpt|callback)/.test(u.pathname))return;
 const catalog=u.pathname.endsWith('/novels-catalog.json'),profile=u.pathname.endsWith('/perfil.html');
 if(profile||u.pathname.endsWith('/conta-perfil.html'))return;
 const key=request.mode==='navigate'?new URL('./index.html',self.location.href).href:catalog?u.origin+u.pathname:request;
 e.respondWith((async()=>{
  const cache=await caches.open(CACHE),saved=await cache.match(key);
  if(catalog){try{const r=await fetch(request);if(r.ok){if(request.cache!=='no-store')await save(cache,key,r.clone());return r}if(saved)return saved;return r}catch(error){if(saved)return saved}}
  if(saved){if(request.mode==='navigate')e.waitUntil(fetch(request).then(async r=>{if(r.ok&&request.cache!=='no-store')await save(cache,key,r)}).catch(()=>{}));return saved}
  try{const r=await fetch(request);if(r.ok&&request.cache!=='no-store')await save(cache,key,r.clone());return r}catch(error){return new Response('Sem conexão. Abra novamente depois de visitar o aplicativo online.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})}
 })());
});
