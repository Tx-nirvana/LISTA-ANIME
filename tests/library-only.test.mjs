import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const obsolete=['otaku-reader-progress','otaku-reader-prefs','otaku-reader-online-progress'];
const store=read('js/store.js');
const app=read('js/app.js');

test('cleanup is repeatable and preserves library, manual progress, login and unknown keys byte for byte',()=>{
 const saved=new Map([
  ['otaku-lib',JSON.stringify({1:{id:1,status:'Em andamento',rating:5,fav:true,tags:['ação'],prog:'12',note:'Minha nota'}})],
  ['otaku-progress-v1','{"1":{"current":12}}'],
  ['otaku-store-v1','{"version":1,"preferences":{},"ai":{}}'],
  ...['otaku-scale','otaku-del','otaku-tk','otaku-gid','otaku-ghu','otaku-prov','otaku-supabase-session-v1','otaku-cloud-v1','theme','custom-reader-key'].map(k=>[k,'preservar']),
  ...obsolete.map(k=>[k,'{"position":42}'])
 ]);
 const before=new Map(saved);
 const context=vm.createContext({window:{addEventListener(){}},localStorage:{getItem:k=>saved.get(k)||null,removeItem:k=>saved.delete(k)}});
 vm.runInContext(store,context);vm.runInContext(store,context);
 for(const [key,value] of before)if(obsolete.includes(key))assert.equal(saved.has(key),false,key);else assert.equal(saved.get(key),value,key);
 assert.ok(context.window.OtakuStore);
});

test('blocked storage does not prevent the store from initializing',()=>{
 const context=vm.createContext({window:{addEventListener(){}},localStorage:{getItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}}});
 assert.doesNotThrow(()=>vm.runInContext(store,context));
 assert.ok(context.window.OtakuStore);
});

test('published entry point, styles and offline cache do not load or expose the reader',()=>{
 const {document}=parseHTML(read('index.html'));
 assert.equal(document.querySelector('script[src*="reader"]'),null);
 assert.equal(document.querySelector('#t-rd,#v-rd,#readOnlineBtn'),null);
 for(const id of ['t-search','t-lib','t-stats','t-lf','t-jg'])assert.ok(document.getElementById(id),id);
 assert.doesNotMatch(read('css/style.css'),/\.rd-|--rd-/);
 assert.doesNotMatch(app,/OtakuReader|readOnlineBtn|\/api\/reader/);
 assert.doesNotMatch(read('sw.js'),/reader\.js|reader-sources\.js/);
 assert.match(document.querySelector('footer').textContent,/não copia os capítulos/);
});

for(const kind of ['manga','novel','webnovel'])test(kind+' keeps external source links without chapter API requests',async()=>{
 const {document}=parseHTML('<div id="where"></div><div id="credits"></div>');
 const item={id:1,kind,type:'MANGA',title:'Martial World',links:[{site:'NovelFull.com',url:'https://novelfull.com/martial-world.html'}],authors:[],studios:[],tr:''};
 const sourceHelpers=app.slice(app.indexOf('function novelSlug('),app.indexOf('function toggleFav('));
 const where=app.slice(app.indexOf('const TIERS='),app.indexOf('/* ---------- login ('));
 const context=vm.createContext({document,lib:{1:item},current:{},$:s=>document.querySelector(s),norm:s=>s.toLowerCase(),esc:s=>s,novelCredits(){},ensureAuthors:async()=>false,fetch(){throw Error('Unexpected API request')},save(){}});
 vm.runInContext(sourceHelpers+'\n'+where,context);
 await vm.runInContext('showWhere(1)',context);
 const links=[...document.querySelectorAll('#where a')];
 assert.ok(links.some(a=>a.getAttribute('href')==='https://novelfull.com/martial-world.html'));
 for(const a of links){assert.equal(a.getAttribute('target'),'_blank');assert.match(a.getAttribute('rel'),/noopener/);assert.match(a.getAttribute('rel'),/noreferrer/)}
 assert.equal(document.querySelector('#readOnlineBtn'),null);
});
