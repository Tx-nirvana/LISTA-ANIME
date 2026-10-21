import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {browser} from './helpers/browser.mjs';

test('all feature modules start without breaking existing saved data',async()=>{
 const h=browser({features:true,saved:{'untouched-private-key':'keep'}});await h.flush();
 assert.deepEqual(h.errors.map(String),[]);assert.ok(h.document.querySelector('#share-library'));assert.ok(h.document.querySelector('#install-app'));
 assert.equal(h.saved.get('untouched-private-key'),'keep');assert.equal(h.saved.has('otaku-sharing-v1'),false);
});
test('appearance supports all themes, compact layout and card size without altering the library',async()=>{
 const h=browser({features:true});await h.flush();h.click('#appearance');
 h.document.querySelector('#ui-theme').value='light';h.document.querySelector('#ui-theme').onchange();
 h.document.querySelector('#ui-view').value='list';h.document.querySelector('#ui-view').onchange();
 h.document.querySelector('#ui-size').value='large';h.document.querySelector('#ui-size').onchange();
 assert.equal(h.document.documentElement.dataset.theme,'light');assert.equal(h.document.documentElement.dataset.view,'list');assert.equal(h.document.documentElement.dataset.cardSize,'large');
 assert.equal(Object.keys(h.window.lib).length,0);
});
test('saved book details and an explicit connection notice are usable offline',async()=>{
 const h=browser({features:true});await h.flush();h.run('importLibraryDocument({library:[{id:5000000001,kind:"book",title:"Offline book",syn:"Saved synopsis",lang:"en",genres:[],status:"Em andamento",prog:"12",note:"Saved note"}]})');
 h.window.navigator.onLine=false;h.window.dispatchEvent(new h.window.Event('offline'));const before=h.calls.length;
 h.run('openModal(5000000001)');await h.flush(1);
 assert.equal(h.document.querySelector('#connection-status').hidden,false);assert.equal(h.document.querySelector('#syn').textContent,'Saved synopsis');assert.equal(h.document.querySelector('#mnote').value,'Saved note');assert.equal(h.calls.length,before);
});
test('large libraries render only sixty cards per batch and keep full counts',async()=>{
 const h=browser({features:true});await h.flush();h.window.lib=Object.fromEntries(Array.from({length:205},(_,i)=>[i+1,{id:i+1,title:'Title '+i,kind:'anime',genres:[],tags:[],status:'Completo',rating:4,added:i}]));
 h.run("tab('l')");assert.equal(h.document.querySelectorAll('#libgrid .card').length,60);assert.match(h.document.querySelector('#stats').textContent,/205 título/);
 h.click('#libgrid + [data-library-more]');assert.equal(h.document.querySelectorAll('#libgrid .card').length,120);
 h.document.querySelector('#lq').value='Title 204';h.document.querySelector('#lq').oninput();await h.flush(250);
 assert.equal(h.document.querySelectorAll('#libgrid .card').length,1);
});
test('catalog import does not duplicate a novel saved under another original source',async()=>{
 const h=browser({features:true});await h.flush();h.run('importLibraryDocument({library:[{id:-777,kind:"webnovel",title:"Martial World",rating:5,note:"Keep",tags:["Mine"],status:"Em andamento"}]})');h.run('importNovelCatalog()');h.run('importNovelCatalog()');
 const copies=Object.values(h.window.lib).filter(x=>x.title==='Martial World');assert.equal(copies.length,1);assert.equal(copies[0].id,-777);assert.equal(copies[0].note,'Keep');assert.equal(copies[0].rating,5);
});
test('public projection never copies tokens/account data and private notes are opt-in',async()=>{
 const h=browser({features:true});await h.flush();const m=h.window.OtakuPublicModel;
 const lib=[{id:1,title:'<script>attack</script>',kind:'anime',status:'Completo',rating:5,genres:['Action'],tags:['segredo'],note:'PRIVATE',access_token:'TOKEN',email:'test@example.com',owner_id:'private',links:[{url:'javascript:alert(1)'},{url:'https://source.example/a',site:'Original'}]}];
 const doc=m.project(lib,m.defaults()),raw=JSON.stringify(doc);
 for(const x of ['TOKEN','PRIVATE','test@example.com','owner_id','segredo','javascript:'])assert.equal(raw.includes(x),false);
 assert.equal(doc.items[0].title,'<script>attack</script>');assert.equal(doc.items[0].note,undefined);
 assert.equal(m.project(lib,{...m.defaults(),fields:{note:true}}).items[0].note,'PRIVATE');
 assert.equal(m.project(lib,{...m.defaults(),hidden:['1']}).items.length,0);
 assert.equal(m.project(lib,{...m.defaults(),favorites:true}).items.length,0);
 assert.throws(()=>m.validate({version:1,items:[{id:1,title:'Invalid',kind:'unexpected'}]}));
});
test('preview is required before publishing, and changing privacy invalidates it',async()=>{
 const h=browser({features:true});await h.flush();h.click('#share-library');assert.equal(h.document.querySelector('#share-publish').disabled,true);
 h.click('#share-preview-button');assert.equal(h.document.querySelector('#share-publish').disabled,false);
 const input=h.document.querySelector('#share-name');input.value='New';input.dispatchEvent(new h.window.Event('change',{bubbles:true}));assert.equal(h.document.querySelector('#share-publish').disabled,true);
 assert.equal(h.calls.some(x=>x.url.includes('publish_otaku_profile')),false);
});
test('cloud sharing sends only the reviewed document and can revoke the same ID',async()=>{
 let sent=null,revoked=null;const h=browser({features:true,fetch:async(url,init)=>{
  if(url.includes('/rpc/publish_otaku_profile')){sent=JSON.parse(init.body);return Response.json(sent.profile_id)}
  if(url.includes('/rpc/revoke_otaku_profile')){revoked=JSON.parse(init.body);return Response.json(null)}
 }});await h.flush();h.window.qrcode=()=>({addData(){},make(){},createSvgTag(){return '<svg></svg>'}});
 h.window.OtakuSupabase.session=()=>({access_token:'SECRET',user:{id:'ACCOUNT'}});h.window.OtakuSupabase.refresh=async()=>{};
 h.run('importLibraryDocument({library:[{id:1,title:"Public",note:"PRIVATE",status:"Completo"}]})');h.click('#share-library');h.click('#share-preview-button');h.click('#share-publish');await h.flush(30);
 assert.ok(sent);assert.equal(JSON.stringify(sent).includes('PRIVATE'),false);assert.equal(JSON.stringify(sent).includes('SECRET'),false);assert.equal(sent.document.items.length,1);
 const link=h.document.querySelector('#share-link').value;assert.ok(link.endsWith(sent.profile_id));h.click('#share-revoke');await h.flush(30);assert.equal(revoked.profile_id,sent.profile_id);
});
test('an authenticated owner can recover and revoke a published link on another device',async()=>{
 const id='d683d335-5ea2-4d2a-b87b-46ea1a544cd7';let revoked;
 const h=browser({features:true,fetch:async(url,init)=>{
  if(url.includes('/rpc/list_my_otaku_profiles'))return Response.json([{id,name:'Remote profile'}]);
  if(url.includes('/rpc/revoke_otaku_profile')){revoked=JSON.parse(init.body).profile_id;return Response.json(null)}
 }});await h.flush();h.window.OtakuSupabase.session=()=>({access_token:'SECRET',user:{id:'owner'}});h.window.OtakuSupabase.refresh=async()=>{};
 h.click('#share-library');h.click('#share-my-links');await h.flush(5);h.click('#share-cloud-links button');assert.ok(h.document.querySelector('#share-link').value.endsWith(id));h.click('#share-revoke');await h.flush(5);assert.equal(revoked,id);
});
test('local recommendation ranking excludes owned/blocked works and explains rating matches',async()=>{
 const h=browser({features:true});await h.flush();const ranked=h.window.OtakuDiscovery.rank([{id:1,title:'Owned',kind:'anime',genres:['Action']},{id:2,title:'New',kind:'anime',genres:['Action'],eps:12},{id:3,title:'Blocked',kind:'anime',genres:[]}],[{id:1,title:'Owned',kind:'anime',genres:['Action'],rating:5}],{short:true},{3:true});
 assert.equal(ranked.length,1);assert.match(ranked[0].reason,/5★ para Owned/);
 h.click('#rec');await h.flush(50);assert.equal(h.calls.filter(x=>x.init.body?.includes('recommendations(sort:')).length,0);
});
test('public page has no library/auth scripts and renders only escaped text',()=>{
 const html=fs.readFileSync(new URL('../perfil.html',import.meta.url),'utf8'),script=fs.readFileSync(new URL('../js/profile.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/js\/(?:app|store|sync|sharing)\.js/);assert.doesNotMatch(script,/localStorage\s*\./);assert.match(script,/cache:'no-store'/);assert.match(script,/esc\(x.note\)/);
});
test('persistent API cache has expiry and never caches Supabase/login requests',async()=>{
 const saved=new Map();let calls=0,now=1000000;
 const ctx={window:null,location:{href:'https://site.example/'},crypto:webcrypto,URL,Response,Headers,TextEncoder,AbortController,setTimeout,clearTimeout,Date:class extends Date{static now(){return now}},fetch:async()=>{calls++;return Response.json({ok:true})},caches:{open:async()=>({match:async key=>saved.get(key)?.clone(),put:async(key,r)=>saved.set(key,r),keys:async()=>[...saved.keys()],delete:async k=>saved.delete(k)})}};ctx.window=ctx;
 vm.runInNewContext(fs.readFileSync(new URL('../js/api.js',import.meta.url),'utf8'),ctx);
 await ctx.OtakuAPI.fetch('https://kitsu.io/api/edge/manga');await ctx.OtakuAPI.fetch('https://kitsu.io/api/edge/manga');assert.equal(calls,1);
 now+=86400001;await ctx.OtakuAPI.fetch('https://kitsu.io/api/edge/manga');assert.equal(calls,2);
 await ctx.OtakuAPI.fetch('https://project.supabase.co/auth/v1/user');await ctx.OtakuAPI.fetch('https://project.supabase.co/auth/v1/user');assert.equal(calls,4);assert.equal(saved.size,1);
});
