import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {browser} from './helpers/browser.mjs';
const key='otaku-profile-session-v1:csuerfegjbfjbmbmgffg.supabase.co';
const token={access_token:'PROFILE_ACCESS',refresh_token:'PROFILE_REFRESH',expires_in:3600,user:{id:'PROFILE_OWNER',email:'private@example.com'}};

test('profile login uses the dedicated project and never changes the library or private sync account',async()=>{
 const h=browser({features:true,saved:{'otaku-supabase-config-v1':'{"url":"https://old.example","key":"OLD"}','otaku-supabase-session-v1':'{"access_token":"OLD_SESSION","expires_at":99999999999}'},fetch:async(url,init)=>{
  if(url.includes('csuerfegjbfjbmbmgffg.supabase.co/auth/v1/token')){assert.equal(JSON.parse(init.body).password,'user-password');return Response.json(token)}
 }});await h.flush();const before=Object.fromEntries(h.saved);
 await h.window.OtakuProfileAuth.login('private@example.com','user-password');
 for(const [k,v] of Object.entries(before))assert.equal(h.saved.get(k),v);
 const stored=h.saved.get(key);assert.ok(stored.includes('PROFILE_ACCESS'));assert.equal(stored.includes('user-password'),false);assert.equal(stored.includes('private@example.com'),false);
 h.click('#share-library');assert.match(h.document.querySelector('#box').textContent,/Conta de compartilhamento conectada/);
 await h.window.OtakuProfileAuth.logout();assert.equal(h.saved.has(key),false);assert.equal(h.saved.get('otaku-supabase-session-v1'),before['otaku-supabase-session-v1']);
});
test('profile refresh shares requests, preserves the session offline, and cannot restore it after logout',async()=>{
 let count=0,resolveRequest,offline=true;
 const h=browser({features:true,saved:{[key]:JSON.stringify({...token,expires_at:1})},fetch:async url=>{
  if(url.includes('grant_type=refresh_token')){count++;if(offline)throw Error('offline');return new Promise(resolve=>{resolveRequest=resolve})}
  if(url.includes('/auth/v1/logout'))return Response.json({});
 }});await h.flush();
 const a=h.window.OtakuProfileAuth.refresh(),b=h.window.OtakuProfileAuth.refresh();await Promise.all([assert.rejects(a,/offline/),assert.rejects(b,/offline/)]);assert.equal(count,1);assert.ok(h.saved.has(key));
 offline=false;const pending=h.window.OtakuProfileAuth.refresh();await new Promise(r=>setImmediate(r));await h.window.OtakuProfileAuth.logout();resolveRequest(Response.json(token));assert.equal(await pending,null);assert.equal(h.saved.has(key),false);
});
test('profile signup needs email confirmation and does not publish or sync anything',async()=>{
 const h=browser({features:true,fetch:async(url,init)=>{
  if(url.includes('/auth/v1/signup')){assert.match(url,/redirect_to=.*conta-perfil.html/);return Response.json({user:{id:'PENDING'}})}
 }});await h.flush();h.click('#share-library');h.document.querySelector('#share-email').value='owner@example.com';h.document.querySelector('#share-password').value='password123';h.click('#share-signup');await h.flush(10);
 assert.match(h.document.querySelector('#share-auth-message').textContent,/confirmação/);assert.equal(h.saved.has(key),false);assert.equal(h.document.querySelector('#share-password').value,'');assert.equal(h.calls.some(x=>x.url.includes('/rpc/publish_')),false);
});
test('confirmation page validates the bearer against its own project and removes URL tokens before rendering',async()=>{
 const saved=new Map(),status={textContent:''},calls=[];let cleared=false;
 const ctx={window:null,URL,URLSearchParams,Date,localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},document:{querySelector:()=>status},history:{replaceState(){cleared=true}},location:{hash:'#access_token=CONFIRM_TOKEN&refresh_token=REFRESH&type=signup',pathname:'/conta-perfil.html',search:''},fetch:async(url,init)=>{assert.equal(cleared,true);calls.push({url,init});return Response.json({id:'CONFIRMED_USER'})},OtakuPublicConfig:{url:'https://project.supabase.co',key:'PUBLIC_KEY'}};ctx.window=ctx;
 vm.runInNewContext(fs.readFileSync(new URL('../js/profile-auth.js',import.meta.url),'utf8'),ctx);await new Promise(r=>setImmediate(r));
 assert.equal(calls[0].url,'https://project.supabase.co/auth/v1/user');assert.equal(calls[0].init.headers.Authorization,'Bearer CONFIRM_TOKEN');assert.match(status.textContent,/E-mail confirmado/);assert.equal(saved.size,1);
 const html=fs.readFileSync(new URL('../conta-perfil.html',import.meta.url),'utf8');assert.doesNotMatch(html,/js\/(?:app|sharing|store|sync)\.js/);
});
