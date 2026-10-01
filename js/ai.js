/* ===== Biblioteca Otaku — inteligência V2 ===== */
(function(){
'use strict';
const KEY='otaku-ai-v2';
const get=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return{}}};
let A=Object.assign({feedback:{},authors:{},recommended:{},history:[],noRecommend:{}},get());
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(A))}catch(e){}};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const works=()=>Object.values(window.lib||{}).filter(x=>x&&x.id);
const label=k=>({anime:'Anime',donghua:'Donghua',aeni:'Aeni',manga:'Mangá',manhwa:'Manhwa',manhua:'Manhua',novel:'Novel',webnovel:'WEB Novel',book:'Livro',movie:'Filme',game:'Jogo'})[k]||k;

function styles(){
 if(document.getElementById('ai-v2-style'))return;
 const s=document.createElement('style');s.id='ai-v2-style';
 s.textContent='.ai-panel{background:var(--panel);border:1px solid var(--panel2);border-radius:14px;padding:15px;margin:12px 0}.ai-title{font:700 20px Georgia,serif;margin:0 0 4px}.ai-sub{color:var(--mut);font-size:13px}.ai-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px;margin-top:12px}.ai-mini{background:var(--panel2);border-radius:11px;padding:11px}.ai-mini b{display:block;margin-bottom:5px}.ai-bar{height:8px;background:var(--bg);border-radius:99px;overflow:hidden;margin-top:7px}.ai-bar i{display:block;height:100%;background:var(--ac)}.ai-chips,.ai-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.ai-chip{background:var(--panel2);color:var(--tx);border:1px solid transparent;border-radius:999px;padding:7px 11px;cursor:pointer}.ai-chip:hover,.ai-chip.on{border-color:var(--ac)}.ai-card-tools{display:flex;gap:5px;margin-top:7px}.ai-card-tools button{cursor:pointer}.ai-author{background:var(--panel2);color:var(--tx);border:1px solid transparent;border-radius:10px;padding:7px 10px;cursor:pointer}.ai-author:hover{border-color:var(--ac)}';
 document.head.appendChild(s);
}
function profile(){
 const g={},types={},authors={},rated=works().filter(x=>Number(x.rating)>0);
 rated.forEach(x=>{const w=Number(x.rating)||0;types[x.kind]=(types[x.kind]||0)+w;(x.genres||[]).forEach(v=>g[v]=(g[v]||0)+w);(x.authors||[]).forEach(a=>{const n=typeof a==='string'?a:a?.name;if(n)authors[n]=(authors[n]||0)+w});if(x.author)authors[x.author]=(authors[x.author]||0)+w});
 return {g,types,authors,rated};
}
function dna(){
 const p=profile(),all=Object.entries(p.g).sort((a,b)=>b[1]-a[1]),max=Math.max(1,...all.map(x=>x[1]));
 return all.slice(0,8).map(x=>({name:x[0],value:Math.round(x[1]/max*100)}));
}
function collections(){
 const w=works();
 return {
  thinking:w.filter(x=>(x.genres||[]).some(g=>/psych|mystery|thriller|seinen|drama|philos/i.test(g))||/filosof|psicol|mister|moral|complex/i.test([x.note,x.syn,(x.tags||[]).join(' ')].join(' '))),
  emotional:w.filter(x=>Number(x.rating)>=4&&(x.genres||[]).some(g=>/drama|romance|tragedy|psychological|melodrama/i.test(g))),
  favorites:w.filter(x=>x.fav),
  perfect:w.filter(x=>Number(x.rating)===5),
  abandoned:w.filter(x=>x.status==='Abandonado')
 };
}
function feedbackPanel(id){
 const v=A.feedback[String(id)]||'';
 const d=document.createElement('div');d.className='ai-panel';d.id='ai-feedback-panel';
 d.innerHTML='<b>Como você se sente sobre esta obra?</b><div class="ai-actions">'+
 '<button class="chip '+(v==='like'?'on':'')+'" data-aif="like">👍 Gostei</button>'+
 '<button class="chip '+(v==='love'?'on':'')+'" data-aif="love">❤️ Adorei</button>'+
 '<button class="chip '+(v==='dislike'?'on':'')+'" data-aif="dislike">👎 Não gostei</button>'+
 '<button class="chip '+(v==='avoid'?'on':'')+'" data-aif="avoid">🚫 Não recomendar</button>'+
 '<button class="chip '+(v==='seen'?'on':'')+'" data-aif="seen">👁 Já conheço</button></div>';
 d.addEventListener('click',e=>{const b=e.target.closest('[data-aif]');if(!b)return;const val=b.dataset.aif;A.feedback[String(id)]=val;if(val==='avoid'||val==='dislike')A.noRecommend[String(id)]=Date.now();else delete A.noRecommend[String(id)];save();d.querySelectorAll('[data-aif]').forEach(x=>x.classList.toggle('on',x===b))});
 return d;
}
function attachFeedback(){
 const box=document.querySelector('#box');if(!box||box.dataset.aiFeedback)return;
 const title=box.querySelector('h2')?.textContent?.trim();if(!title)return;
 const item=works().find(x=>norm(x.title)===norm(title));
 if(!item)return;
 box.dataset.aiFeedback='1';
 box.appendChild(feedbackPanel(item.id));
}
async function api(query,variables){
 const r=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables})});
 const j=await r.json();if(!r.ok||j.errors?.length)throw new Error(j.errors?.[0]?.message||'AniList indisponível');return j.data;
}
async function authorSearch(name){
 const k=norm(name);if(A.authors[k])return A.authors[k];
 const q='query($s:String){Staff(search:$s){id name{full native}image{large}primaryOccupations works(sort:POPULARITY_DESC,perPage:30){edges{role node{id type format title{romaji english native}coverImage{large}genres averageScore popularity}}}}}';
 const d=await api(q,{s:name});if(!d?.Staff)throw new Error('Autor não encontrado.');
 const a={id:d.Staff.id,name:d.Staff.name.full,native:d.Staff.name.native||'',image:d.Staff.image?.large||'',occupations:d.Staff.primaryOccupations||[],works:(d.Staff.works?.edges||[]).map(e=>Object.assign({role:e.role},e.node))};
 A.authors[k]=a;save();return a;
}
async function authorPage(name){
 styles();
 let p=document.getElementById('ai-author-page');if(p)p.remove();
 p=document.createElement('div');p.id='ai-author-page';p.className='ai-panel';p.innerHTML='<div class="ai-sub">Buscando autor...</div>';
 const r=document.querySelector('#results');if(r)r.before(p);
 try{
  const a=await authorSearch(name);
  p.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><div class="ai-title">👤 '+esc(a.name)+'</div><div class="ai-sub">'+esc(a.occupations.join(' · ')||'Autor / criador')+'</div></div><button class="chip '+(a.favorite?'on':'')+'" id="ai-fav-author">'+(a.favorite?'★ Autor favorito':'☆ Favoritar autor')+'</button></div>';
  const grid=document.createElement('div');grid.className='ai-grid';
  a.works.slice(0,18).forEach(w=>{const x=document.createElement('div');x.className='ai-mini';x.innerHTML='<b>'+esc(w.title?.english||w.title?.romaji||w.title?.native||'')+'</b><span class="ai-sub">'+esc(w.role||'')+(w.averageScore?' · ★ '+(w.averageScore/20).toFixed(1):'')+'</span>';x.onclick=()=>{window.current=window.current||{};window.current[w.id]={id:w.id,title:w.title?.english||w.title?.romaji||w.title?.native||'',kind:w.type==='MANGA'?'manga':'anime',cover:w.coverImage?.large||'',genres:w.genres||[],avg:(w.averageScore||0)/10};try{openModal(w.id)}catch(e){}};grid.appendChild(x)});
  p.appendChild(grid);
  p.querySelector('#ai-fav-author').onclick=()=>{a.favorite=!a.favorite;A.authors[norm(a.name)]=a;save();authorPage(a.name)};
  p.scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){p.innerHTML='<div class="msg">'+esc(e.message)+'</div>'}
}
function renderDashboard(){
 styles();
 const box=document.querySelector('#bo-lib-dashboard');if(!box)return;
 let p=document.getElementById('ai-dashboard');if(p)p.remove();
 p=document.createElement('div');p.id='ai-dashboard';
 const d=dna(),c=collections(),authors=Object.values(A.authors).filter(x=>x.favorite);
 p.innerHTML='<div class="ai-panel"><div class="ai-title">🧬 DNA Otaku</div><div class="ai-sub">Baseado nas suas notas, gêneros, tipos e feedback.</div><div class="ai-grid">'+
 (d.length?d.slice(0,6).map(x=>'<div class="ai-mini"><b>'+esc(x.name)+'</b><span>'+x.value+'%</span><div class="ai-bar"><i style="width:'+x.value+'%"></i></div></div>').join(''):'<span class="ai-sub">Avalie algumas obras para formar seu DNA.</span>')+
 '</div></div><div class="ai-panel"><div class="ai-title">🧠 Coleções automáticas</div><div class="ai-chips">'+
 '<button class="ai-chip" data-aic="thinking">🧠 Para pensar ('+c.thinking.length+')</button>'+
 '<button class="ai-chip" data-aic="emotional">🥲 Me destruiu emocionalmente ('+c.emotional.length+')</button>'+
 '<button class="ai-chip" data-aic="favorites">⭐ Favoritos ('+c.favorites.length+')</button>'+
 '<button class="ai-chip" data-aic="perfect">👑 5 estrelas ('+c.perfect.length+')</button>'+
 '<button class="ai-chip" data-aic="abandoned">💀 Abandonados ('+c.abandoned.length+')</button></div></div>'+
 '<div class="ai-panel"><div class="ai-title">👤 Autores favoritos</div><div class="ai-chips" id="ai-authors"></div></div>';
 box.appendChild(p);
 const ag=p.querySelector('#ai-authors');
 if(authors.length)authors.forEach(a=>{const b=document.createElement('button');b.className='ai-author';b.textContent='★ '+a.name;b.onclick=()=>authorPage(a.name);ag.appendChild(b)});
 else ag.innerHTML='<span class="ai-sub">Use "Buscar autor" e favorite autores para criar sua lista.</span>';
 p.querySelectorAll('[data-aic]').forEach(b=>b.onclick=()=>applyCollection(c[b.dataset.aic]||[]));
}
function addDiscoveryPanel(){
 if(document.getElementById('ai-discovery'))return;
 const host=document.querySelector('#v-search');if(!host)return;
 const p=document.createElement('div');p.id='ai-discovery';p.className='ai-panel';
 p.innerHTML='<div class="ai-title">✨ Descoberta inteligente</div><div class="ai-sub">O sistema aprende com suas avaliações e feedback.</div><div class="ai-actions"><button class="ai-chip" id="ai-author-search">👤 Buscar autor</button><button class="ai-chip" id="ai-rec-history">🕘 Histórico de recomendações</button></div><div id="ai-extra"></div>';
 const rec=document.querySelector('#recs');if(rec)rec.before(p);else host.insertBefore(p,host.firstElementChild);
 p.querySelector('#ai-author-search').onclick=async()=>{const n=prompt('Nome do autor/criador:');if(n)authorPage(n)};
 p.querySelector('#ai-rec-history').onclick=()=>{
  const e=p.querySelector('#ai-extra');e.innerHTML='<div class="ai-grid">'+A.history.slice().reverse().slice(0,30).map(x=>'<div class="ai-mini"><b>'+esc(x.title)+'</b><span class="ai-sub">'+label(x.kind)+' · '+(x.mode==='surprise'?'🎲':'✨')+' · '+new Date(x.at).toLocaleDateString('pt-BR')+'</span></div>').join('')+'</div>';
 };
}
function cardFeedback(){
 document.querySelectorAll('#recs .card,#bo5-recs2 .card').forEach(card=>{
  if(card.querySelector('.ai-card-tools'))return;
  const id=card.dataset.id;if(!id)return;
  if(!A.recommended[id])A.recommended[id]={last:Date.now(),count:1};else A.recommended[id].count=(A.recommended[id].count||0)+1;
  if(!A.history.some(h=>String(h.id)===String(id))){A.history.push({id:id,title:card.querySelector('.t')?.textContent||'',kind:(window.current?.[id]?.kind||''),mode:'recommend',at:Date.now()});A.history=A.history.slice(-300);save()}
  const d=document.createElement('div');d.className='ai-card-tools';d.innerHTML='<button class="chip" data-aicard="like">👍</button><button class="chip" data-aicard="dislike">👎</button><button class="chip" data-aicard="avoid">🚫</button>';
  d.onclick=e=>{const b=e.target.closest('[data-aicard]');if(!b)return;A.feedback[id]=b.dataset.aicard;if(b.dataset.aicard!=='like')A.noRecommend[id]=Date.now();else delete A.noRecommend[id];A.history.push({id,title:card.querySelector('.t')?.textContent||'',kind:(window.current?.[id]?.kind||''),mode:'recommend',at:Date.now()});A.history=A.history.slice(-300);save();if(b.dataset.aicard==='avoid'||b.dataset.aicard==='dislike')card.remove();};
  card.appendChild(d);
 });
}
function applyCollection(arr){
 const ids=new Set((arr||[]).map(x=>String(x.id)));
 if(typeof renderLib==='function')renderLib();
 document.querySelectorAll('#libgrid .card').forEach(card=>{card.style.display=ids.has(String(card.dataset.id))?'':'none'});
}
function renderAdvancedStats(){
 const box=document.querySelector('#v-stats');if(!box||!works().length)return;
 let p=document.getElementById('ai-stats');if(p)p.remove();
 p=document.createElement('div');p.id='ai-stats';p.className='ai-panel';
 const w=works(),rated=w.filter(x=>Number(x.rating)>0),avg=rated.length?(rated.reduce((a,x)=>a+Number(x.rating),0)/rated.length).toFixed(2):'—';
 const kinds={};w.forEach(x=>kinds[x.kind]=(kinds[x.kind]||0)+1);
 const fb={like:0,love:0,dislike:0,avoid:0,seen:0};Object.values(A.feedback).forEach(v=>{if(fb[v]!=null)fb[v]++});
 const hist=A.history.length;
 p.innerHTML='<div class="ai-title">📊 Inteligência da biblioteca</div><div class="ai-grid">'+
 '<div class="ai-mini"><b>Média das suas notas</b><span>★ '+avg+'/5</span></div>'+
 '<div class="ai-mini"><b>Obras avaliadas</b><span>'+rated.length+' de '+w.length+'</span></div>'+
 '<div class="ai-mini"><b>Feedbacks</b><span>👍 '+fb.like+' · ❤️ '+fb.love+' · 👎 '+fb.dislike+' · 🚫 '+fb.avoid+'</span></div>'+
 '<div class="ai-mini"><b>Recomendações vistas</b><span>'+hist+'</span></div></div>'+
 '<div class="ai-sub" style="margin-top:10px">'+Object.entries(kinds).sort((a,b)=>b[1]-a[1]).slice(0,8).map(x=>label(x[0])+': '+x[1]).join(' · ')+'</div>';
 box.appendChild(p);
}

function boot(){
 styles();addDiscoveryPanel();
 const old=window.renderLibraryDashboard;
 if(typeof old==='function'&&!old.__aiV2){const f=function(){old.apply(this,arguments);setTimeout(renderDashboard,20)};f.__aiV2=true;window.renderLibraryDashboard=f}
 const oldStats=window.renderStats;if(typeof oldStats==='function'&&!oldStats.__aiV2){const sf=function(){oldStats.apply(this,arguments);setTimeout(renderAdvancedStats,20)};sf.__aiV2=true;window.renderStats=sf}const observer=new MutationObserver(()=>{attachFeedback();cardFeedback()});observer.observe(document.body,{childList:true,subtree:true});
 setTimeout(()=>{renderDashboard();cardFeedback();renderAdvancedStats()},500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.OtakuAI={profile,dna,collections,authorSearch,authorPage,history:()=>A.history.slice(),block:id=>{A.noRecommend[id]=Date.now();save()},reset:()=>{A={feedback:{},authors:{},recommended:{},history:[],noRecommend:{}};save()}};
})();