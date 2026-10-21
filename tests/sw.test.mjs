import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function worker(){
 const events={},deleted=[],writes=[],saved=new Map();
 const cache={match:async k=>saved.get(String(k)),put:async(k,v)=>{writes.push(String(k));saved.set(String(k),v)},addAll:async()=>{}};
 const context=vm.createContext({self:{location:{href:'https://example.com/LISTA-ANIME/sw.js'},addEventListener:(k,v)=>events[k]=v,skipWaiting:async()=>{},clients:{claim:async()=>{}}},location:{origin:'https://example.com'},caches:{keys:async()=>['another-project-cache','biblioteca-otaku-v22','biblioteca-otaku-v23-audit'],delete:async k=>deleted.push(k),open:async()=>cache},fetch:async()=>{throw Error('offline')},URL,Response});
 vm.runInContext(source,context);
 const get=async request=>{let response;events.fetch({request,respondWith:p=>response=p});return response};
 return {events,deleted,writes,saved,get};
}
test('activation removes only Biblioteca Otaku caches',async()=>{
 const h=worker();let done;h.events.activate({waitUntil:p=>done=p});await done;
 assert.deepEqual(h.deleted,['biblioteca-otaku-v22']);
});
test('an offline navigation resolves to the cached page, or a valid 503 response',async()=>{
 const h=worker(),req={url:'https://example.com/LISTA-ANIME/',method:'GET',mode:'navigate'};
 let r=await h.get(req);assert.equal(r.status,503);
 h.saved.set('https://example.com/LISTA-ANIME/index.html',new Response('saved'));
 r=await h.get(req);assert.equal(await r.text(),'saved');
});
