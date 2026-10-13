import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {configureReaderTransport,handleReader} from '../js/reader-sources.js';
const compressed=fs.readFileSync(new URL('../data/reader/comikey.json.gz',import.meta.url));
const snapshot=JSON.parse(gunzipSync(compressed));
const request=path=>new Request('https://test.local/api/reader/'+path);
async function withCatalog(fn) {
  const old=globalThis.fetch;configureReaderTransport({catalogUrl:'https://test.local/comikey.json.gz'});
  globalThis.fetch=async url=>{assert.equal(String(url),'https://test.local/comikey.json.gz');return new Response(compressed)};
  try{await fn()}finally{globalThis.fetch=old;configureReaderTransport()}
}
test('public metadata snapshot contains no account credentials or signed thumbnail tokens',()=>{
  const raw=gunzipSync(compressed).toString();
  assert.doesNotMatch(raw,/token=|expires=|anonymous=|"thumbnail"|"password"/);
  assert.ok(snapshot.series.length>100);
  for(const m of snapshot.series){assert.match(m.slug,/^[a-z0-9-]+$/);for(const e of m.episodes){assert.match(e[0],/^[a-zA-Z0-9]+$/);assert.ok(['paid','free','pass'].includes(e[3]))}}
});
test('independent official search and detail expose actual chapter lists, including Solo Leveling',()=>withCatalog(async()=>{
  const r=await handleReader(request('search?q=Solo%20Leveling&source=comikey'));const j=await r.json();
  assert.equal(r.status,200);const m=j.results.find(x=>x.title==='Solo Leveling');assert.ok(m);assert.equal(m.id,'ck:1064');assert.match(m.sourceLabel,/externo/);
  const d=await(await handleReader(request('manga/'+m.id))).json();assert.equal(d.catalogOnly,false);assert.ok(d.indexUpdatedAt);assert.equal(d.manga.chapterCount,81);
  const c=await(await handleReader(request('chapters/'+m.id+'?lang=pt-br'))).json();
  assert.equal(c.total,81);assert.equal(c.chapters[0].chapter,'0');assert.equal(c.chapters.at(-1).chapter,'80');assert.equal(c.chapters[0].access,'free');assert.equal(c.chapters.at(-1).access,'paid');assert.match(c.chapters.at(-1).accessLabel,/compra/);
  assert.ok(c.chapters.every(x=>x.externalUrl.startsWith('https://br.comikey.com/read/solo-leveling-webtoon/')&&x.pages===0));
  const en=await(await handleReader(request('chapters/'+m.id+'?lang=en'))).json();assert.equal(en.total,0);
}));
test('official source supports full pagination and descending order without treating duplicate groups as episodes',()=>withCatalog(async()=>{
  const m=snapshot.series.find(x=>x.episodes.length>200);assert.ok(m);
  const first=await(await handleReader(request('chapters/ck:'+m.id+'?order=desc'))).json();assert.equal(first.chapters.length,100);assert.equal(first.more,true);
  let n=0,offset=0,more=true;const ids=new Set();
  while(more){const c=await(await handleReader(request('chapters/ck:'+m.id+'?offset='+offset))).json();n+=c.chapters.length;c.chapters.forEach(x=>ids.add(x.id));offset=c.nextOffset;more=c.more}
  assert.equal(n,m.episodes.length);assert.equal(ids.size,n);
  const invalid=await handleReader(request('chapters/ck:../../secret'));assert.equal(invalid.status,400);
}));
