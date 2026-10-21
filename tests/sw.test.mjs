import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function worker(){
 const events={},deleted=[],writes=[],saved=new Map();
 const key=k=>typeof k==='object'?k.url:String(k);
 const cache={match:async k=>saved.get(key(k)),put:async(k,v)=>{writes.push(key(k));saved.set(key(k),v)},keys:async()=>[...saved.keys()],delete:async k=>saved.delete(key(k)),addAll:async()=>{}};
 const context=vm.createContext({self:{location:{href:'https://example.com/LISTA-ANIME/sw.js'},addEventListener:(k,v)=>events[k]=v,skipWaiting:async()=>{},clients:{claim:async()=>{}}},location:{origin:'https://example.com'},caches:{keys:async()=>['another-project-cache','biblioteca-otaku-v22','biblioteca-otaku-v23-audit'],delete:async k=>deleted.push(k),open:async()=>cache},fetch:async()=>{throw Error('offline')},URL,Response});
 vm.runInContext(source,context);
 const get=async request=>{let response;events.fetch({request,waitUntil:p=>p.catch(()=>{}),respondWith:p=>response=p});return response};
 return {events,deleted,writes,saved,get,context};
}
test('activation removes only Biblioteca Otaku caches',async()=>{
 const h=worker();let done;h.events.activate({waitUntil:p=>done=p});await done;
 assert.deepEqual(h.deleted,['biblioteca-otaku-v22','biblioteca-otaku-v23-audit']);
});
test('an offline navigation resolves to the cached page, or a valid 503 response',async()=>{
 const h=worker(),req={url:'https://example.com/LISTA-ANIME/',method:'GET',mode:'navigate'};
 let r=await h.get(req);assert.equal(r.status,503);
 h.saved.set('https://example.com/LISTA-ANIME/index.html',new Response('saved'));
 r=await h.get(req);assert.equal(await r.text(),'saved');
});
test('viewed cover survives offline and public profiles/auth are never intercepted',async()=>{
 const h=worker();h.saved.set('https://covers.example/seen.jpg',new Response('cover'));
 const r=await h.get({url:'https://covers.example/seen.jpg',method:'GET',destination:'image'});assert.equal(await r.text(),'cover');
 assert.equal(await h.get({url:'https://example.com/LISTA-ANIME/perfil.html',method:'GET',mode:'navigate'}),undefined);
 assert.equal(await h.get({url:'https://example.com/LISTA-ANIME/conta-perfil.html',method:'GET',mode:'navigate'}),undefined);
 assert.equal(await h.get({url:'https://project.supabase.co/rest/v1/rpc/read_otaku_profile',method:'POST'}),undefined);
});
test('cover cache evicts old covers at its bound and never deletes a library',async()=>{
 const h=worker();h.context.fetch=async()=>new Response('new cover');
 for(let i=0;i<60;i++)h.saved.set('https://covers.example/'+i,new Response('old'));
 await h.get({url:'https://covers.example/new.jpg',method:'GET',destination:'image'});
 assert.equal(h.saved.size,60);assert.equal(h.saved.has('https://covers.example/0'),false);assert.equal(h.saved.has('https://covers.example/new.jpg'),true);
});
test('the public novel catalog refreshes online and keeps the latest successful copy offline',async()=>{
 const h=worker(),url='https://example.com/LISTA-ANIME/novels-catalog.json';h.saved.set(url,new Response('old'));
 h.context.fetch=async()=>new Response('fresh');let r=await h.get({url,method:'GET',cache:'no-cache'});assert.equal(await r.text(),'fresh');
 h.context.fetch=async()=>{throw Error('offline')};r=await h.get({url,method:'GET',cache:'no-cache'});assert.equal(await r.text(),'fresh');
});
