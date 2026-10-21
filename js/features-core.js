/* Preferências locais independentes dos dados da biblioteca. */
(function(){
'use strict';
const KEY='otaku-ui-v1',defaults={theme:'dark',accent:'#c9b977',view:'grid',size:'medium'};
let prefs;try{prefs={...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch(e){prefs={...defaults}}
function apply(){
 const root=document.documentElement;
 root.dataset.theme=['dark','light','amoled'].includes(prefs.theme)?prefs.theme:'dark';
 root.dataset.view=prefs.view==='list'?'list':'grid';root.dataset.cardSize=['small','medium','large'].includes(prefs.size)?prefs.size:'medium';
 if(/^#[0-9a-f]{6}$/i.test(prefs.accent)){
  root.style.setProperty('--ac',prefs.accent);
  const rgb=prefs.accent.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),lum=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  root.style.setProperty('--accent-ink',lum>.179?'#020202':'#ffffff');
 }
}
apply();
window.OtakuAppearance={get:()=>({...prefs}),set:p=>{prefs={...prefs,...p};apply();try{localStorage.setItem(KEY,JSON.stringify(prefs))}catch(e){}}};
// Mantém no DOM apenas um lote da biblioteca; cada clique acrescenta mais 60.
window.OtakuPages={render(host,items,card){
 host.nextElementSibling?.matches('[data-library-more]')&&host.nextElementSibling.remove();
 host.innerHTML='';let count=0;const more=document.createElement('button');more.className='more';more.dataset.libraryMore='';
 const append=()=>{host.insertAdjacentHTML('beforeend',items.slice(count,count+60).map(card).join(''));count+=60;more.textContent='Mostrar mais ('+Math.max(0,items.length-count)+' restantes)';more.hidden=count>=items.length};
 more.onclick=append;host.after(more);append();
}};
})();
