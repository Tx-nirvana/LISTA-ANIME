import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {browser} from './helpers/browser.mjs';
const suspended={errors:[{message:'The AniList API has been temporarily disabled due to severe stability issues.',status:403}],data:null};

test('AniList suspension explains the outage, preserves the library and can retry after recovery',async()=>{
 let down=true;const h=browser({fetch:async url=>{if(url==='https://graphql.anilist.co'&&down)return Response.json(suspended,{status:403})}});await h.flush();
 assert.match(h.document.querySelector('#smsg').textContent,/AniList suspendeu temporariamente/);
 h.run('importLibraryDocument({library:[{id:123,title:"Saved",status:"Em andamento",rating:5,fav:true,note:"PRIVATE"}]})');const before=h.saved.get('otaku-lib');
 h.click('#more');await h.flush();assert.equal(h.saved.get('otaku-lib'),before);
 h.run("tab('l')");assert.equal(h.document.querySelectorAll('#libgrid .card').length,1);assert.equal(h.window.lib[123].note,'PRIVATE');
 down=false;h.run("tab('s')");h.click('#more');await h.flush();assert.ok(h.document.querySelector('#results .card'));assert.equal(h.saved.get('otaku-lib'),before);
});
test('network errors use Portuguese guidance and cached results disclose their age',async()=>{
 const h=browser({fetch:async url=>{if(url==='https://graphql.anilist.co')throw TypeError('Failed to fetch')}});await h.flush();
 assert.match(h.document.querySelector('#smsg').textContent,/Não foi possível conectar ao AniList/);assert.doesNotMatch(h.document.querySelector('#smsg').textContent,/Failed to fetch/);
 const cached=browser({fetch:async(url,init)=>{if(url==='https://graphql.anilist.co'&&JSON.parse(init.body).query.includes('pageInfo'))return Response.json({data:{Page:{media:[],pageInfo:{hasNextPage:false}}}},{headers:{'X-Otaku-Stale':'1'}})}});await cached.flush();
 assert.match(cached.document.querySelector('#smsg').textContent,/consulta salva anteriormente/);
});
test('expired public API cache falls back for the documented AniList suspension, never arbitrary 403 or older than seven days',async()=>{
 const saved=new Map();let now=1000000,mode='ok';
 const ctx={window:null,location:{href:'https://site.example/'},crypto:webcrypto,URL,Response,Headers,TextEncoder,AbortController,setTimeout,clearTimeout,Date:class extends Date{static now(){return now}},fetch:async()=>mode==='ok'?Response.json({data:{value:123}}):mode==='suspended'?Response.json(suspended,{status:403}):Response.json({errors:[{message:'Access denied'}]},{status:403}),caches:{open:async()=>({match:async key=>saved.get(key)?.clone(),put:async(key,r)=>saved.set(key,r),keys:async()=>[...saved.keys()],delete:async k=>saved.delete(k)})}};ctx.window=ctx;
 vm.runInNewContext(fs.readFileSync(new URL('../js/api.js',import.meta.url),'utf8'),ctx);
 const options={method:'POST',headers:{'Content-Type':'application/json'},body:'{"query":"{test}"}'};
 await ctx.OtakuAPI.fetch('https://graphql.anilist.co',options);assert.equal(saved.size,1);
 now+=86400001;mode='suspended';let result=await ctx.OtakuAPI.fetch('https://graphql.anilist.co',options);assert.equal(result.status,200);assert.equal(result.headers.get('X-Otaku-Stale'),'1');assert.equal((await result.json()).data.value,123);
 mode='forbidden';result=await ctx.OtakuAPI.fetch('https://graphql.anilist.co',options);assert.equal(result.status,403);assert.equal(result.headers.get('X-Otaku-Stale'),null);
 now+=7*86400000;mode='suspended';result=await ctx.OtakuAPI.fetch('https://graphql.anilist.co',options);assert.equal(result.status,403);assert.equal(saved.size,1);
});
