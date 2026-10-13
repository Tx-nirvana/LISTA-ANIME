/* Biblioteca Otaku — Leitor interno (EPUB, PDF, TXT, CBZ)
   Os arquivos ficam guardados só no navegador do usuário (IndexedDB). */
(function(){
'use strict';

/* ---------- utilidades ---------- */
const CDN={
 jszip:'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
 epub:'https://cdnjs.cloudflare.com/ajax/libs/epub.js/0.3.93/epub.min.js',
 pdf:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
};
const PDF_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const loaded={};
function loadScript(k){
 return loaded[k]||(loaded[k]=new Promise((res,rej)=>{
  const s=document.createElement('script');s.src=CDN[k];s.onload=res;
  s.onerror=()=>{delete loaded[k];rej(new Error('Não foi possível carregar a biblioteca de leitura. Verifique a conexão e tente de novo.'))};
  document.head.appendChild(s);
 }));
}
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const debounce=(fn,ms)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}};
const jget=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}};
const jset=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};

const PK='otaku-reader-progress',SK='otaku-reader-prefs';
let prog=jget(PK,{});
const prefs=Object.assign({theme:'dark',size:100,epubMode:'paged',cbzMode:'page',rtl:false},jget(SK,{}));
const savePrefs=()=>jset(SK,prefs);
function saveProg(id,patch){prog[id]=Object.assign(prog[id]||{},patch,{t:Date.now()});jset(PK,prog)}

const THEMES={dark:{bg:'#0b0b0b',fg:'#e8e4d4'},sepia:{bg:'#f4ecd8',fg:'#3b2f1e'},light:{bg:'#ffffff',fg:'#111111'}};
const THEME_ORDER=['dark','sepia','light'];

/* ---------- armazenamento (IndexedDB) ---------- */
const DB='otaku-reader',ST='books';
let dbp;
function db(){
 return dbp||(dbp=new Promise((res,rej)=>{
  const r=indexedDB.open(DB,1);
  r.onupgradeneeded=()=>r.result.createObjectStore(ST,{keyPath:'id'});
  r.onsuccess=()=>res(r.result);
  r.onerror=()=>rej(r.error);
 }));
}
function tx(mode,fn){
 return db().then(d=>new Promise((res,rej)=>{
  const t=d.transaction(ST,mode),q=fn(t.objectStore(ST));
  t.oncomplete=()=>res(q&&q.result);
  t.onerror=()=>rej(t.error);
  t.onabort=()=>rej(t.error);
 }));
}

/* ---------- tipos de arquivo ---------- */
function typeOf(name){
 const e=(name.split('.').pop()||'').toLowerCase();
 if(e==='epub')return'epub';
 if(e==='pdf')return'pdf';
 if(e==='txt')return'txt';
 if(e==='cbz'||e==='zip')return'cbz';
 return null;
}
const TYPE_LABEL={epub:'EPUB',pdf:'PDF',txt:'TXT',cbz:'CBZ'};
const mimeOf=n=>({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',avif:'image/avif',bmp:'image/bmp'}[(n.split('.').pop()||'').toLowerCase()]||'image/jpeg');

/* ---------- motores de leitura ----------
   Cada motor recebe o contexto c e devolve {go(dir),size(),theme(),zones,toggleMode?,modeLabel?,goto?,destroy()}.
   go(-1) = esquerda / voltar, go(1) = direita / avançar (no sentido visual). */

async function epubEngine(c){
 await loadScript('jszip');await loadScript('epub');
 const buf=await c.rec.data.arrayBuffer();
 const book=window.ePub(buf);
 let rend=null,ready=false,last=null;
 const eng={zones:true};

 function upd(loc){
  if(!loc||!loc.start)return;
  const cfi=loc.start.cfi;
  let pct=ready?book.locations.percentageFromCfi(cfi):(loc.start.percentage||0);
  if(!(pct>=0))pct=0;
  c.info(Math.round(pct*100)+'%');
  c.save({cfi,pct});
 }
 function applyLook(){
  if(!rend)return;
  const t=THEMES[prefs.theme];
  rend.themes.override('color',t.fg);
  rend.themes.override('background',t.bg);
  rend.themes.fontSize(prefs.size+'%');
 }
 function mount(){
  if(rend){try{rend.destroy()}catch(e){}}
  c.stage.innerHTML='';
  const box=document.createElement('div');box.className='rd-epub';c.stage.appendChild(box);
  const scroll=prefs.epubMode==='scroll';
  eng.zones=!scroll;eng.modeLabel=scroll?'Rolagem':'Paginado';
  c.refreshUI();
  rend=book.renderTo(box,{width:'100%',height:'100%',flow:scroll?'scrolled-doc':'paginated',spread:'none'});
  applyLook();
  rend.on('relocated',loc=>{last=loc;upd(loc)});
  rend.on('keyup',e=>{if(e.key==='ArrowLeft')eng.go(-1);if(e.key==='ArrowRight')eng.go(1)});
  const p=prog[c.rec.id]||{};
  return rend.display(p.cfi||undefined);
 }
 eng.go=d=>{if(!rend)return;d<0?rend.prev():rend.next()};
 eng.size=applyLook;
 eng.theme=applyLook;
 eng.toggleMode=()=>{prefs.epubMode=prefs.epubMode==='scroll'?'paged':'scroll';savePrefs();return mount()};
 eng.goto=href=>rend&&rend.display(href);
 eng.destroy=()=>{try{rend&&rend.destroy()}catch(e){}try{book.destroy()}catch(e){}};

 await mount();
 book.loaded.metadata.then(m=>{if(m&&m.title)c.setTitle(m.title)}).catch(()=>{});
 book.loaded.navigation.then(nav=>{
  const out=[];
  (function walk(items,lv){(items||[]).forEach(it=>{out.push({label:'\u00A0\u00A0'.repeat(lv)+String(it.label||'').trim(),href:it.href});walk(it.subitems,lv+1)})})(nav.toc,0);
  c.setToc(out);
 }).catch(()=>{});
 book.ready.then(()=>book.locations.generate(1000)).then(()=>{ready=true;upd(last)}).catch(()=>{});
 return eng;
}

async function txtEngine(c){
 const buf=await c.rec.data.arrayBuffer();
 let txt=new TextDecoder('utf-8').decode(buf);
 if(txt.indexOf('\uFFFD')>=0)txt=new TextDecoder('windows-1252').decode(buf);
 const box=document.createElement('div');box.className='rd-txt';
 const inner=document.createElement('div');inner.className='rd-txtin';
 inner.innerHTML=txt.split(/\r?\n\s*\r?\n/).map(p=>'<p>'+esc(p.trim()).replace(/\r?\n/g,'<br>')+'</p>').join('');
 box.appendChild(inner);c.stage.innerHTML='';c.stage.appendChild(box);
 const fs=()=>{inner.style.fontSize=(18*prefs.size/100)+'px'};fs();
 const upd=debounce(()=>{
  const m=box.scrollHeight-box.clientHeight,pct=m>0?box.scrollTop/m:0;
  c.info(Math.round(pct*100)+'%');c.save({pct});
 },200);
 box.addEventListener('scroll',upd);
 const p=prog[c.rec.id]||{};
 requestAnimationFrame(()=>{box.scrollTop=(p.pct||0)*Math.max(0,box.scrollHeight-box.clientHeight);upd()});
 return{zones:false,
  go:d=>box.scrollBy({top:d*box.clientHeight*.9,behavior:'smooth'}),
  size:fs,theme(){},destroy(){}};
}

async function pdfEngine(c){
 await loadScript('pdf');
 const lib=window.pdfjsLib;lib.GlobalWorkerOptions.workerSrc=PDF_WORKER;
 const buf=await c.rec.data.arrayBuffer();
 const doc=await lib.getDocument({data:buf}).promise;
 const total=doc.numPages;
 let n=Math.min(total,Math.max(1,(prog[c.rec.id]||{}).page||1)),token=0,task=null;
 const box=document.createElement('div');box.className='rd-pdf';
 c.stage.innerHTML='';c.stage.appendChild(box);
 async function show(){
  const my=++token;
  if(task){try{task.cancel()}catch(e){}}
  const page=await doc.getPage(n);
  if(my!==token)return;
  const base=page.getViewport({scale:1}),dpr=window.devicePixelRatio||1;
  const scale=Math.max(.3,(box.clientWidth-16)/base.width*(prefs.size/100));
  const vp=page.getViewport({scale:scale*dpr});
  const cv=document.createElement('canvas');
  cv.width=vp.width;cv.height=vp.height;
  cv.style.width=(vp.width/dpr)+'px';cv.style.height=(vp.height/dpr)+'px';
  task=page.render({canvasContext:cv.getContext('2d'),viewport:vp});
  try{await task.promise}catch(e){return}
  if(my!==token)return;
  box.innerHTML='';box.appendChild(cv);box.scrollTop=0;
  c.info('Página '+n+' / '+total);c.save({page:n,pct:n/total});
 }
 const eng={zones:true,
  go:d=>{const k=Math.min(total,Math.max(1,n+d));if(k!==n){n=k;show()}},
  size:show,theme(){},
  destroy(){token++;try{task&&task.cancel()}catch(e){}try{doc.destroy()}catch(e){}}};
 await show();
 return eng;
}

async function cbzEngine(c){
 await loadScript('jszip');
 const zip=await window.JSZip.loadAsync(c.rec.data);
 const names=Object.keys(zip.files)
  .filter(k=>!zip.files[k].dir&&k.indexOf('__MACOSX')<0&&!/(^|\/)\.[^/]*$/.test(k)&&/\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(k))
  .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));
 if(!names.length)throw new Error('Nenhuma imagem encontrada dentro do arquivo.');
 const urls={};
 async function url(i){
  if(urls[i])return urls[i];
  const b=await zip.file(names[i]).async('blob');
  return urls[i]=URL.createObjectURL(new Blob([b],{type:mimeOf(names[i])}));
 }
 let i=Math.min(names.length-1,Math.max(0,(prog[c.rec.id]||{}).page||0));
 let box=null,io=null,token=0;
 const eng={zones:true};
 const report=()=>{c.info((i+1)+' / '+names.length);c.save({page:i,pct:(i+1)/names.length})};

 async function showPage(){
  const my=++token,img=box.querySelector('img');
  const u=await url(i);if(my!==token)return;
  img.src=u;box.scrollTop=0;report();
  if(i+1<names.length)url(i+1).catch(()=>{});
 }
 function mountPage(){
  box=document.createElement('div');box.className='rd-cbz';
  box.innerHTML='<img alt="">';
  c.stage.innerHTML='';c.stage.appendChild(box);
  return showPage();
 }
 function mountWeb(){
  box=document.createElement('div');box.className='rd-cbz rd-web';
  const wrap=document.createElement('div');wrap.className='rd-webin';
  wrap.style.maxWidth=(800*prefs.size/100)+'px';
  names.forEach((_,k)=>{const im=document.createElement('img');im.alt='';im.dataset.i=k;wrap.appendChild(im)});
  box.appendChild(wrap);c.stage.innerHTML='';c.stage.appendChild(box);
  const imgs=[...wrap.children];
  io=new IntersectionObserver(es=>es.forEach(e=>{
   if(!e.isIntersecting)return;
   const im=e.target;io.unobserve(im);
   url(+im.dataset.i).then(u=>{im.src=u}).catch(()=>{});
  }),{root:box,rootMargin:'900px 0px'});
  imgs.forEach(im=>io.observe(im));
  const onScroll=debounce(()=>{
   const top=box.getBoundingClientRect().top;
   for(let k=0;k<imgs.length;k++){if(imgs[k].getBoundingClientRect().bottom>top+40){i=k;break}}
   report();
  },150);
  box.addEventListener('scroll',onScroll);
  url(i).then(u=>{const im=imgs[i];im.onload=()=>im.scrollIntoView();im.src=u;report()});
 }
 function mount(){
  if(io){io.disconnect();io=null}
  const web=prefs.cbzMode==='web';
  eng.zones=!web;eng.modeLabel=web?'Webtoon':'Página';eng.hasRtl=!web;
  c.refreshUI();
  return web?mountWeb():mountPage();
 }
 eng.go=d=>{
  if(prefs.cbzMode==='web'){box.scrollBy({top:d*box.clientHeight*.9,behavior:'smooth'});return}
  const step=prefs.rtl?-d:d,k=Math.min(names.length-1,Math.max(0,i+step));
  if(k!==i){i=k;showPage()}
 };
 eng.size=()=>{if(prefs.cbzMode==='web'){const w=box.querySelector('.rd-webin');if(w)w.style.maxWidth=(800*prefs.size/100)+'px'}};
 eng.theme=()=>{};
 eng.toggleMode=()=>{prefs.cbzMode=prefs.cbzMode==='web'?'page':'web';savePrefs();return mount()};
 eng.toggleRtl=()=>{prefs.rtl=!prefs.rtl;savePrefs();c.refreshUI()};
 eng.destroy=()=>{token++;if(io)io.disconnect();Object.values(urls).forEach(u=>{try{URL.revokeObjectURL(u)}catch(e){}})};
 await mount();
 return eng;
}

const ENGINES={epub:epubEngine,txt:txtEngine,pdf:pdfEngine,cbz:cbzEngine};

/* ---------- tela de leitura ---------- */
async function openBook(id){
 const rec=await tx('readonly',s=>s.get(id));
 if(!rec)return;
 document.body.classList.add('rd-lock');
 const ov=document.createElement('div');ov.className='rd-ov';
 ov.innerHTML=
  '<div class="rd-top">'+
   '<button class="rd-b" data-a="back">← Voltar</button>'+
   '<div class="rd-ttl"></div>'+
   '<select class="rd-toc" hidden></select>'+
   '<button class="rd-b" data-a="mode" hidden></button>'+
   '<button class="rd-b" data-a="rtl" hidden></button>'+
   '<button class="rd-b" data-a="smaller" title="Diminuir">A−</button>'+
   '<button class="rd-b" data-a="bigger" title="Aumentar">A+</button>'+
   '<button class="rd-b" data-a="theme" title="Trocar tema">◐</button>'+
  '</div>'+
  '<div class="rd-wrap"><div class="rd-stage"><div class="rd-msg">Abrindo…</div></div></div>'+
  '<div class="rd-bot"><button class="rd-b" data-a="left">‹</button><span class="rd-info"></span><button class="rd-b" data-a="right">›</button></div>';
 document.body.appendChild(ov);
 const q=s=>ov.querySelector(s);
 let eng=null;
 const setTheme=()=>{const t=THEMES[prefs.theme];ov.style.setProperty('--rd-bg',t.bg);ov.style.setProperty('--rd-fg',t.fg);ov.dataset.theme=prefs.theme};
 setTheme();
 q('.rd-ttl').textContent=rec.name;

 const stage=q('.rd-stage');
 const c={
  rec,stage,
  info:t=>{q('.rd-info').textContent=t},
  save:p=>saveProg(rec.id,p),
  setTitle:t=>{q('.rd-ttl').textContent=t},
  setToc:list=>{
   const s=q('.rd-toc');if(!list.length)return;
   s.innerHTML='<option value="">Capítulos</option>'+list.map(x=>'<option value="'+esc(x.href)+'">'+esc(x.label)+'</option>').join('');
   s.hidden=false;
  },
  refreshUI:()=>{
   const m=q('[data-a=mode]'),r=q('[data-a=rtl]');
   if(eng){
    const e=eng;
    m.hidden=!e.toggleMode;if(e.modeLabel)m.textContent='Modo: '+e.modeLabel;
    r.hidden=!(e.toggleRtl&&e.hasRtl);r.textContent=prefs.rtl?'Leitura: ← direita p/ esquerda':'Leitura: esquerda p/ direita →';
    ov.classList.toggle('rd-nozones',!e.zones);
   }
  }
 };
 // zonas clicáveis nas laterais (modos paginados)
 ['left','right'].forEach(side=>{
  const z=document.createElement('button');z.className='rd-zone '+side;z.dataset.a=side;z.setAttribute('aria-label',side==='left'?'Anterior':'Próximo');
  q('.rd-wrap').appendChild(z);
 });

 function close(){
  document.removeEventListener('keydown',onKey,true);
  try{eng&&eng.destroy()}catch(e){}
  ov.remove();document.body.classList.remove('rd-lock');
  renderShelf();
 }
 function onKey(e){
  if(!ov.isConnected)return;
  const tg=e.target&&e.target.tagName;if(tg==='SELECT'||tg==='INPUT')return;
  if(e.key==='Escape'){e.stopPropagation();close()}
  else if(e.key==='ArrowLeft'){eng&&eng.go(-1)}
  else if(e.key==='ArrowRight'){eng&&eng.go(1)}
 }
 document.addEventListener('keydown',onKey,true);

 ov.addEventListener('click',async e=>{
  const b=e.target.closest('[data-a]');if(!b)return;
  const a=b.dataset.a;
  if(a==='back')return close();
  if(a==='left')return eng&&eng.go(-1);
  if(a==='right')return eng&&eng.go(1);
  if(a==='smaller'||a==='bigger'){
   prefs.size=Math.min(220,Math.max(60,prefs.size+(a==='bigger'?10:-10)));savePrefs();
   return eng&&eng.size();
  }
  if(a==='theme'){
   prefs.theme=THEME_ORDER[(THEME_ORDER.indexOf(prefs.theme)+1)%THEME_ORDER.length];savePrefs();
   setTheme();return eng&&eng.theme();
  }
  if(a==='mode'&&eng&&eng.toggleMode){try{await eng.toggleMode()}catch(err){}c.refreshUI()}
  if(a==='rtl'&&eng&&eng.toggleRtl)eng.toggleRtl();
 });
 q('.rd-toc').addEventListener('change',e=>{const v=e.target.value;if(v&&eng&&eng.goto)eng.goto(v);e.target.value=''});

 try{
  eng=await ENGINES[rec.type](c);
  const m=stage.querySelector('.rd-msg');if(m)m.remove();
  c.refreshUI();
 }catch(err){
  stage.innerHTML='<div class="rd-msg">'+esc(err&&err.message||'Não foi possível abrir este arquivo.')+'</div>';
 }
}

/* ---------- estante ---------- */
let sec=null;
function hue(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))%360;return h}

async function renderShelf(){
 if(!sec)return;
 let books=[];
 try{books=(await tx('readonly',s=>s.getAll()))||[]}catch(e){
  sec.innerHTML='<div class="msg">Seu navegador não permite guardar arquivos aqui (modo anônimo?). O leitor precisa de armazenamento local.</div>';return;
 }
 books.sort((a,b)=>((prog[b.id]||{}).t||b.added)-((prog[a.id]||{}).t||a.added));
 const cards=books.map(b=>{
  const p=Math.round(((prog[b.id]||{}).pct||0)*100),h=hue(b.name);
  return '<div class="rd-card" data-id="'+esc(b.id)+'">'+
   '<div class="rd-cover" style="background:linear-gradient(160deg,hsl('+h+',45%,32%),hsl('+((h+40)%360)+',50%,16%))">'+esc((b.name.trim()[0]||'?').toUpperCase())+'</div>'+
   '<span class="tag">'+TYPE_LABEL[b.type]+'</span>'+
   '<button class="rd-del" data-del="'+esc(b.id)+'" title="Remover">✕</button>'+
   '<div class="i"><div class="t">'+esc(b.name)+'</div>'+
   '<div class="rd-prog"><i style="width:'+p+'%"></i></div><div class="m">'+(p?p+'% lido':'Não iniciado')+'</div></div></div>';
 }).join('');
 sec.innerHTML=onlineHtml()+
  '<div class="bar"><button class="btn" id="rd-add">＋ Adicionar arquivo</button>'+
  '<input type="file" id="rd-file" accept=".epub,.pdf,.txt,.cbz,.zip" multiple hidden></div>'+
  '<div class="stats">Leia seus próprios arquivos <b>EPUB, PDF, TXT e CBZ</b> (mangá/HQ em imagens) direto aqui. Eles ficam guardados <b>só neste aparelho</b> e o ponto onde você parou é lembrado. Você também pode arrastar os arquivos para esta área.</div>'+
  (books.length?'<div class="grid">'+cards+'</div>':'<div class="msg">Nenhum arquivo ainda. Clique em “Adicionar arquivo” para começar.</div>');
}

async function addFiles(files){
 let bad=[];
 for(const f of files){
  const type=typeOf(f.name);
  if(!type){bad.push(f.name);continue}
  const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  try{
   await tx('readwrite',s=>s.put({id,name:f.name.replace(/\.[^.]+$/,''),type,size:f.size,added:Date.now(),data:f}));
  }catch(e){bad.push(f.name+' (sem espaço ou sem permissão)')}
 }
 try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(e){}
 await renderShelf();
 if(bad.length)alert('Não foi possível adicionar:\n'+bad.join('\n')+'\n\nFormatos aceitos: EPUB, PDF, TXT e CBZ.');
}


/* ---------- leitor online: catálogo e capítulos ---------- */
const READER_API='/api/reader';
const IS_GITHUB_PAGES=/(^|\.)github\.io$/.test(location.hostname||'');
let pagesAdapter;
const OPK='otaku-reader-online-progress';
let onlineProg=jget(OPK,{}), onlineState={manga:null,chapters:[],results:[],query:'',source:'all',lang:'pt-br',order:'asc',versions:false,chapterSource:'all',loading:false,error:'',sources:[],more:false,chapterMore:false,offset:0};
let onlineRequest=0, chapterRequest=0, allSession=0, reading=false;
const saveOnline=(k,v)=>{onlineProg[k]=Object.assign(onlineProg[k]||{},v,{t:Date.now()});jset(OPK,onlineProg)};
async function readerJson(path,params={}){
 const u=new URL(READER_API+path,location.origin);Object.entries(params).forEach(([k,v])=>v!=null&&u.searchParams.set(k,v));
 let r;
 if(IS_GITHUB_PAGES){
  pagesAdapter ||= import('./reader-sources.js').then(api=>{api.configureReaderTransport({apiBase:'https://wild-hall-382b.hugoq3310.workers.dev/mangadex',imageBase:'https://wild-hall-382b.hugoq3310.workers.dev'});return api}).catch(e=>{pagesAdapter=null;throw e});
  r=await (await pagesAdapter).handleReader(new Request(u,{headers:{Accept:'application/json'}}));
 }else r=await fetch(u,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(55000)});
 let j;try{j=await r.json()}catch(e){throw new Error('Não foi possível consultar o leitor. Recarregue a página e tente novamente.')}
 if(!r.ok)throw new Error(j.error||'Não foi possível consultar a fonte.');return j;
}
async function searchOnline(q,more=false){
 q=String(q||'').trim();if(q.length<2){onlineState.error='Digite pelo menos dois caracteres.';renderShelf();return}
 const ticket=++onlineRequest;++chapterRequest;
 ++allSession;const st=onlineState;st.query=q;st.loading=true;st.loadingAll=false;st.chapterLoading=false;st.error='';st.manga=null;st.chapters=[];
 if(!more){st.results=[];st.sources=[];st.page=0;st.more=false}
 renderShelf();
 try{
  const j=await readerJson('/search',{q,source:st.source,page:(st.page||0)+1});if(ticket!==onlineRequest)return;
  const seen=new Set(st.results.map(x=>x.id));st.results.push(...j.results.filter(x=>!seen.has(x.id)));st.page=j.page;st.more=j.more;st.sources=j.sources;
  if(!st.results.length)st.error='Nenhuma obra encontrada. Tente o título original ou um nome alternativo.';
 }catch(e){if(ticket===onlineRequest)st.error=e.message||'Não foi possível pesquisar.'}
 if(ticket===onlineRequest){st.loading=false;renderShelf()}
}
async function loadOnlineManga(id,resume=false){
 const ticket=++onlineRequest;++chapterRequest;++allSession;const st=onlineState;st.loading=true;st.loadingAll=false;st.chapterLoading=false;st.error='';st.chapters=[];st.offset=0;st.chapterMore=false;st.manga=null;st.resumeOfficial=null;renderShelf();
 try{
  const j=await readerJson('/manga/'+encodeURIComponent(id));if(ticket!==onlineRequest)return;
  st.manga=j.manga;st.officialLinks=j.officialLinks||[];st.catalogOnly=j.catalogOnly;st.lookupFailed=j.lookupFailed;st.chapterSource='all';
  const previous=onlineProg[j.manga.id]||{},languages=j.manga.languages||[];
  if(resume&&previous.chapterId&&!previous.lang){const saved=await readerJson('/chapter/'+encodeURIComponent(previous.chapterId));if(ticket!==onlineRequest)return;if(saved.mangaId===j.manga.id){previous.lang=saved.lang;saveOnline(j.manga.id,{lang:saved.lang,mangaId:j.manga.id})}}
  st.lang=previous.lang||(languages.includes('pt-br')?'pt-br':languages.includes('en')?'en':languages[0]||'pt-br');
  if(!j.catalogOnly)await loadChapters(true);
  if(ticket!==onlineRequest)return;st.loading=false;renderShelf();
  if(resume&&previous.chapterId){
   while(st.chapterMore&&!st.error&&!st.chapters.some(c=>c.id===previous.chapterId)&&ticket===onlineRequest)await loadChapters(false);
   if(ticket!==onlineRequest||st.error)return;
   const c=st.chapters.find(c=>c.id===previous.chapterId);if(c&&c.externalUrl){st.resumeOfficial=c;renderShelf()}else if(c)openOnlineChapter(c.id,st.manga,c);else{st.error='O capítulo salvo não está mais disponível nessa fonte. Escolha outro capítulo.';renderShelf()}
  }
 }catch(e){if(ticket===onlineRequest){st.loading=false;st.error=e.message;renderShelf()}}
}
async function loadChapters(reset=false){
 const st=onlineState;if(!st.manga||st.catalogOnly)return;
 const ticket=++chapterRequest,mangaId=st.manga.id;st.chapterLoading=true;st.error='';
 if(reset){st.chapters=[];st.offset=0;st.chapterMore=false}
 renderShelf();
 try{
  const j=await readerJson('/chapters/'+encodeURIComponent(mangaId),{lang:st.lang,offset:st.offset,order:st.order});if(ticket!==chapterRequest||mangaId!==st.manga?.id)return;
  const seen=new Set(st.chapters.map(c=>c.id));st.chapters.push(...j.chapters.filter(c=>!seen.has(c.id)));st.total=j.total;st.offset=j.nextOffset;st.chapterMore=j.more;
  if(j.more&&j.nextOffset===j.offset){st.chapterMore=false;st.error='A fonte interrompeu a paginação. Recarregue a lista.'}
 }catch(e){if(ticket===chapterRequest){st.error=e.message;st.loadingAll=false}}
 if(ticket===chapterRequest){st.chapterLoading=false;renderShelf()}
}
async function loadAllChapters(){
 const st=onlineState,mangaId=st.manga?.id,session=++allSession;st.loadingAll=true;renderShelf();
 while(session===allSession&&st.loadingAll&&st.chapterMore&&!st.chapterLoading&&st.manga?.id===mangaId){await loadChapters(false);if(st.error)break}
 if(session===allSession){st.loadingAll=false;renderShelf()}
}
function chapterCompare(a,b){return String(a.chapter).localeCompare(String(b.chapter),undefined,{numeric:true})||String(a.volume).localeCompare(String(b.volume),undefined,{numeric:true})||String(a.published||'').localeCompare(String(b.published||''))}
function visibleChapters(){
 const st=onlineState;let items=st.chapters.filter(c=>st.chapterSource==='all'||c.source===st.chapterSource);
 if(!st.versions){const groups=new Map();for(const c of items){const key=[c.lang,c.volume,c.chapter==='?'?c.id:c.chapter].join('|');const old=groups.get(key);if(!old||(!old.readable&&c.readable)||(old.externalUrl&&!c.externalUrl&&c.readable))groups.set(key,c)}items=[...groups.values()]}
 return items.sort((a,b)=>st.order==='desc'?-chapterCompare(a,b):chapterCompare(a,b));
}
async function openOnlineChapter(chapterId,manga,chapter){
 if(chapter.externalUrl){onlineState.resumeOfficial=null;window.open(chapter.externalUrl,'_blank','noopener,noreferrer');saveOnline(manga.id,{mangaId:manga.id,mangaTitle:manga.title,cover:manga.cover,chapterId,chapter:chapter.chapter,lang:chapter.lang,externalUrl:chapter.externalUrl});return}
 if(reading)return;reading=true;
 document.body.classList.add('rd-lock');const ov=document.createElement('div');ov.className='rd-ov rd-online-reader';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Leitura de '+manga.title);ov.tabIndex=-1;
 ov.innerHTML='<div class="rd-top"><button class="rd-b" data-a="back">← Capítulos</button><div class="rd-ttl"></div><button class="rd-b" data-a="mode"></button><button class="rd-b" data-a="rtl"></button><select class="rd-quality" aria-label="Qualidade"><option value="saver">Economia de dados</option><option value="original">Qualidade original</option></select><button class="rd-b" data-a="smaller" aria-label="Diminuir imagem">−</button><button class="rd-b" data-a="bigger" aria-label="Aumentar imagem">＋</button><button class="rd-b" data-a="theme" aria-label="Trocar tema">◐</button></div><div class="rd-wrap"><div class="rd-stage"><div class="rd-msg">Carregando capítulo…</div></div></div><div class="rd-bot"><button class="rd-b" data-a="prevchap">‹ Cap. anterior</button><button class="rd-b" data-a="prevpage">‹ Página</button><label class="rd-page-label">Página <input type="number" class="rd-page-number" min="1" value="1" aria-label="Ir para página"></label><span class="rd-info" aria-live="polite"></span><button class="rd-b" data-a="nextpage">Página ›</button><button class="rd-b" data-a="nextchap">Próximo cap. ›</button></div>';
 const focused=document.activeElement;document.body.appendChild(ov);ov.focus();
 const q=s=>ov.querySelector(s),stage=q('.rd-stage');q('.rd-ttl').textContent=manga.title+' · Cap. '+chapter.chapter+' · '+chapter.lang.toUpperCase();
 let imgs=[],idx=0,mode=prefs.cbzMode==='web'?'web':'page',dead=false,loadToken=0,observer=null;
 const old=onlineProg[manga.id]||{};if(old.chapterId===chapterId)idx=Math.max(0,+old.page||0);
 const save=()=>{if(imgs.length&&!dead)saveOnline(manga.id,{mangaId:manga.id,mangaTitle:manga.title,cover:manga.cover,chapterId,chapter:chapter.chapter,lang:chapter.lang,page:idx,pct:(idx+1)/imgs.length,externalUrl:''})};
 const setTheme=()=>{const t=THEMES[prefs.theme];ov.style.setProperty('--rd-bg',t.bg);ov.style.setProperty('--rd-fg',t.fg);ov.dataset.theme=prefs.theme};setTheme();
 function siblings(){const items=visibleChapters().filter(c=>c.lang===chapter.lang&&c.readable);if(!items.some(c=>c.id===chapterId)){const key=c=>[c.lang,c.volume,c.chapter].join('|');const at=items.findIndex(c=>key(c)===key(chapter));if(at>=0)items[at]=chapter;else items.push(chapter)}return items.sort(chapterCompare)}
 function info(){q('.rd-info').textContent='/ '+imgs.length;q('.rd-page-number').value=idx+1;q('.rd-page-number').max=imgs.length;q('[data-a=prevpage]').disabled=!imgs.length||idx===0;q('[data-a=nextpage]').disabled=!imgs.length||idx===imgs.length-1;const a=siblings(),i=a.findIndex(c=>c.id===chapterId);q('[data-a=prevchap]').disabled=i<0||(i===0&&!(onlineState.chapterMore&&onlineState.order==='desc'));q('[data-a=nextchap]').disabled=i<0||(!a[i+1]&&!(onlineState.chapterMore&&onlineState.order==='asc'));save()}
 function imgElement(u,i){
  const frame=document.createElement('div');frame.className='rd-page-frame';frame.dataset.i=i;const im=document.createElement('img');im.alt='Página '+(i+1)+' de '+manga.title;im.referrerPolicy='no-referrer';im.loading=Math.abs(i-idx)>2?'lazy':'eager';im.src=u;
  const retry=document.createElement('button');retry.className='rd-image-retry';retry.hidden=true;retry.textContent='Página '+(i+1)+' não carregou. Tentar novamente';retry.onclick=()=>{retry.hidden=true;im.src=u+(u.includes('?')?'&':'?')+'retry='+Date.now()};im.onerror=()=>{retry.hidden=false};im.onload=()=>{retry.hidden=true;frame.classList.add('rd-page-loaded')};frame.append(im,retry);return frame;
 }
 function mount(){
  observer?.disconnect();q('[data-a=mode]').textContent=mode==='web'?'Rolagem':'Página';q('[data-a=rtl]').textContent=prefs.rtl?'Direita → esquerda':'Esquerda → direita';stage.innerHTML='';
  const box=document.createElement('div');box.className='rd-cbz'+(mode==='web'?' rd-web':'');const wrap=document.createElement('div');wrap.className='rd-webin';wrap.style.maxWidth=(800*prefs.size/100)+'px';
  if(mode==='page')wrap.appendChild(imgElement(imgs[idx],idx));else imgs.forEach((u,i)=>wrap.appendChild(imgElement(u,i)));
  box.appendChild(wrap);stage.appendChild(box);
  if(mode==='web'){
   observer=new IntersectionObserver(es=>{if(dead)return;const visible=es.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio);if(visible[0]){idx=+visible[0].target.dataset.i;info()}},{root:box,threshold:[0,.1,.5]});[...wrap.children].forEach(x=>observer.observe(x));
   const target=wrap.children[idx];requestAnimationFrame(()=>{if(!dead)box.scrollTop=target?.offsetTop||0});
   const im=target?.querySelector('img');if(im&&!im.complete)im.addEventListener('load',()=>{if(!dead)box.scrollTop=target.offsetTop},{once:true});
  }
  info();
 }
 function go(d){if(!imgs.length||dead)return;const n=Math.max(0,Math.min(imgs.length-1,idx+d));if(n!==idx){idx=n;if(mode==='web'){const b=stage.querySelector('.rd-cbz');b.querySelector('[data-i="'+idx+'"]').scrollIntoView({block:'start'});info()}else mount()}}
 async function sibling(d){
  if(dead)return;q('[data-a=nextchap]').disabled=true;q('[data-a=prevchap]').disabled=true;
  let a=siblings(),i=a.findIndex(c=>c.id===chapterId);
  while(((d>0&&i===a.length-1&&onlineState.order==='asc')||(d<0&&i===0&&onlineState.order==='desc'))&&onlineState.chapterMore&&!dead){await loadChapters(false);if(onlineState.error)break;a=siblings();i=a.findIndex(c=>c.id===chapterId)}
  if(dead)return;const next=a[i+d];if(next?.externalUrl){stage.innerHTML='<div class="rd-msg"><div>O próximo capítulo usa '+esc(next.source)+'.<p><a class="btn" href="'+esc(next.externalUrl)+'" target="_blank" rel="noopener noreferrer" data-next-official="'+esc(next.id)+'">Abrir capítulo '+esc(next.chapter)+' ↗</a></p><button class="rd-b" data-a="restore">Voltar às páginas</button></div></div>';info()}
  else if(next){close(false);openOnlineChapter(next.id,manga,next)}else info();
 }
 function close(show=true){if(dead)return;save();dead=true;reading=false;loadToken++;observer?.disconnect();document.removeEventListener('keydown',keys,true);ov.remove();document.body.classList.remove('rd-lock');if(show)renderShelf();focused?.focus?.()}
 function keys(e){
  if(e.key==='Tab'){const f=[...ov.querySelectorAll('button:not(:disabled),select,input')].filter(x=>!x.hidden);if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&document.activeElement===f[f.length-1]){e.preventDefault();f[0].focus()}return}
  if(e.key==='Escape'){e.stopPropagation();close();return}if(['INPUT','SELECT'].includes(e.target.tagName))return;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();go((e.key==='ArrowRight'?1:-1)*(prefs.rtl?-1:1))}
 }document.addEventListener('keydown',keys,true);
 async function load(){const token=++loadToken;stage.innerHTML='<div class="rd-msg">Carregando páginas…</div>';try{const j=await readerJson('/pages/'+chapterId,{quality:q('.rd-quality').value});if(dead||token!==loadToken)return;if(j.externalUrl){stage.innerHTML='<div class="rd-msg">Este capítulo usa o leitor oficial. <a class="btn" target="_blank" rel="noopener noreferrer" href="'+esc(j.externalUrl)+'">Abrir '+esc(j.source)+'</a></div>';return}imgs=j.pages;if(!imgs.length)throw new Error('Nenhuma página disponível.');idx=Math.min(idx,imgs.length-1);mount()}catch(e){if(!dead&&token===loadToken)stage.innerHTML='<div class="rd-msg">'+esc(e.message)+'<p><button class="rd-b" data-a="retry">Tentar novamente</button></p></div>'}}
 ov.addEventListener('click',e=>{const official=e.target.closest('[data-next-official]');if(official){const c=siblings().find(x=>x.id===official.dataset.nextOfficial);if(c)saveOnline(manga.id,{mangaId:manga.id,mangaTitle:manga.title,cover:manga.cover,chapterId:c.id,chapter:c.chapter,lang:c.lang,externalUrl:c.externalUrl});return}const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;if(a==='restore'&&imgs.length)mount();else if(a==='back')close();else if(a==='retry')load();else if(a==='mode'){mode=mode==='web'?'page':'web';prefs.cbzMode=mode;savePrefs();if(imgs.length)mount()}else if(a==='rtl'){prefs.rtl=!prefs.rtl;savePrefs();if(imgs.length)mount()}else if(a==='prevpage')go(-1);else if(a==='nextpage')go(1);else if(a==='smaller'||a==='bigger'){prefs.size=Math.min(220,Math.max(60,prefs.size+(a==='bigger'?10:-10)));savePrefs();if(imgs.length)mount()}else if(a==='theme'){prefs.theme=THEME_ORDER[(THEME_ORDER.indexOf(prefs.theme)+1)%THEME_ORDER.length];savePrefs();setTheme()}else if(a==='prevchap')sibling(-1);else if(a==='nextchap')sibling(1)});
 q('.rd-quality').addEventListener('change',load);q('.rd-page-number').addEventListener('change',e=>{const n=Math.min(imgs.length,Math.max(1,+e.target.value||1));go(n-1-idx)});
 await load();
}
function coverHtml(x){return x.cover?'<img src="'+esc(x.cover)+'" alt="Capa de '+esc(x.title||x.mangaTitle)+'" loading="lazy" referrerpolicy="no-referrer">':'<div class="rd-cover" aria-label="Capa indisponível">📖</div>'}
function onlineHtml(){
 const st=onlineState,p=st.manga&&onlineProg[st.manga.id];
 let h='<div class="rd-online"><div class="rd-online-head"><div><b>Leitor de mangás</b><div class="m">Busque, escolha o idioma e continue de onde parou.</div></div><form id="rd-search"><input id="rd-q" type="search" aria-label="Título do mangá" placeholder="Ex.: One Piece, Berserk, Solo Leveling" value="'+esc(st.query)+'"><select id="rd-source" aria-label="Fonte de busca"><option value="all"'+(st.source==='all'?' selected':'')+'>Todas as fontes</option><option value="mangadex"'+(st.source==='mangadex'?' selected':'')+'>MangaDex</option><option value="kitsu"'+(st.source==='kitsu'?' selected':'')+'>Kitsu · catálogo</option></select><button class="btn"'+(st.loading?' disabled':'')+'>Pesquisar</button></form></div>';
 if(st.loading||st.chapterLoading)h+='<div class="msg" role="status">'+(st.chapterLoading?'Carregando capítulos…':'Pesquisando…')+'</div>';
 if(st.error)h+='<div class="msg rd-error" role="alert">'+esc(st.error)+'</div>';
 if(st.manga){
  h+='<div class="rd-manga-head">'+coverHtml(st.manga)+'<div><button class="rd-link" data-online-back>← Resultados</button><h3>'+esc(st.manga.title)+'</h3><div class="m">'+esc(st.manga.alt||'')+'</div>'+(p?(p.externalUrl?'<a class="btn rd-continue" href="'+esc(p.externalUrl)+'" target="_blank" rel="noopener noreferrer">Continuar no cap. '+esc(p.chapter)+' ↗</a>':'<button class="btn rd-continue" data-resume="'+esc(st.manga.id)+'">Continuar no cap. '+esc(p.chapter)+'</button>'):'')+'</div></div>';
  if(st.resumeOfficial)h+='<p><a class="btn" href="'+esc(st.resumeOfficial.externalUrl)+'" target="_blank" rel="noopener noreferrer">Retomar capítulo '+esc(st.resumeOfficial.chapter)+' em '+esc(st.resumeOfficial.source)+' ↗</a></p>';
  if(st.officialLinks?.length)h+='<div class="rd-official">'+st.officialLinks.map(x=>'<a class="chip" target="_blank" rel="noopener noreferrer" href="'+esc(x.url)+'">Abrir '+esc(x.name)+' ↗</a>').join('')+'</div>';
  if(st.catalogOnly)h+='<div class="msg">Obra encontrada no catálogo Kitsu. '+(st.lookupFailed?'A consulta de capítulos está indisponível. Tente novamente.':'Nenhum capítulo correspondente no MangaDex.')+' Use o link oficial quando disponível ou adicione seu arquivo abaixo.</div>';
  else{
   const langs=[...new Set(['pt-br','en',...(st.manga.languages||[]),st.lang])].filter(x=>x&&x!=='all');const sources=[...new Set(st.chapters.map(c=>c.source))];
   h+='<div class="rd-filters"><label>Idioma <select id="rd-lang">'+langs.map(x=>'<option value="'+esc(x)+'"'+(st.lang===x?' selected':'')+'>'+esc(x==='pt-br'?'Português (Brasil)':x==='en'?'Inglês':x.toUpperCase())+'</option>').join('')+'<option value="all"'+(st.lang==='all'?' selected':'')+'>Todos os idiomas</option></select></label><label>Leitura <select id="rd-chapter-source"><option value="all">Todas as fontes</option>'+sources.map(x=>'<option'+(st.chapterSource===x?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label><label>Ordem <select id="rd-order"><option value="asc"'+(st.order==='asc'?' selected':'')+'>Primeiros capítulos</option><option value="desc"'+(st.order==='desc'?' selected':'')+'>Últimos capítulos</option></select></label><label class="rd-versions"><input id="rd-versions" type="checkbox"'+(st.versions?' checked':'')+'>Mostrar versões de grupos</label></div>';
   h+='<p class="m">'+st.chapters.length+' registros carregados de '+(st.total||0)+' neste idioma. As versões repetidas são agrupadas. A disponibilidade depende da fonte e do idioma. Capítulos oficiais abrem na fonte indicada.</p>';
   const visible=visibleChapters();
   h+='<div class="rd-chapters">'+visible.map(c=>c.externalUrl?'<a class="rd-chapter" data-official-chapter="'+esc(c.id)+'" href="'+esc(c.externalUrl)+'" target="_blank" rel="noopener noreferrer"><b>Capítulo '+esc(c.chapter)+'</b><span>'+esc([c.title,c.lang.toUpperCase(),c.source+' ↗'].filter(Boolean).join(' · '))+'</span></a>':'<button class="rd-chapter" data-chapter="'+esc(c.id)+'"'+(!c.readable?' disabled':'')+'><b>Capítulo '+esc(c.chapter)+'</b><span>'+esc([c.title,c.lang.toUpperCase(),c.group,c.pages?c.pages+' pág.':'Sem páginas disponíveis'].filter(Boolean).join(' · '))+'</span></button>').join('')+'</div>';
   if(!visible.length&&!st.chapterLoading)h+='<div class="msg">Nenhum capítulo disponível com estes filtros. Selecione outro idioma ou fonte.</div>';
   if(st.chapterMore)h+='<div class="rd-load"><button class="btn" data-more-chapters'+(st.chapterLoading||st.loadingAll?' disabled':'')+'>Carregar mais capítulos</button><button class="btn" data-all-chapters'+(st.chapterLoading&&!st.loadingAll?' disabled':'')+'>'+(st.loadingAll?'Parar carregamento':'Carregar todos disponíveis')+'</button></div>';
  }
 }else{
  if(st.sources.length)h+='<p class="m" role="status">'+st.sources.map(x=>esc(x.name)+': '+(x.available?'disponível':'indisponível — '+esc(x.error))).join(' · ')+'</p>';
  if(st.results.length)h+='<div class="rd-results">'+st.results.map(x=>'<button class="rd-result" data-manga="'+esc(x.id)+'">'+coverHtml(x)+'<span><b>'+esc(x.title)+'</b><small>'+esc(x.alt)+'</small><small>'+esc([x.year,x.sourceLabel].filter(Boolean).join(' · '))+'</small></span></button>').join('')+'</div>';
  if(st.more)h+='<button class="btn rd-load" data-more-results'+(st.loading?' disabled':'')+'>Carregar mais resultados</button>';
  if(!st.query){const recent=Object.values(onlineProg).filter(p=>p.mangaId).sort((a,b)=>b.t-a.t).slice(0,8);if(recent.length)h+='<h3>Continuar lendo</h3><div class="rd-results">'+recent.map(p=>'<button class="rd-result" data-resume="'+esc(p.mangaId)+'">'+coverHtml(p)+'<span><b>'+esc(p.mangaTitle)+'</b><small>Capítulo '+esc(p.chapter)+' · '+esc(p.lang||'')+'</small></span></button>').join('')+'</div>';else h+='<div class="msg">Pesquise um título para escolher capítulos. MangaDex fornece páginas internas; MANGA Plus, ComicWalker e outros leitores oficiais aparecem quando a obra tem capítulos nessas fontes.</div>'}
 }
 return h+'</div>';
}

/* ---------- integração com as abas do site ---------- */
function init(){
 const nav=document.querySelector('nav'),main=document.querySelector('main');
 if(!nav||!main||document.getElementById('t-rd'))return;
 sec=document.createElement('section');sec.id='v-rd';sec.style.display='none';main.appendChild(sec);
 const btn=document.createElement('button');btn.id='t-rd';btn.textContent='📖 Leitor';nav.appendChild(btn);

 const others=()=>[...main.querySelectorAll('section[id^="v-"]')].filter(s=>s!==sec);
 btn.addEventListener('click',()=>{
  others().forEach(s=>{s.style.display='none'});
  nav.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b===btn));
  sec.style.display='';renderShelf();
 });
 const hide=()=>{sec.style.display='none';btn.classList.remove('on')};
 nav.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&b!==btn)hide()});
 new MutationObserver(()=>{
  if(sec.style.display!=='none'&&others().some(s=>s.style.display!=='none'))hide();
 }).observe(main,{attributes:true,subtree:true,attributeFilter:['style']});

 sec.addEventListener('click',async e=>{
  const mg=e.target.closest('[data-manga]');if(mg){loadOnlineManga(mg.dataset.manga);return}
  if(e.target.closest('[data-online-back]')){++onlineRequest;++chapterRequest;++allSession;onlineState.manga=null;onlineState.chapters=[];onlineState.loading=false;onlineState.loadingAll=false;onlineState.chapterLoading=false;renderShelf();return}
  const resume=e.target.closest('[data-resume]');if(resume){loadOnlineManga(resume.dataset.resume,true);return}
  if(e.target.closest('[data-more-results]')){searchOnline(onlineState.query,true);return}
  if(e.target.closest('[data-more-chapters]')){loadChapters(false);return}
  if(e.target.closest('[data-all-chapters]')){if(onlineState.loadingAll){++allSession;onlineState.loadingAll=false;renderShelf()}else loadAllChapters();return}
  const official=e.target.closest('[data-official-chapter]');if(official){const c=onlineState.chapters.find(x=>x.id===official.dataset.officialChapter);if(c)saveOnline(onlineState.manga.id,{mangaId:onlineState.manga.id,mangaTitle:onlineState.manga.title,cover:onlineState.manga.cover,chapterId:c.id,chapter:c.chapter,lang:c.lang,externalUrl:c.externalUrl});return}
  const ch=e.target.closest('[data-chapter]');if(ch&&onlineState.manga){const c=onlineState.chapters.find(x=>x.id===ch.dataset.chapter);if(c)openOnlineChapter(c.id,onlineState.manga,c);return}
  const del=e.target.closest('[data-del]');
  if(del){
   e.stopPropagation();
   if(confirm('Remover este arquivo do leitor? (Ele sai só daqui; o original no seu aparelho não é apagado.)')){
    const id=del.dataset.del;
    await tx('readwrite',s=>s.delete(id));delete prog[id];jset(PK,prog);renderShelf();
   }
   return;
  }
  if(e.target.closest('#rd-add')){document.getElementById('rd-file').click();return}
  const card=e.target.closest('.rd-card');
  if(card)openBook(card.dataset.id);
 });
 sec.addEventListener('change',async e=>{
  if(e.target.id==='rd-source'){onlineState.source=e.target.value;if(onlineState.query)searchOnline(onlineState.query);return}
  if(e.target.id==='rd-lang'){++onlineRequest;++allSession;onlineState.loading=false;onlineState.loadingAll=false;onlineState.chapterSource='all';onlineState.lang=e.target.value;loadChapters(true);return}
  if(e.target.id==='rd-order'){++onlineRequest;++allSession;onlineState.loading=false;onlineState.loadingAll=false;onlineState.order=e.target.value;loadChapters(true);return}
  if(e.target.id==='rd-chapter-source'){onlineState.chapterSource=e.target.value;renderShelf();return}
  if(e.target.id==='rd-versions'){onlineState.versions=e.target.checked;renderShelf();return}
  if(e.target.id==='rd-file'){const fs=[...e.target.files];e.target.value='';await addFiles(fs)}
 });
 sec.addEventListener('error',e=>{if(e.target.tagName==='IMG'&&e.target.closest('.rd-result,.rd-manga-head')){const placeholder=document.createElement('div');placeholder.className='rd-cover';placeholder.textContent='📖';placeholder.setAttribute('aria-label','Capa indisponível');e.target.replaceWith(placeholder)}},true);
 sec.addEventListener('submit',e=>{if(e.target.id==='rd-search'){e.preventDefault();searchOnline((sec.querySelector('#rd-q')||{}).value)}});
 ['dragover','drop'].forEach(ev=>sec.addEventListener(ev,e=>{
  e.preventDefault();
  if(ev==='drop'&&e.dataTransfer&&e.dataTransfer.files.length)addFiles([...e.dataTransfer.files]);
 }));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
async function openOnlineByTitle(title){
 title=String(title||'').trim();if(!title)return;
 document.getElementById('t-rd')?.click();await searchOnline(title);
 // Let the user choose among editions instead of silently opening an unrelated title.
}
window.OtakuReader={open:openBook,refresh:renderShelf,openOnline:openOnlineByTitle};
})();
