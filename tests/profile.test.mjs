import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
async function page(hash,payload){
 const {window:dom}=parseHTML(fs.readFileSync(new URL('../perfil.html',import.meta.url),'utf8'));const calls=[];let data=payload;
 dom.HTMLElement.prototype.showModal=function(){this.open=true};dom.HTMLElement.prototype.close=function(){this.open=false};
 const ctx={window:null,document:dom.document,location:{hash,origin:'https://example.com'},URL,Response,AbortController,setTimeout,clearTimeout,setInterval(){},navigator:{onLine:true},addEventListener:dom.addEventListener.bind(dom),dispatchEvent:dom.dispatchEvent.bind(dom),fetch:async(url,opt)=>{calls.push({url,opt});return Response.json(data)},OtakuPublicConfig:{url:'https://test.supabase.co',key:'public'}};
 Object.defineProperty(ctx,'localStorage',{get(){throw Error('Public page touched private storage')}});ctx.window=ctx;
 vm.createContext(ctx);for(const file of ['public-model','profile'])vm.runInContext(fs.readFileSync(new URL('../js/'+file+'.js',import.meta.url),'utf8'),ctx);
 const flush=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r))};await flush();
 return {document:dom.document,calls,ctx,flush,set:d=>data=d};
}
const id='#d683d335-5ea2-4d2a-b87b-46ea1a544cd7';
test('public profile escapes malicious content and exposes no editing action',async()=>{
 const p=await page(id,{version:1,name:'<img src=x onerror=alert(1)>',about:'Public',updatedAt:1,items:[{id:1,kind:'anime',title:'<script>bad()</script>',status:'Completo',rating:5,note:'<img onerror=bad()>',genres:['Action'],links:[{site:'Unsafe',url:'javascript:bad()'}]}]});
 assert.equal(p.document.querySelector('#profile-name img'),null);assert.equal(p.document.querySelector('#profile-grid script'),null);assert.equal(p.document.querySelectorAll('#profile-grid .card').length,1);
 assert.equal(p.document.querySelector('#add,#imp,#sbtn'),null);assert.equal(p.calls[0].opt.cache,'no-store');assert.equal(p.calls[0].opt.headers.Authorization,undefined);
 p.document.querySelector('#profile-grid .card').click();assert.equal(p.document.querySelector('#public-detail-body img[onerror]'),null);assert.equal(p.document.querySelector('#public-detail-body a'),null);
});
test('revoked profile clears both the grid and an open details dialog',async()=>{
 const p=await page(id,{version:1,updatedAt:1,items:[{id:1,kind:'anime',title:'Visible',genres:[]}]});p.document.querySelector('#profile-grid .card').click();
 p.set(null);p.ctx.dispatchEvent(new p.ctx.document.defaultView.Event('focus'));await p.flush();
 assert.equal(p.document.querySelector('#profile-content').hidden,true);assert.equal(p.document.querySelector('#profile-grid').textContent,'');assert.equal(p.document.querySelector('#public-detail').open,false);assert.match(p.document.querySelector('#profile-message').textContent,/revogado/);
});
test('invalid public ID never sends a network request',async()=>{
 const p=await page('#invalid',null);assert.equal(p.calls.length,0);assert.match(p.document.querySelector('#profile-message').textContent,/inválido/);
});
test('public SQL isolates the document table and requires ownership for mutations',()=>{
 const sql=fs.readFileSync(new URL('../sql/public-profiles.sql',import.meta.url),'utf8');
 assert.match(sql,/alter table otaku_private\.public_profiles enable row level security/i);assert.match(sql,/with check \(\(select auth.uid\(\)\) = owner_id\)/);
 assert.match(sql,/revoke all on otaku_private.public_profiles from public, anon/);assert.doesNotMatch(sql,/grant select[^;]+to anon/i);
 assert.match(sql,/otaku_private.read_profile\(profile_id uuid\)/);assert.match(sql,/security definer set search_path = ''/);
});
