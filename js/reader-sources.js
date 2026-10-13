// Shared catalog adapters for GitHub Pages and optional same-origin hosting.
let MD = 'https://api.mangadex.org', IMAGE_PROXY = '', CATALOG_URL = new URL('../data/reader/comikey.json.gz',import.meta.url).href;
let catalogPromise;
export function configureReaderTransport({apiBase, imageBase, catalogUrl}={}) {
  MD = apiBase || 'https://api.mangadex.org'; IMAGE_PROXY = imageBase || ''; CATALOG_URL = catalogUrl || new URL('../data/reader/comikey.json.gz',import.meta.url).href; memo.clear(); catalogPromise=null;
}
const KITSU = 'https://kitsu.io/api/edge';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const memo = new Map();
export const normalize = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[×✕]/g, ' x ').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const titleOf = a => a.title?.['pt-br'] || a.title?.en || a.title?.['ja-ro'] || Object.values(a.title || {})[0] || 'Sem título';
const namesOf = a => [...Object.values(a.title || {}), ...(a.altTitles || []).flatMap(x => Object.values(x))].filter(Boolean);
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
function checkedId(id) { if (!UUID.test(id)) throw Object.assign(new Error('Identificador de mangá ou capítulo inválido.'), {status:400}); return id; }
function endpoint(base, path, params = {}) {
  const u = new URL(base + path);
  for (const [k, v] of Object.entries(params)) for (const x of Array.isArray(v) ? v : [v]) if (x != null) u.searchParams.append(k, x);
  return u;
}
async function upstream(url, ttl = 60000, options = {}) {
  const key = url.toString() + (options.body || '');
  const hit = memo.get(key);
  if (hit && hit.until > Date.now()) return hit.promise;
  const promise = (async () => {
    const r = await fetch(url, { ...options, headers: { Accept: url.toString().startsWith(KITSU) ? 'application/vnd.api+json' : 'application/json', ...options.headers }, signal: AbortSignal.timeout(18000), redirect: 'error' });
    if (!r.ok) throw new Error(r.status === 429 ? 'Fonte ocupada. Aguarde alguns segundos e tente novamente.' : 'A fonte respondeu com erro ' + r.status + '.');
    const j = await r.json();
    if (j.result === 'error' || j.errors?.length) throw new Error('A fonte não conseguiu completar a consulta.');
    return j;
  })();
  if (memo.size >= 120) memo.delete(memo.keys().next().value);
  memo.set(key, { until: Date.now() + ttl, promise });
  try { return await promise; } catch (e) { memo.delete(key); throw e; }
}
function coverOf(m) {
  const filename = m.relationships?.find(x => x.type === 'cover_art')?.attributes?.fileName;
  return filename ? (IMAGE_PROXY ? IMAGE_PROXY + '/image/cover/' + m.id + '/' + encodeURIComponent(filename) + '.256.jpg' : '/api/reader/cover/' + m.id + '/' + encodeURIComponent(filename)) : '';
}
function mdManga(m) {
  const a = m.attributes;
  return { id: 'md:' + m.id, source: 'mangadex', sourceLabel: 'MangaDex', title: titleOf(a), names: namesOf(a), alt: (a.altTitles || []).map(x => x['pt-br'] || x.en || x['ja-ro']).find(Boolean) || '', cover: coverOf(m), status: a.status || '', year: a.year || '', languages: a.availableTranslatedLanguages || [], description: a.description?.['pt-br'] || a.description?.en || '', links: a.links || {} };
}
function kitsuManga(m) {
  const a = m.attributes;
  return { id: 'kt:' + m.id, source: 'kitsu', sourceLabel: 'Kitsu · catálogo', title: a.canonicalTitle || Object.values(a.titles || {})[0] || 'Sem título', names: [...Object.values(a.titles || {}), ...(a.abbreviatedTitles || [])].filter(Boolean), alt: a.titles?.en || '', cover: a.posterImage?.medium || a.posterImage?.small || '', status: a.status || '', year: (a.startDate || '').slice(0, 4), languages: [], description: a.synopsis || '', links: {} };
}
async function officialCatalog() {
  catalogPromise ||= (async()=>{
    const r=await fetch(CATALOG_URL,{signal:AbortSignal.timeout(18000)});
    if(!r.ok)throw new Error('O índice oficial não pôde ser carregado.');
    const data=await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
    if(!Array.isArray(data.series))throw new Error('Índice oficial inválido.');
    return data;
  })().catch(e=>{catalogPromise=null;throw e});
  return catalogPromise;
}
function comikeyManga(m) {
  return {id:'ck:'+m.id,source:'comikey',sourceLabel:'Comikey · leitor oficial externo',title:m.title,names:m.names,alt:'',cover:m.cover,status:'',year:'',languages:['pt-br'],description:m.description,links:{},chapterCount:m.episodes.length};
}
async function alternatives(item) {
  try {const j=await officialCatalog();return j.series.filter(m=>m.names.some(n=>[item.title,...(item.names||[])].some(t=>normalize(t)===normalize(n)))).map(comikeyManga)}catch{return []}
}
async function aliases(q) {
  try {
    const data = await upstream('https://graphql.anilist.co', 300000, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query($q:String!){Page(perPage:5){media(search:$q,type:MANGA,isAdult:false,sort:SEARCH_MATCH){title{romaji english native}synonyms externalLinks{url site}}}}', variables: { q } }) });
    const media = data.data?.Page?.media || [];
    const best = media.find(m => [...Object.values(m.title || {}), ...(m.synonyms || [])].some(n => normalize(n) === normalize(q)));
    return best ? { names: Object.values(best.title || {}).filter(Boolean), links: best.externalLinks || [] } : { names: [], links: [] };
  } catch { return { names: [], links: [] }; }
}
function score(m, q) {
  const n = normalize(q), names = [m.title, ...(m.names || [])].map(normalize);
  return normalize(m.title) === n ? 200 : names.includes(n) ? 100 : names.some(x => x.startsWith(n)) ? 60 : names.some(x => x.includes(n)) ? 30 : 0;
}
export function mergeResults(items, q) {
  const out = [], byName = new Map();
  for (const m of items.sort((a, b) => Number(a.source === 'kitsu') - Number(b.source === 'kitsu'))) {
    const existing = (m.names || [m.title]).map(normalize).map(n => byName.get(n)).find(Boolean);
    if (m.source === 'kitsu' && existing) { existing.cover ||= m.cover; continue; }
    if (out.some(x => x.id === m.id)) continue;
    out.push(m);
    for (const name of [m.title, ...(m.names || [])]) byName.set(normalize(name), m);
  }
  return out.sort((a, b) => score(b, q) - score(a, q) || Number(a.source === 'kitsu') - Number(b.source === 'kitsu') || a.title.localeCompare(b.title));
}
async function search(p) {
  const q = (p.get('q') || '').trim().slice(0, 160), page = Number(p.get('page') || 1);
  if (!Number.isInteger(page) || page < 1 || page > 100) return json({error:'Página de busca inválida.'},400);
  const source = p.get('source') || 'all';
  if (!['all', 'mangadex', 'kitsu', 'comikey'].includes(source)) return json({ error: 'Fonte inválida.' }, 400);
  if (q.length < 2) return json({ error: 'Digite pelo menos dois caracteres.' }, 400);
  const jobs = [];
  if (['all','mangadex'].includes(source)) jobs.push((async () => {
    const j = await upstream(endpoint(MD, '/manga', { title: q, limit: 50, offset: (page - 1) * 50, 'includes[]': ['cover_art'], 'order[relevance]': 'desc', 'contentRating[]': ['safe', 'suggestive', 'erotica'] }));
    let items = (j.data || []).map(mdManga);
    // Direct results are never replaced by a metadata service or an arbitrary first match.
    if (page === 1 && (!items.length || !items.some(m => score(m, q) >= 100))) {
      const a = await aliases(q);
      const variants = [...new Set(a.names)].filter(n => normalize(n) !== normalize(q)).slice(0, 2);
      for (const n of variants) {
        try { const k = await upstream(endpoint(MD, '/manga', { title: n, limit: 20, 'includes[]': ['cover_art'], 'contentRating[]': ['safe', 'suggestive', 'erotica'] })); items.push(...(k.data || []).map(mdManga)); } catch {}
      }
    }
    return { source: 'MangaDex', items, more: (page - 1) * 50 + (j.data || []).length < j.total, total: j.total };
  })());
  if (['all','kitsu'].includes(source)) jobs.push((async () => {
    const j = await upstream(endpoint(KITSU, '/manga', { 'filter[text]': q, 'page[limit]': 20, 'page[offset]': (page - 1) * 20 }));
    return { source: 'Kitsu', items: (j.data || []).filter(x => x.attributes?.ageRating !== 'R18').map(kitsuManga), more: !!j.links?.next, total: j.meta?.count };
  })());
  if (['all','comikey'].includes(source)) jobs.push((async()=>{
    const j=await officialCatalog(), matches=j.series.map(comikeyManga).filter(m=>score(m,q)>0);
    return {source:'Comikey · capítulos oficiais externos',items:matches.slice((page-1)*50,page*50),more:page*50<matches.length,total:matches.length};
  })());
  const sourceNames=source==='all'?['MangaDex','Kitsu','Comikey']:[{mangadex:'MangaDex',kitsu:'Kitsu',comikey:'Comikey'}[source]];
  const results = await Promise.allSettled(jobs), items = [], sources = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { items.push(...r.value.items); sources.push({ name: r.value.source, available: true, more: r.value.more, total: r.value.total }); }
    else sources.push({ name: sourceNames[i], available: false, error: r.reason?.message || 'Fonte indisponível.' });
  });
  return json({ results: mergeResults(items, q), sources, page, more: sources.some(s => s.more) }, sources.every(s => !s.available) ? 502 : 200);
}
const OFFICIAL_HOSTS = ['mangaplus.shueisha.co.jp', 'comic-walker.com', 'comicwalker.com', 'www.webtoons.com', 'webtoons.com', 'globalcomix.com', 'www.viz.com', 'viz.com', 'www.azuki.co', 'azuki.co', 'tappytoon.com', 'www.tappytoon.com', 'webnovel.com', 'www.webnovel.com', 'tapas.io', 'comikey.com', 'www.comikey.com', 'br.comikey.com'];
export function externalSource(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase();
    if (!OFFICIAL_HOSTS.includes(host)) return null;
    const name = host.includes('mangaplus') ? 'MANGA Plus' : host.includes('comic') && host.includes('walker') ? 'ComicWalker' : host.includes('webtoons') ? 'WEBTOON' : host.includes('globalcomix') ? 'GlobalComix' : host.includes('viz') ? 'VIZ' : host.includes('tappytoon') ? 'Tappytoon' : host.includes('webnovel') ? 'WebNovel' : host === 'tapas.io' ? 'Tapas' : host.includes('comikey') ? 'Comikey' : 'Azuki';
    return { name, url: u.href };
  } catch { return null; }
}
async function manga(id) {
  if(id.startsWith('ck:')) {
    if(!/^ck:\d+$/.test(id))return json({error:'Identificador inválido.'},400);
    const j=await officialCatalog(),m=j.series.find(x=>String(x.id)===id.slice(3));
    if(!m)return json({error:'Obra ausente no índice oficial.'},404);
    return json({manga:comikeyManga(m),officialLinks:[{name:'Comikey',url:'https://br.comikey.com/comics/'+m.slug+'/'+m.id+'/'}],catalogOnly:false,indexUpdatedAt:j.updatedAt});
  }
  if (id.startsWith('kt:')) {
    const k = id.slice(3); if (!/^\d+$/.test(k)) return json({ error: 'Identificador inválido.' }, 400);
    const j = await upstream(KITSU + '/manga/' + k), item = kitsuManga(j.data);
    let lookupFailed = false;
    for (const name of [...new Set([item.title, ...item.names])].slice(0, 3)) {
      try {
        const d = await upstream(endpoint(MD, '/manga', { title: name, limit: 30, 'includes[]': ['cover_art'], 'contentRating[]': ['safe', 'suggestive', 'erotica'] }));
        const found = mergeResults((d.data || []).map(mdManga), item.title).find(m => m.names.some(n => item.names.concat(item.title).some(t => normalize(n) === normalize(t))));
        if (found) return manga(found.id);
      } catch { lookupFailed = true; }
    }
    const a = await aliases(item.title);
    return json({ manga: item, officialLinks: a.links.map(x => externalSource(x.url)).filter(Boolean), catalogOnly: true, lookupFailed, readingSources:await alternatives(item) });
  }
  const raw = checkedId(id.replace(/^md:/, ''));
  const j = await upstream(endpoint(MD, '/manga/' + raw, { 'includes[]': ['cover_art'] })), item = mdManga(j.data);
  const links = Object.values(item.links).map(externalSource).filter(Boolean);
  return json({ manga: item, officialLinks: links, catalogOnly: false, readingSources:await alternatives(item) });
}
async function chapters(id, p) {
  const offset = Number(p.get('offset') || 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 9900) return json({ error: 'Página de capítulos inválida.' }, 400);
  const lang = p.get('lang') || 'pt-br', order = p.get('order') || 'asc';
  if (!['asc','desc'].includes(order)) return json({error:'Ordem inválida.'},400);
  if (lang !== 'all' && !/^[a-z]{2}(?:-[a-z]{2})?$/.test(lang)) return json({ error: 'Idioma inválido.' }, 400);
  if(id.startsWith('ck:')) {
    if(!/^ck:\d+$/.test(id))return json({error:'Identificador inválido.'},400);
    const j=await officialCatalog(),m=j.series.find(x=>String(x.id)===id.slice(3));
    if(!m)return json({error:'Obra ausente no índice oficial.'},404);
    let items=lang==='pt-br'||lang==='all'?m.episodes.map(([hid,number,title,access,published])=>({id:'ck:'+m.id+':'+hid,chapter:number,volume:'',title,lang:'pt-br',pages:0,published,source:'Comikey',externalUrl:'https://br.comikey.com/read/'+m.slug+'/'+hid+'/'+(m.format===2?'episode':'capitulo-portugues')+'-'+number.replace('.','-')+'/',readable:true,group:'Tradução oficial',access,accessLabel:access==='paid'?'Pode exigir compra/assinatura':access==='pass'?'Pode exigir passe, anúncio ou compra':'Gratuito na origem'})):[];
    items.sort((a,b)=>a.chapter.localeCompare(b.chapter,undefined,{numeric:true}));if(order==='desc')items.reverse();
    return json({chapters:items.slice(offset,offset+100),total:items.length,offset,nextOffset:Math.min(offset+100,items.length),more:offset+100<items.length,indexUpdatedAt:j.updatedAt});
  }
  const raw = checkedId(id.replace(/^md:/, ''));
  const j = await upstream(endpoint(MD, '/manga/' + raw + '/feed', { limit: 100, offset, ...(lang === 'all' ? {} : { 'translatedLanguage[]': [lang] }), 'includes[]': ['scanlation_group'], 'order[chapter]': order, 'order[volume]': order, includeFutureUpdates: 0, includeUnavailable: 0 }), 30000);
  const items = (j.data || []).filter(x => !x.attributes.isUnavailable).map(x => {
    const a = x.attributes, official = externalSource(a.externalUrl);
    return { id: x.id, chapter: a.chapter ?? '?', volume: a.volume || '', title: a.title || '', lang: a.translatedLanguage, pages: a.pages || 0, published: a.publishAt || '', source: official?.name || (a.externalUrl ? 'Fonte externa não integrada' : 'MangaDex'), externalUrl: official?.url || '', readable: !!official || (!a.externalUrl && a.pages > 0), group: x.relationships?.find(r => r.type === 'scanlation_group')?.attributes?.name || '', unavailable: !!a.externalUrl && !official };
  });
  return json({ chapters: items, total: j.total, offset, nextOffset: offset + (j.data || []).length, more: offset + (j.data || []).length < j.total });
}
export function allowedImageUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.port && !u.username && !u.password && (u.hostname === 'uploads.mangadex.org' || u.hostname.endsWith('.mangadex.network')) && /^\/(?:data|data-saver)\/[a-f0-9]{32,64}\/[a-zA-Z0-9_.-]+$/.test(u.pathname) && !u.search && !u.hash;
  } catch { return false; }
}
async function image(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!r.ok || !r.headers.get('Content-Type')?.startsWith('image/')) return json({ error: 'A imagem não está disponível na fonte. Tente recarregar.' }, 502);
  return new Response(r.body, { headers: { 'Content-Type': r.headers.get('Content-Type'), 'Cache-Control': 'private, max-age=1800', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
}
async function pages(id, p) {
  checkedId(id);
  const chapter = await upstream(MD + '/chapter/' + id, 30000);
  const a = chapter.data?.attributes || {}, official = externalSource(a.externalUrl);
  if (official) return json({ externalUrl: official.url, source: official.name, pages: [] });
  if (a.externalUrl || a.isUnavailable || !a.pages) return json({ error: 'Este capítulo não tem páginas disponíveis para leitura interna.' }, 404);
  const j = await upstream(endpoint(MD, '/at-home/server/' + id, { forcePort443: true }), 20000);
  const saver = p.get('quality') !== 'original' && j.chapter?.dataSaver?.length;
  const files = saver ? j.chapter.dataSaver : j.chapter?.data;
  if (!files?.length) return json({ error: 'Este capítulo não possui páginas disponíveis.' }, 404);
  const out = files.map(f => j.baseUrl + '/' + (saver ? 'data-saver' : 'data') + '/' + j.chapter.hash + '/' + f);
  if (out.some(u => !allowedImageUrl(u))) return json({ error: 'O servidor de imagens da fonte mudou. A integração precisa ser atualizada.' }, 502);
  return json({ pages: out.map(u => (IMAGE_PROXY ? IMAGE_PROXY + '/image/page?url=' : '/api/reader/image?url=') + encodeURIComponent(u)), source: 'MangaDex', quality: saver ? 'saver' : 'original' });
}
export async function handleReader(request) {
  try {
    const u = new URL(request.url), path = u.pathname.replace(/^\/api\/reader\/?/, '').split('/').map(decodeURIComponent);
    if (!u.pathname.startsWith('/api/reader/')) return json({error:'Rota inválida.'},400);
    if (request.method !== 'GET') return json({ error: 'Método não permitido.' }, 405);
    if (path[0] === 'search') return await search(u.searchParams);
    if (path[0] === 'manga' && path[1]) return await manga(path[1]);
    if (path[0] === 'chapter' && path[1]) {
      const id = checkedId(path[1]), j = await upstream(MD + '/chapter/' + id, 30000);
      return json({id, lang:j.data.attributes.translatedLanguage, mangaId:'md:' + j.data.relationships.find(r => r.type === 'manga')?.id});
    }
    if (path[0] === 'chapters' && path[1]) return await chapters(path[1], u.searchParams);
    if (path[0] === 'pages' && path[1]) return await pages(path[1], u.searchParams);
    if (path[0] === 'cover' && UUID.test(path[1]) && /^[a-zA-Z0-9_.-]+$/.test(path[2] || '')) return await image('https://uploads.mangadex.org/covers/' + path[1] + '/' + path[2] + '.256.jpg');
    if (path[0] === 'image' && allowedImageUrl(u.searchParams.get('url'))) return await image(u.searchParams.get('url'));
    return json({ error: 'Rota inválida.' }, 400);
  } catch (e) { return json({ error: e.name === 'TimeoutError' ? 'A fonte demorou para responder. Tente novamente.' : e.name === 'URIError' ? 'Rota inválida.' : e.message || 'Não foi possível consultar a fonte.' }, e.status || (e.name === 'URIError' ? 400 : 502)); }
}
