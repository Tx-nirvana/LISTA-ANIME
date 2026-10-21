/* Biblioteca Otaku — API única */
(function(){
'use strict';
const cache=new Map(),TTL=86400000;
async function networkFetch(url,opt={}){
 const controller=new AbortController(),abort=()=>controller.abort();
 if(opt.signal?.aborted)abort();else opt.signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,20000);
 try{return await fetch(url,{...opt,signal:controller.signal})}
 finally{clearTimeout(timer);opt.signal?.removeEventListener('abort',abort)}
}
const inflight=new Map(),PUBLIC_HOSTS=new Set(['graphql.anilist.co','kitsu.io','www.googleapis.com','openlibrary.org','api.themoviedb.org','api.rawg.io','www.cheapshark.com','query.wikidata.org']);
async function anilistSuspended(response,host){
 if(host!=='graphql.anilist.co'||response.status!==403)return false;
 try{const data=await response.clone().json();return data?.errors?.some(e=>/API has been temporarily disabled/i.test(e.message||''))||false}catch(e){return false}
}
function staleResponse(response){const headers=new Headers(response.headers);headers.set('X-Otaku-Stale','1');return new Response(response.body,{status:response.status,headers})}
async function timedFetch(url,opt={}){
 let u;try{u=new URL(url,location.href)}catch(e){return networkFetch(url,opt)}
 const allowed=PUBLIC_HOSTS.has(u.hostname)&&!u.pathname.includes('/drive/')&&!u.pathname.includes('/upload/')&&!u.pathname.includes('/oauth')&&(!opt.method||opt.method==='GET'||u.hostname==='graphql.anilist.co'&&opt.method==='POST');
 if(!allowed||!globalThis.caches||!globalThis.crypto?.subtle||opt.cache==='no-store')return networkFetch(url,opt);
 const identity=String(url)+'|'+(opt.method||'GET')+'|'+(opt.body||'')+'|'+JSON.stringify(opt.headers||{});
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const key=new URL('./__api_cache__/'+hash,location.href).href;
 let disk,hit;try{disk=await caches.open('biblioteca-otaku-api-v1');hit=await disk.match(key)}catch(e){return networkFetch(url,opt)}
 const age=hit?Date.now()-Number(hit.headers.get('X-Otaku-Cached-At')||0):Infinity;
 if(hit&&age<TTL)return hit;
 if(inflight.has(key))return (await inflight.get(key)).clone();
 const task=(async()=>{
  try{
   const r=await networkFetch(url,opt);
   if(!r.ok){if(hit&&age<TTL*7&&(r.status>=500||await anilistSuspended(r,u.hostname)))return staleResponse(hit);return r}
   const type=r.headers.get('Content-Type')||'';
   if(type.includes('json')){
    const body=await r.clone().text();let valid=true;try{valid=!JSON.parse(body)?.errors?.length}catch(e){valid=false}
    if(valid&&body.length<1000000){const headers=new Headers(r.headers);headers.set('X-Otaku-Cached-At',String(Date.now()));try{await disk.put(key,new Response(body,{status:r.status,headers}));const keys=await disk.keys();await Promise.all(keys.slice(0,Math.max(0,keys.length-80)).map(k=>disk.delete(k)))}catch(e){}}
   }
   return r;
  }catch(e){if(hit&&age<TTL*7&&e.name!=='AbortError')return staleResponse(hit);throw e}
 })();
 inflight.set(key,task);try{return (await task).clone()}finally{inflight.delete(key)}
}
async function request(key,url,opt={}){
 const hit=cache.get(key);if(hit&&Date.now()-hit.at<TTL)return hit.data;
 const r=await timedFetch(url,opt),txt=await r.text();let d;try{d=JSON.parse(txt)}catch(e){throw new Error('Resposta inválida da API.')};
 if(!r.ok)throw new Error(d?.message||d?.error||'API indisponível');if(d?.errors?.length)throw new Error(d.errors[0].message);cache.set(key,{at:Date.now(),data:d});return d;
}
async function anilist(query,variables={}){const d=await request('al:'+query+JSON.stringify(variables),'https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables})});if(d.errors?.length)throw new Error(d.errors[0].message);return d.data}
async function catalog(){if(typeof loadNovelCatalog==='function'){if(!novelCatalogLoaded)await loadNovelCatalog();return novelCatalog||[]}return[]}
window.OtakuAPI={fetch:timedFetch,request,anilist,catalog,clear:()=>cache.clear()};
})();
