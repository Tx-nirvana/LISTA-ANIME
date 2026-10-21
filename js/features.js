(function(){
'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
function dialog(html){$('#box').innerHTML='<button class="x" aria-label="Fechar" onclick="closeModal()">×</button><div class="feature-panel">'+html+'</div>';$('#modal').classList.add('on')}
window.OtakuDialog=dialog;
const tools=document.createElement('div');tools.className='feature-tools';tools.innerHTML='<button class="chip" id="appearance">Aparência</button><button class="chip" id="share-library">Compartilhar minha biblioteca</button><button class="chip" id="install-app">Instalar app</button><button class="chip" id="keyboard-help">Atalhos</button>';
document.querySelector('main').prepend(tools);
const connection=document.createElement('div');connection.id='connection-status';connection.setAttribute('role','status');connection.setAttribute('aria-live','polite');document.body.prepend(connection);
function online(){connection.hidden=navigator.onLine!==false;connection.textContent='Você está sem internet. Sua biblioteca e as capas guardadas continuam disponíveis; busca e sincronização aguardam conexão.'}
window.addEventListener('online',online);window.addEventListener('offline',online);online();
if('serviceWorker' in navigator){
 const warm=()=>{const urls=[...document.images].filter(img=>img.complete&&img.naturalWidth>0).map(img=>img.currentSrc||img.src).filter(url=>/^https?:/.test(url)).slice(0,60);if(urls.length)navigator.serviceWorker.controller?.postMessage({type:'cache-viewed-covers',urls})};
 navigator.serviceWorker.ready.then(warm).catch(()=>{});navigator.serviceWorker.addEventListener('controllerchange',warm);
}
let installEvent=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e});
window.addEventListener('appinstalled',()=>{$('#install-app').hidden=true;installEvent=null});
$('#install-app').onclick=async()=>{
 if(installEvent){const e=installEvent;installEvent=null;await e.prompt();await e.userChoice}
 else dialog('<h2>Instalar Biblioteca Otaku</h2><p>No Android/Chrome ou Edge, abra o menu do navegador e escolha “Instalar app” ou “Adicionar à tela inicial”. No iPhone/iPad, use Compartilhar → Adicionar à Tela de Início.</p><p>Se a opção ainda não aparecer, visite o site por HTTPS e aguarde o primeiro carregamento. Alguns navegadores não oferecem instalação.</p>');
};
$('#appearance').onclick=()=>{
 const p=window.OtakuAppearance.get();dialog('<h2>Aparência</h2><label>Tema <select id="ui-theme"><option value="dark">Escuro atual</option><option value="light">Claro</option><option value="amoled">AMOLED</option></select></label><label>Visualização <select id="ui-view"><option value="grid">Grade de capas</option><option value="list">Lista compacta</option></select></label><label>Tamanho dos cards <select id="ui-size"><option value="small">Pequeno</option><option value="medium">Médio</option><option value="large">Grande</option></select></label><label>Cor de destaque <input type="color" id="ui-accent" value="'+esc(p.accent)+'"></label><p>Essas escolhas ficam somente neste navegador.</p>');
 for(const k of ['theme','view','size','accent']){const el=$('#ui-'+k);el.value=p[k];el.onchange=()=>window.OtakuAppearance.set({[k]:el.value})}
};
$('#keyboard-help').onclick=()=>dialog('<h2>Atalhos de teclado</h2><p><kbd>/</kbd>: buscar · <kbd>A</kbd>: adicionar a obra aberta · <kbd>F</kbd>: favoritar a obra aberta · <kbd>Esc</kbd>: fechar detalhes.</p><p>Use Tab para navegar e Enter ou Espaço para abrir um card. Atalhos não são acionados enquanto você digita.</p>');
document.addEventListener('keydown',e=>{
 if(e.ctrlKey||e.altKey||e.metaKey||e.target.closest('input,textarea,select,[contenteditable=true]'))return;
 if(e.key==='/'){e.preventDefault();window.OtakuBridge.tab('s');$('#q').focus()}
 if($('#modal').classList.contains('on')&&e.key.toLowerCase()==='a'){$('#add')?.click();e.preventDefault()}
 if($('#modal').classList.contains('on')&&e.key.toLowerCase()==='f'){$('#fav')?.click();e.preventDefault()}
});
// Acrescenta autoria do catálogo e informações de links sem consultar a fonte a cada abertura.
let detailId='';const enhance=()=>{
 if(!$('#modal').classList.contains('on')){detailId='';return}
 const id=window.__openOtakuId,s=window.OtakuBridge?.item(id);if(!s||!$('#box #syn'))return;
 if($('#detail-extra')&&detailId===id)return;detailId=id;
 const extra=document.createElement('div');extra.id='detail-extra';extra.className='feature-message';
 const authors=(s.authors||[]).map(a=>typeof a==='string'?a:a.name).filter(Boolean);
 if(!authors.length&&s.by)authors.push(s.by);
 if(authors.length){const label=document.createElement('p');label.textContent='Outras obras do autor: ';extra.append(label);authors.forEach(name=>{const b=document.createElement('button');b.className='chip';b.textContent=name;b.onclick=()=>window.OtakuDiscovery.author(name);extra.append(b)})}
 if(s.kind==='webnovel'){
 const check=s.linkCheck||{};const p=document.createElement('p');p.textContent=check.status==='broken'?'A fonte informou que este link não existe mais. Tente outra fonte original.':check.status==='ok'?'Link verificado em '+new Date(check.at).toLocaleDateString('pt-BR')+'.':'Link ainda não verificado. Alguns sites bloqueiam verificações automáticas; isso não significa que o link esteja quebrado.';extra.append(p);
 }
 if(window.lib?.[id]){const b=document.createElement('button');b.id='profile-hide-item';b.className='chip';const hidden=window.OtakuShare?.isHidden(id);b.textContent=hidden?'Permitir no perfil público':'Ocultar do perfil público';b.setAttribute('aria-pressed',String(!!hidden));b.onclick=()=>{window.OtakuShare.toggleHidden(id);extra.remove();enhance()};extra.append(b)}
 $('#box #syn').parentElement.append(extra);
};
new MutationObserver(enhance).observe($('#box'),{childList:true,subtree:true});
window.OtakuFeatureHelpers={esc,dialog};
})();
