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
 sec.innerHTML=
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
  if(e.target.id==='rd-file'){const fs=[...e.target.files];e.target.value='';await addFiles(fs)}
 });
 ['dragover','drop'].forEach(ev=>sec.addEventListener(ev,e=>{
  e.preventDefault();
  if(ev==='drop'&&e.dataTransfer&&e.dataTransfer.files.length)addFiles([...e.dataTransfer.files]);
 }));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
window.OtakuReader={open:openBook,refresh:renderShelf};
})();
