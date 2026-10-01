/* Biblioteca Otaku — API única */
(function(){
'use strict';
const cache=new Map(),TTL=86400000;
async function request(key,url,opt={}){
 const hit=cache.get(key);if(hit&&Date.now()-hit.at<TTL)return hit.data;
 const r=await fetch(url,opt),txt=await r.text();let d;try{d=JSON.parse(txt)}catch(e){throw new Error('Resposta inválida da API.')};
 if(!r.ok)throw new Error(d?.message||d?.error||'API indisponível');cache.set(key,{at:Date.now(),data:d});return d;
}
async function anilist(query,variables={}){const d=await request('al:'+query+JSON.stringify(variables),'https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables})});if(d.errors?.length)throw new Error(d.errors[0].message);return d.data}
async function catalog(){if(typeof loadNovelCatalog==='function'){if(!window.novelCatalogLoaded)await loadNovelCatalog();return window.novelCatalog||[]}return[]}
window.OtakuAPI={request,anilist,catalog,clear:()=>cache.clear()};
})();