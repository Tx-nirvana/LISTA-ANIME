/* Correções de navegação por teclado, foco e imagens. */
(function(){
'use strict';
const modal=document.getElementById('modal'),box=document.getElementById('box');
let opener=null,opened=false,pending=false;
const labels={q:'Buscar por título ou autor',sort:'Ordenação do catálogo',lq:'Buscar na minha biblioteca',lstatus:'Filtrar por status',lmin:'Nota mínima',lsort:'Ordenar minha biblioteca',ffmt:'Filtrar por formato',fst:'Situação da obra',fmin:'Nota mínima no catálogo',ffrom:'Ano inicial',fto:'Ano final',mst:'Status na biblioteca',mprog:'Progresso atual',mnote:'Anotações pessoais',mtin:'Nova lista ou etiqueta',ti:'Token do GitHub',tin:'Texto da biblioteca para importar',file:'Arquivo da biblioteca'};
function controls(){
 document.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(el=>{
  if(el.hasAttribute('aria-label')||el.hasAttribute('aria-labelledby')||el.closest('label'))return;
  el.setAttribute('aria-label',labels[el.id]||el.getAttribute('placeholder')||({sort:'Ordenação do catálogo',ls:'Filtrar por status',lo:'Ordenar minha lista',lkd:'Tipo de obra',q:'Buscar no catálogo',lq:'Buscar na minha lista'}[el.className])||'Selecionar filtro');
 });
 document.querySelectorAll('.card,[data-bo5-id],.lib-count,#bo-level').forEach(el=>{el.tabIndex=0;el.setAttribute('role','group');if(el.id==='bo-level'||!el.hasAttribute('aria-label'))el.setAttribute('aria-label',el.querySelector('.t')?.textContent||el.textContent.trim())});
 document.querySelectorAll('.heart').forEach(el=>{const on=el.classList.contains('on');el.setAttribute('aria-pressed',String(on));el.setAttribute('aria-label',on?'Remover dos favoritos':'Favoritar')});
 document.querySelectorAll('#smsg,.msg[id],#ss').forEach(el=>el.setAttribute('aria-live','polite'));
 if(modal.classList.contains('on')){
  box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
  const heading=box.querySelector('h2');if(heading){heading.id='modal-title';box.setAttribute('aria-labelledby',heading.id)}else box.setAttribute('aria-label','Detalhes da biblioteca');
  if(!opened){opened=true;document.body.classList.add('modal-open');document.querySelectorAll('header,main,footer').forEach(el=>el.inert=true)}
  if(!box.contains(document.activeElement))box.querySelector('button,input,select,textarea,a[href]')?.focus();
 }else if(opened){
  opened=false;document.body.classList.remove('modal-open');document.querySelectorAll('header,main,footer').forEach(el=>el.inert=false);
  (opener?.isConnected?opener:document.querySelector('#t-search'))?.focus();
 }
}
function schedule(){if(pending)return;pending=true;queueMicrotask(()=>{pending=false;controls()})}
document.addEventListener('click',e=>{if(!modal.contains(e.target))opener=e.target.closest('button,.card,[data-bo5-id],.lib-count,#bo-level')||document.activeElement},true);
document.addEventListener('keydown',e=>{
 if(modal.classList.contains('on')&&e.key==='Tab'){
  const focusable=[...box.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&!el.hidden&&getComputedStyle(el).display!=='none');
  const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
 }
 if((e.key==='Enter'||e.key===' ')&&!e.target.matches('button,input,select,textarea,a')){
  const card=e.target.closest('.card,[data-bo5-id],.lib-count,#bo-level');if(card){e.preventDefault();card.click()}
 }
});
const placeholder='./icon.svg';
document.addEventListener('error',e=>{const img=e.target;if(img.tagName==='IMG'&&img.getAttribute('src')!==placeholder){img.src=placeholder;if(!img.alt)img.alt='Capa indisponível'}},true);
new MutationObserver(records=>{if(records.some(r=>r.type==='childList'))schedule()}).observe(document.body,{childList:true,subtree:true});
new MutationObserver(schedule).observe(modal,{attributes:true,attributeFilter:['class']});
controls();
})();
