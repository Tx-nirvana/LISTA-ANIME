/* Biblioteca Otaku — IA, DNA, feedback e descoberta */
(function(){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const store=()=>window.OtakuStore?.get?.()||{ai:{feedback:{},authors:{},history:[],noRecommend:{},recommended:{}},preferences:{}};
const works=()=>window.OtakuStore?.library?.()||Object.values(window.lib||{}).filter(x=>x&&x.id);
const label=k=>({anime:'Anime',donghua:'Donghua',aeni:'Aeni',manga:'Mangá',manhwa:'Manhwa',manhua:'Manhua',novel:'Novel',webnovel:'WEB Novel',book:'Livro',movie:'Filme',game:'Jogo'})[k]||k;

function dna(){
 const w=works(),g={},types={},authors={},scores=[];
 w.forEach(x=>{
  const r=Number(x.rating)||0;if(r){scores.push(r);types[x.kind]=(types[x.kind]||0)+r}
  (x.genres||[]).forEach(v=>g[v]=(g[v]||0)+Math.max(1,r));
  (x.authors||[]).forEach(a=>{const n=typeof a==='string'?a:a?.name;if(n)authors[n]=(authors[n]||0)+Math.max(1,r)});
 });
 const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,8);
 const max=Math.max(1,...Object.values(g));
 return {genres:top(g).map(([name,v])=>({name,value:Math.round(v/max*100)})),types:top(types),authors:top(authors),average:scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:0,rated:scores.length};
}
function collections(){
 const w=works();
 return {
  favorites:w.filter(x=>x.fav),perfect:w.filter(x=>Number(x.rating)===5),abandoned:w.filter(x=>x.status==='Abandonado')
 };
}
function feedbackPanel(id){return null;}
function attachFeedback(){return;}
async function authorSearch(name){
 const d=await window.OtakuAPI.anilist('query($s:String){Staff(search:$s){id name{full native}image{large}primaryOccupations works(sort:POPULARITY_DESC,perPage:30){edges{role node{id type format title{romaji english native}coverImage{large}genres averageScore popularity}}}}}',{s:name});
 const a=d?.Staff;if(!a)throw new Error('Autor não encontrado.');
 const key=norm(a.name.full);window.OtakuStore.patch(s=>s.ai.authors[key]=Object.assign({},s.ai.authors[key]||{},{
  id:a.id,name:a.name.full,native:a.name.native||'',image:a.image?.large||'',occupations:a.primaryOccupations||[],favorite:!!s.ai.authors[key]?.favorite,
  works:(a.works?.edges||[]).map(e=>Object.assign({role:e.role},e.node))
 }));return window.OtakuStore.get().ai.authors[key];
}
async function authorPage(name){
 let p=document.getElementById('ai-author-page');if(p)p.remove();
 p=document.createElement('div');p.id='ai-author-page';p.className='ai-panel';p.innerHTML='<div class="ai-sub">Buscando autor...</div>';
 const host=document.querySelector('#results')||document.querySelector('#v-search');if(host)host.before(p);
 try{
  const a=await authorSearch(name);
  p.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><div class="ai-title">👤 '+esc(a.name)+'</div><div class="ai-sub">'+esc(a.occupations.join(' · ')||'Autor / criador')+'</div></div><button class="chip '+(a.favorite?'on':'')+'" id="ai-fav">'+(a.favorite?'★ Autor favorito':'☆ Favoritar autor')+'</button></div>';
  const g=document.createElement('div');g.className='ai-grid';
  (a.works||[]).slice(0,18).forEach(w=>{const x=document.createElement('div');x.className='ai-mini';x.innerHTML='<b>'+esc(w.title?.english||w.title?.romaji||w.title?.native||'')+'</b><span class="ai-sub">'+esc(w.role||'')+(w.averageScore?' · ★ '+(w.averageScore/20).toFixed(1):'')+'</span>';x.onclick=()=>{window.current[w.id]={id:w.id,title:w.title?.english||w.title?.romaji||w.title?.native||'',kind:w.type==='MANGA'?'manga':'anime',cover:w.coverImage?.large||'',genres:w.genres||[],avg:(w.averageScore||0)/10};try{openModal(w.id)}catch(e){}};g.appendChild(x)});
  p.appendChild(g);p.querySelector('#ai-fav').onclick=()=>{window.OtakuStore.patch(s=>s.ai.authors[norm(a.name)].favorite=!a.favorite);authorPage(a.name)};
 }catch(e){p.innerHTML='<div class="msg">'+esc(e.message)+'</div>'}
}
function renderDashboard(){
 const host=document.querySelector('#bo-lib-dashboard');if(!host)return;
 let p=document.getElementById('ai-dashboard');if(p)p.remove();
 const d=dna(),c=collections(),authors=Object.values(store().ai.authors||{}).filter(x=>x.favorite);
 p=document.createElement('div');p.id='ai-dashboard';p.innerHTML=
 '<div class="ai-panel"><div class="ai-title">🧬 DNA Otaku</div><div class="ai-sub">Gêneros, formatos, autores, notas e comportamento de leitura/visualização.</div><div class="ai-grid">'+(d.genres.length?d.genres.slice(0,6).map(x=>'<div class="ai-mini"><b>'+esc(x.name)+'</b><span>'+x.value+'%</span><div class="ai-bar"><i style="width:'+x.value+'%"></i></div></div>').join(''):'<span class="ai-sub">Avalie obras para formar seu DNA.</span>')+'</div><div class="ai-sub" style="margin-top:10px">Média: '+(d.average?d.average.toFixed(2):'—')+'/5 · '+d.rated+' avaliadas</div></div>'+
 '<div class="ai-panel"><div class="ai-title">👤 Autores favoritos</div><div class="ai-chips" id="ai-authors"></div></div>';
 host.appendChild(p);
 const ag=p.querySelector('#ai-authors');if(authors.length)authors.forEach(a=>{const b=document.createElement('button');b.className='ai-author';b.textContent='★ '+a.name;b.onclick=()=>authorPage(a.name);ag.appendChild(b)});else ag.innerHTML='<span class="ai-sub">Nenhum autor favorito ainda.</span>';
 p.querySelectorAll('[data-col]').forEach(b=>b.onclick=()=>{const ids=new Set((c[b.dataset.col]||[]).map(x=>String(x.id)));if(typeof renderLib==='function')renderLib();document.querySelectorAll('#libgrid .card').forEach(x=>x.style.display=ids.has(String(x.dataset.id))?'':'none')});
}
function trackRecommendations(){
 document.querySelectorAll('#bo5-recs2 .card').forEach(card=>{
  const id=card.dataset.id;if(!id||card.dataset.aiTracked)return;card.dataset.aiTracked='1';
  const w=works().find(x=>String(x.id)===String(id))||window.current?.[id]||{id,title:card.querySelector('.t')?.textContent||'',kind:card.querySelector('.tag')?.textContent||''};
  window.OtakuStore.markRecommended(w,window.__r2mode||'recommended');
 });
}
function styles(){if(document.getElementById('ai-v3-style'))return;const s=document.createElement('style');s.id='ai-v3-style';s.textContent='.ai-panel{background:var(--panel);border:1px solid var(--panel2);border-radius:14px;padding:15px;margin:12px 0}.ai-title{font:700 20px Georgia,serif;margin-bottom:4px}.ai-sub{color:var(--mut);font-size:13px}.ai-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px;margin-top:12px}.ai-mini{background:var(--panel2);border-radius:11px;padding:11px}.ai-mini b{display:block;margin-bottom:5px}.ai-bar{height:8px;background:var(--bg);border-radius:99px;overflow:hidden;margin-top:7px}.ai-bar i{display:block;height:100%;background:var(--ac)}.ai-chips,.ai-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.ai-chip,.ai-author{background:var(--panel2);color:var(--tx);border:1px solid transparent;border-radius:999px;padding:7px 11px;cursor:pointer}.ai-chip:hover,.ai-chip.on,.ai-author:hover{border-color:var(--ac)}.ai-card-tools{display:flex;gap:5px;margin-top:7px;flex-wrap:wrap}.ai-card-tools button{cursor:pointer}.ai-feedback{background:transparent;border:0;padding:8px 0;margin:0}.ai-feedback .ai-actions{margin-top:6px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.ai-feedback .ai-actions .chip{font-size:12px;padding:7px 6px}.ai-feedback .ai-actions .chip:nth-child(1){grid-column:span 2}@media(max-width:640px){.ai-feedback .ai-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.ai-feedback .ai-actions .chip:nth-child(1){grid-column:span 2}}';document.head.appendChild(s)}
function historyPanel(){
 let p=document.getElementById('ai-history');if(p)p.remove();p=document.createElement('div');p.id='ai-history';p.className='ai-panel';
 const h=store().ai.history||[];p.innerHTML='<div class="ai-title">🕘 Histórico de recomendações</div><div class="ai-grid">'+h.slice().reverse().slice(0,40).map(x=>'<div class="ai-mini"><b>'+esc(x.title)+'</b><span class="ai-sub">'+esc(label(x.kind))+' · '+(x.mode==='surprise'?'🎲 Me surpreenda':'✨ Recomendados')+' · '+new Date(x.at).toLocaleDateString('pt-BR')+'</span></div>').join('')+'</div>';
 const host=document.querySelector('#v-search');if(host)host.insertBefore(p,host.firstElementChild);
}
function boot(){
 styles();
 const old=window.renderLibraryDashboard;if(typeof old==='function'&&!old.__ai3){const f=function(){old.apply(this,arguments);setTimeout(renderDashboard,20)};f.__ai3=true;window.renderLibraryDashboard=f}
 const oldStats=window.renderStats;if(typeof oldStats==='function'&&!oldStats.__ai3){const f=function(){oldStats.apply(this,arguments);setTimeout(()=>{const d=dna();const box=document.querySelector('#v-stats');if(box&&!document.getElementById('ai-stats')){const p=document.createElement('div');p.id='ai-stats';p.className='ai-panel';p.innerHTML='<div class="ai-title">📊 Inteligência da biblioteca</div><div class="ai-grid"><div class="ai-mini"><b>Média</b><span>★ '+(d.average?d.average.toFixed(2):'—')+'/5</span></div><div class="ai-mini"><b>Avaliadas</b><span>'+d.rated+' de '+works().length+'</span></div><div class="ai-mini"><b>Recomendações vistas</b><span>'+(store().ai.history||[]).length+'</span></div></div>';box.appendChild(p)}} ,20)};f.__ai3=true;window.renderStats=f}
 const obs=new MutationObserver(()=>{attachFeedback();trackRecommendations()});obs.observe(document.body,{childList:true,subtree:true});
 const om=window.openModal;
 if(typeof om==='function'&&!om.__ai3){
   const wrapped=function(id){om.apply(this,arguments);setTimeout(attachFeedback,30);};
   wrapped.__ai3=true;window.openModal=wrapped;
 }
 setTimeout(()=>{renderDashboard();trackRecommendations();attachFeedback()},700);
}
window.OtakuCloud={
 export:()=>window.OtakuStore.export(),
 import:d=>window.OtakuStore.import(d)
};
window.OtakuAI={dna,collections,authorSearch,authorPage,history:()=>store().ai.history||[],feedback:(id,v)=>window.OtakuStore.feedback(id,v),block:id=>window.OtakuStore.feedback(id,'avoid'),historyPanel,attachFeedback};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();