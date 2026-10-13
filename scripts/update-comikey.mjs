// Public series/episode metadata only. Never download pages, account tokens or thumbnails.
import {mkdir, writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const BR = 'https://br.comikey.com', API = 'https://gundam.comikey.net';
const norm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
async function get(url) {
  const r = await fetch(url, {headers:{Accept:'application/json'}, signal:AbortSignal.timeout(25000)});
  if (!r.ok) throw new Error('Public metadata HTTP ' + r.status);
  return r.json();
}
const series = [];
let page = 1;
while (true) {
  const j = await get(BR + '/sapi/comics?ordering=-last_updated&page=' + page++);
  if (!Array.isArray(j.results)) throw new Error('Catalog schema changed');
  series.push(...j.results.filter(m => !m.removed && !m.adult));
  if (!j.next) break;
}
const output = {updatedAt:new Date().toISOString(), source:BR, series:[], failures:[]};
let cursor = 0;
async function worker() {
  while (cursor < series.length) {
    const m = series[cursor++];
    try {
      const j = await get(API + '/comic.public/' + m.id + '/episodes?language=pt-br');
      if (!Array.isArray(j.episodes) && m.chapter_count) throw new Error('Episode schema changed');
      const episodes = (j.episodes || []).filter(e => !e.availability?.readableAt || Date.parse(e.availability.readableAt) <= Date.now()).map(e => {
        if (!/^EPI-[a-zA-Z0-9]+$/.test(e.id)) throw new Error('Invalid public episode id');
        // Compact array: id, number, title, access, publication date.
        const a = e.availability || {};
        return [e.id.slice(4), String(e.number ?? 0), e.title || '', a.purchaseEnabled ? (a.dailyPassEnabled || a.adsEnabled ? 'pass' : 'paid') : 'free', e.releasedAt || ''];
      });
      if (!/^[a-z0-9-]+$/.test(m.uslug)) throw new Error('Invalid series slug');
      const cover = new URL(m.cover || '', BR);
      output.series.push({id:m.id, title:m.name, names:[...new Set([m.name,m.name.replace(/\s*\(PT-BR\)$/i,''),...String(m.alt || '').split(/[,;\n]/)].filter(Boolean))], slug:m.uslug, format:m.format, cover:m.cover && cover.origin === BR && !cover.search ? cover.href : '', description:m.excerpt || '', chapterCount:m.chapter_count, episodes});
    } catch(e) {
      output.failures.push({id:m.id,title:m.name,error:e.message});
    }
    if ((output.series.length + output.failures.length) % 20 === 0) console.log('Series checked:',output.series.length + output.failures.length);
  }
}
await Promise.all([worker(),worker(),worker()]);
output.series.sort((a,b)=>norm(a.title).localeCompare(norm(b.title)));
if (output.failures.length) throw new Error('Incomplete refresh: ' + output.failures.map(x=>x.title + ': ' + x.error).join('; '));
const directory = new URL('../data/reader/', import.meta.url);
await mkdir(directory,{recursive:true});
await writeFile(new URL('comikey.json.gz',directory),gzipSync(JSON.stringify(output),{level:9}));
console.log(JSON.stringify({series:output.series.length,episodes:output.series.reduce((n,m)=>n+m.episodes.length,0),updatedAt:output.updatedAt,solo:output.series.find(m=>m.title==='Solo Leveling')?.episodes.length}));
