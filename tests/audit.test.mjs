import test from 'node:test';
import assert from 'node:assert/strict';
import {browser} from './helpers/browser.mjs';

test('movies earn XP only after completion',async()=>{
 const h=browser();await h.flush();
 h.run('importLibraryDocument({library:[{id:7000000055,kind:"movie",title:"Movie",rt:120,status:"Quero ver/ler",rating:4,note:"Teste",added:1}]})');
 assert.equal(h.window.OtakuLevel.calc().total,0);
 h.run('lib[7000000055].status="Em andamento";save(lib[7000000055])');
 assert.equal(h.window.OtakuLevel.calc().total,0);
 h.run('lib[7000000055].status="Completo";save(lib[7000000055])');
 assert.ok(h.window.OtakuLevel.calc().total>=220);
});

test('failed catalog search exposes a working retry without reloading the page',async()=>{
 let fail=true;
 const h=browser({fetch:async url=>{if(url==='https://graphql.anilist.co'&&fail)throw Error('offline')}});
 await h.flush();assert.equal(h.document.querySelector('#more').textContent,'Tentar novamente');
 fail=false;h.click('#more');await h.flush();
 assert.ok(h.document.querySelector('#results .card'));assert.equal(h.document.querySelector('#more').textContent,'Carregar mais');
});

test('all startup timers finish without uncaught console errors or duplicate IDs',async()=>{
 const h=browser();await h.flush();
 assert.deepEqual(h.errors.map(String),[]);
 const ids=[...h.document.querySelectorAll('[id]')].map(x=>x.id);
 assert.equal(new Set(ids).size,ids.length);
});

test('add, status, rating, favorite, filters and deletion preserve the expected fields',async()=>{
 const h=browser();await h.flush();h.run('openModal(123)');await h.flush(50);h.click('#add');
 assert.equal(h.window.lib[123].status,'Quero ver/ler');
 h.click('#stars [data-n="4"]');assert.equal(h.window.lib[123].rating,4);assert.equal(h.window.lib[123].status,'Quero ver/ler');
 h.click('#fav');assert.equal(h.window.lib[123].fav,true);
 h.document.querySelector('#mst').value='Em andamento';h.document.querySelector('#mst').onchange({target:h.document.querySelector('#mst')});
 h.run("tab('l')");h.click('#lfav');h.document.querySelector('#lmin').value='4';h.document.querySelector('#lmin').oninput();
 assert.equal(h.document.querySelectorAll('#libgrid .card').length,1);
 assert.ok(h.document.querySelector('#lfav').classList.contains('on'));
 h.run('openModal(123)');h.click('#rm');assert.equal(h.window.lib[123],undefined);
 assert.ok(JSON.parse(h.saved.get('otaku-del'))[123]);
});

test('a malformed import is atomic and a full backup imports books and tags',async()=>{
 const h=browser();await h.flush();h.run('openModal(123)');h.click('#add');
 const before=JSON.stringify(h.window.lib);
 assert.throws(()=>h.run('importLibraryDocument({library:[{id:200,title:"valid"},null]})'));
 assert.equal(JSON.stringify(h.window.lib),before);
 h.run('importLibraryDocument({ratingScale:5,library:[{id:5000000001,kind:"book",title:"Book",rating:4,fav:true,tags:["A"],note:"<3",status:"Em andamento",ref:"gABC"}]})');
 assert.equal(h.window.lib[5000000001].kind,'book');assert.equal(h.window.lib[5000000001].note,'<3');
 assert.equal(h.window.lib[5000000001].rating,4);
});

test('corrupt saved library is never replaced by the startup empty state',async()=>{
 const raw='{"123":';const h=browser({saved:{'otaku-lib':raw}});await h.flush();
 assert.equal(h.saved.get('otaku-lib'),raw);
});

test('cloud merge preserves newer edits, both devices and deletion tombstones',async()=>{
 const h=browser();await h.flush();
 const local={library:[{id:1,title:'Local',rating:1,updatedAt:30},{id:2,title:'Removed',updatedAt:10}],deleted:{2:20},progress:{1:{current:4,updated:20}}};
 const remote={library:[{id:1,title:'Remote',rating:5,updatedAt:10},{id:2,title:'Old',updatedAt:10},{id:3,title:'Other',updatedAt:15}],progress:{1:{current:2,updated:10}}};
 const merged=h.window.OtakuStore.merge(local,remote);
 assert.deepEqual(Array.from(merged.library,x=>Number(x.id)).sort(),[1,3]);assert.equal(merged.library.find(x=>x.id===1).rating,1);
 assert.equal(merged.progress[1].current,4);assert.equal(merged.deleted[2],20);
});

test('multi-key storage writes roll back before applying a partial import',async()=>{
 let fail=false;
 const h=browser({beforeWrite(key){if(fail&&key==='otaku-del'){fail=false;throw Error('Quota')}}});await h.flush();
 const before=h.saved.get('otaku-lib');fail=true;
 assert.throws(()=>h.window.OtakuStore.import({library:[{id:9,title:'New'}]}));
 assert.equal(h.saved.get('otaku-lib'),before);assert.equal(h.window.lib[9],undefined);
});

test('a search requested while loading is not discarded',async()=>{
 let release;const gate=new Promise(r=>release=r);
 const h=browser({fetch:async(url,init)=>{
  if(url!=='https://graphql.anilist.co')return;
  const {variables:v}=JSON.parse(init.body);
  if(v?.s==='old')await gate;
  if(v?.s==='old'||v?.s==='new')return Response.json({data:{Page:{media:[h.media(v.s==='old'?200:201,v.s)],pageInfo:{hasNextPage:false}}}});
 }});
 await h.flush();h.document.querySelector('#q').value='old';const pending=h.run('search(true)');
 await new Promise(r=>setImmediate(r));h.document.querySelector('#q').value='new';await h.run('search(true)');release();await pending;await h.flush(20);
 assert.match(h.document.querySelector('#results').textContent,/new/);assert.doesNotMatch(h.document.querySelector('#results').textContent,/old/);
});

test('WEB Novel combined with Anime returns both selected kinds',async()=>{
 const h=browser();await h.flush();await h.run("kSet.clear();kSet.add('webnovel');kSet.add('anime');search(true)");await h.flush(20);
 const text=h.document.querySelector('#results').textContent;
 assert.match(text,/Martial World/);assert.match(text,/Example/);
});

test('a delayed response cannot replace the details of the next title',async()=>{
 let release;const gate=new Promise(r=>release=r);
 const h=browser({fetch:async(url,init)=>{
  if(url!=='https://graphql.anilist.co')return;
  const d=JSON.parse(init.body);if(!d.query.includes('externalLinks'))return;
  if(d.variables.id===123)await gate;
  return Response.json({data:{Media:{externalLinks:[{site:'Source '+d.variables.id,url:'https://example.org/'+d.variables.id,type:'STREAMING'}],trailer:null,staff:{edges:[]},studios:{edges:[]}}}});
 }});
 await h.flush();h.run('openModal(123)');h.window.current[456]=h.run('slim('+JSON.stringify(h.media(456,'Second'))+')');h.run('openModal(456)');
 await new Promise(r=>setImmediate(r));release();await h.flush(80);
 assert.match(h.document.querySelector('#where').textContent,/Source 456/);assert.doesNotMatch(h.document.querySelector('#where').textContent,/Source 123/);
});

test('book recommendations reuse catalog IDs and open add/favorite controls',async()=>{
 const h=browser({fetch:async url=>url.includes('www.googleapis.com/books/v1/volumes?')?Response.json({items:[{id:'ABC',volumeInfo:{title:'Book recommendation',authors:['Author'],categories:['Fiction'],averageRating:4}}],totalItems:1}):undefined});
 await h.flush();h.click('#lf-rec [data-rt="book"]');h.click('#lf-rec-go');await h.flush(30);
 const card=h.document.querySelector('#lf-rec-out .card');assert.ok(card);
 const expected=h.window.OtakuExtras.bookItem({id:'ABC',volumeInfo:{title:'Book recommendation'}}).id;
 assert.equal(Number(card.dataset.id),expected);h.run('openModal('+expected+')');assert.ok(h.document.querySelector('#add'));h.click('#add');
 assert.equal(h.window.lib[expected].ref,'gABC');assert.equal(h.window.lib[expected].kind,'book');
});

test('stored books, long tags and literal notes survive reload and HTML is escaped',async()=>{
 const tags=Array.from({length:30},(_,i)=>'Tag '+i);
 const h=browser({saved:{'otaku-lib':JSON.stringify({5000000001:{id:5000000001,title:'<img src=x onerror=bad()>',kind:'book',rating:4,status:'Em andamento',tags,note:'<3',ref:'gABC'}})}});
 await h.flush();assert.equal(h.window.lib[5000000001].kind,'book');assert.equal(h.window.lib[5000000001].tags.length,30);
 h.run('openModal(5000000001)');assert.equal(h.document.querySelector('h2 img'),null);assert.equal(h.window.lib[5000000001].note,'<3');
});

test('Supabase retries a conflicting write and never drops either device library',async()=>{
 let patches=0,reads=0,stored;
 const h=browser({fetch:async(url,init)=>{
  if(!url.includes('.supabase.co'))return;
  if(url.includes('/auth/v1/token'))return Response.json({access_token:'test',refresh_token:'refresh',expires_in:3600,user:{id:'user-1',email:'test@example.invalid'}});
  if(url.includes('/auth/v1/user'))return Response.json({id:'user-1'});
  if(!init.method){reads++;return Response.json([{updated_at:reads===1?'2026-01-01T00:00:00Z':'2026-01-02T00:00:00Z',data:{library:[{id:2,title:'Remote',updatedAt:10},...(reads>1?[{id:3,title:'Concurrent',updatedAt:20}]:[])]}}])}
  if(init.method==='PATCH'){patches++;stored=JSON.parse(init.body).data;return Response.json(patches===1?[]:[{user_id:'user-1'}])}
 }});
 await h.flush();h.run('importLibraryDocument({library:[{id:1,title:"Local"}]})');await h.window.OtakuSupabase.login('test@example.invalid','test');
 await h.window.OtakuSupabase.sync('sync');
 assert.equal(patches,2);assert.deepEqual(Array.from(stored.library,x=>Number(x.id)).sort(),[1,2,3]);
 assert.equal(h.window.lib[1].title,'Local');assert.equal(h.window.lib[2].title,'Remote');
 h.window.OtakuSupabase.logout();assert.equal(h.window.OtakuSupabase.session(),null);
});

test('refresh is shared and transient network failure keeps the current session',async()=>{
 let refreshes=0,fail=false;
 const h=browser({fetch:async url=>{if(!url.includes('/auth/v1/token'))return;refreshes++;if(fail)throw Error('offline');return Response.json({access_token:'new-token',refresh_token:'new-refresh',expires_in:3600,user:{id:'u'}})}});
 await h.flush();h.saved.set('otaku-supabase-session-v1',JSON.stringify({access_token:'old',refresh_token:'r',user:{id:'u'}}));
 await Promise.all([h.window.OtakuSupabase.refresh(true),h.window.OtakuSupabase.refresh(true)]);assert.equal(refreshes,1);
 fail=true;await h.window.OtakuSupabase.refresh(true);assert.equal(h.window.OtakuSupabase.session().access_token,'new-token');
});

test('modal and rating controls expose labels and keyboard interaction',async()=>{
 const h=browser();await h.flush();h.run('openModal(123)');h.click('#add');await h.flush(30);
 assert.equal(h.document.querySelector('#box').getAttribute('role'),'dialog');assert.equal(h.document.querySelector('#box').getAttribute('aria-modal'),'true');
 assert.equal(h.document.querySelectorAll('#stars button[aria-label]').length,5);assert.ok(h.document.querySelector('#mst').getAttribute('aria-label'));
 h.run('closeModal()');await h.flush(1);assert.equal(h.document.body.classList.contains('modal-open'),false);
});

test('GitHub login merges remote data before uploading and logout cancels pending writes',async()=>{
 let remoteItems={2:{id:2,title:'GitHub remote',updatedAt:10,upd:10,rating:3}},writes=0;
 const h=browser({fetch:async(url,init)=>{
  if(!url.startsWith('https://api.github.com'))return;
  if(url.endsWith('/user'))return Response.json({login:'test-user',avatar_url:''});
  if(url.includes('/gists?'))return Response.json([{id:'gist-test',files:{'biblioteca-otaku.json':{}}}]);
  if(init.method==='PATCH'){writes++;remoteItems=JSON.parse(JSON.parse(init.body).files['biblioteca-otaku.json'].content).items;return Response.json({})}
  return Response.json({files:{'biblioteca-otaku.json':{content:JSON.stringify({scale:5,items:remoteItems,del:{}})}}});
 }});
 await h.flush();h.run('importLibraryDocument({library:[{id:1,title:"Local"}]})');await h.run("connectGH('test-token')");await h.flush(2500);
 assert.ok(remoteItems[1]);assert.ok(remoteItems[2]);assert.ok(writes>=1);
 h.run('save(lib[1]);logout()');const before=writes;await h.flush(2500);assert.equal(writes,before);
});

test('Google token callback and Drive synchronization preserve both lists',async()=>{
 let driveItems={2:{id:2,title:'Drive remote',rating:5,upd:10,updatedAt:10}};
 const h=browser({fetch:async(url,init)=>{
  if(url.includes('/oauth2/v3/userinfo'))return Response.json({name:'Test user',picture:''});
  if(url.includes('/drive/v3/files?spaces='))return Response.json({files:[{id:'drive-test'}]});
  if(url.includes('/drive/v3/files/drive-test?alt=media'))return Response.json({scale:5,items:driveItems,del:{}});
  if(url.includes('/upload/drive/v3/files/drive-test')){driveItems=JSON.parse(init.body).items;return Response.json({})}
 }});
 await h.flush();h.window.google={accounts:{oauth2:{initTokenClient(options){return {requestAccessToken(){queueMicrotask(()=>options.callback({access_token:'google-test'}))}}}}}};
 h.run('importLibraryDocument({library:[{id:1,title:"Local"}]})');await h.run('connectGoogle()');await h.flush(2500);
 assert.ok(driveItems[1]);assert.ok(driveItems[2]);assert.equal(driveItems[2].rating,5);
});

test('damaged preference JSON is retained as an exact recovery copy',async()=>{
 const raw='{"ai":';const h=browser({saved:{'otaku-store-v1':raw}});await h.flush();h.window.OtakuStore.persist();
 assert.equal(h.saved.get('otaku-store-v1-recovery'),raw);assert.ok(JSON.parse(h.saved.get('otaku-store-v1')).ai.feedback);
});

test('API cache can be reclaimed for a library write without deleting user data',async()=>{
 let full=false;
 const h=browser({saved:{'otaku-api-cache-v1:test':'cached','user-preference':'keep'},beforeWrite(key){if(full&&key==='otaku-lib'&&h.saved.has('otaku-api-cache-v1:test'))throw Error('QuotaExceededError')}});
 await h.flush();full=true;h.run('importLibraryDocument({library:[{id:9,title:"Preserved"}]})');
 assert.equal(h.saved.get('user-preference'),'keep');assert.equal(h.window.lib[9].title,'Preserved');assert.equal(h.saved.has('otaku-api-cache-v1:test'),false);
});

test('TMDB movie recommendations accept the configured API key and preserve the 0–100 score',async()=>{
 const key='a'.repeat(32);let request;
 const h=browser({saved:{'otaku-key-tmdb':key},fetch:async(url,init)=>{
  if(!url.includes('api.themoviedb.org/3/discover/movie'))return;
  request={url,init};return Response.json({results:[{id:55,title:'Movie',vote_average:8,vote_count:300,genre_ids:[28]}],page:1,total_pages:1});
 }});
 await h.flush();h.click('#lf-rec [data-rt="movie"]');h.click('#lf-rec-go');await h.flush(20);
 assert.ok(request.url.includes('api_key='+key));assert.equal(request.init.headers?.Authorization,undefined);
 assert.match(h.document.querySelector('#lf-rec-out').textContent,/4\.0/);
});
