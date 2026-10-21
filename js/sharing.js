(function(){
'use strict';
const model=window.OtakuPublicModel,KEY='otaku-sharing-v1',$=s=>document.querySelector(s),esc=s=>window.OtakuFeatureHelpers.esc(s);
let settings;try{settings={...model.defaults(),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch(e){settings=model.defaults()}
settings.fields={...model.defaults().fields,...settings.fields};settings.hidden=Array.isArray(settings.hidden)?settings.hidden:[];
for(const key of ['statuses','kinds','tags'])if(!Array.isArray(settings[key]))settings[key]=model.defaults()[key];
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(settings))}catch(e){throw Error('Não foi possível guardar as configurações de compartilhamento.')}};
const labels={anime:'Anime',donghua:'Donghua',aeni:'Aeni',manga:'Mangá',manhwa:'Manhwa',manhua:'Manhua',novel:'Novel',webnovel:'WEB Novel',book:'Livros',movie:'Filmes',game:'Jogos',rating:'Nota',prog:'Progresso',added:'Data de adição',updatedAt:'Data da atualização',fav:'Favorito',note:'Anotações e resenhas privadas'};
const checks=(key,values,selected)=>values.map(v=>'<label><input type="checkbox" data-share="'+key+'" value="'+esc(v)+'" '+(selected.includes(v)?'checked':'')+'>'+esc(labels[v]||v)+'</label>').join('');
let preview=null,previewSignature='',link='',busy=false;
function collect(){
 const c={...settings,name:$('#share-name').value,about:$('#share-about').value,favorites:$('#share-favorites').checked,fields:{}};
 for(const key of ['statuses','kinds','tags'])c[key]=[...document.querySelectorAll('[data-share="'+key+'"]:checked')].map(x=>x.value);
 for(const el of document.querySelectorAll('[data-share=field]'))c.fields[el.value]=el.checked;
 return c;
}
function signature(c){return JSON.stringify(c)+'|'+String(typeof libraryRevision!=='undefined'?libraryRevision:0)}
function summary(d){return '<h3>'+esc(d.name||'Biblioteca compartilhada')+'</h3><p>'+esc(d.about)+'</p><p>'+d.items.length+' itens · '+d.items.filter(x=>x.status==='Completo').length+' completos</p><ul>'+d.items.slice(0,20).map(x=>'<li>'+esc(x.title)+' · '+esc(x.status)+(x.rating?' · '+x.rating+'★':'')+(x.note?'<p>'+esc(x.note)+'</p>':'')+'</li>').join('')+'</ul>'+(d.items.length>20?'<p>Mais '+(d.items.length-20)+' itens incluídos.</p>':'');}
async function rpc(action,args,auth=true){
 const cfg=window.OtakuSupabase?.config();if(!cfg?.url||!cfg.key)throw Error('Supabase não configurado.');
 if(window.OtakuPublicConfig&&cfg.url.replace(/\/$/,'')!==window.OtakuPublicConfig.url.replace(/\/$/,''))throw Error('A configuração pública aponta para outro projeto. Atualize js/public-config.js antes de publicar.');
 let session=window.OtakuSupabase.session();
 if(auth){if(!session?.access_token)throw Error('Entre na conta Supabase pelo botão Entrar para publicar. Login legado Google/GitHub não cria uma sessão Supabase.');await window.OtakuSupabase.refresh();session=window.OtakuSupabase.session();if(!session?.access_token)throw Error('Entre novamente para publicar.');if(settings.id&&settings.owner&&session.user?.id!==settings.owner)throw Error('Este link pertence a outra conta. Entre na conta que o publicou para atualizar ou revogar.')}
 const r=await window.OtakuAPI.fetch(cfg.url.replace(/\/$/,'')+'/rest/v1/rpc/'+action,{method:'POST',cache:'no-store',headers:{apikey:cfg.key,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+session.access_token}:{})},body:JSON.stringify(args)});
 const data=await r.json();if(!r.ok)throw Error(r.status===404?'Execute o SQL de configuração de perfis no projeto Supabase antes de publicar.':data.message||'Não foi possível atualizar o perfil.');return data;
}
function controls(){for(const id of ['share-publish','share-revoke'])$('#'+id).disabled=busy}
function invalidate(){preview=null;$('#share-publish').disabled=true;$('#share-preview').textContent='Atualize a prévia antes de publicar.'}
async function publish(){
 if(busy)return;const c=collect();if(!preview||signature(c)!==previewSignature){invalidate();return}
 busy=true;controls();const msg=$('#share-message');msg.textContent='Publicando somente os campos da prévia...';
 try{
  const id=settings.id||crypto.randomUUID();await rpc('publish_otaku_profile',{profile_id:id,document:preview});
  settings={...c,id,owner:window.OtakuSupabase.session()?.user?.id};persist();link=new URL('perfil.html#'+id,location.href).href;
  $('#share-link').value=link;$('#share-open').href=link;$('#share-output').hidden=false;
  if(!window.qrcode)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./js/vendor/qrcode.js';s.onload=resolve;s.onerror=()=>reject(Error('Não foi possível gerar o QR. O link já está disponível.'));document.head.append(s)});
  const qr=window.qrcode(0,'M');qr.addData(link);qr.make();$('#share-qr').innerHTML=qr.createSvgTag({cellSize:4,margin:4,scalable:true});
  msg.textContent='Perfil publicado. Compartilhe o link abaixo. Mudanças futuras só aparecem depois de atualizar a prévia e publicar novamente.';
 }catch(e){msg.textContent=e.message}finally{busy=false;controls()}
}
function panel(){
 const tags=[...new Set(window.OtakuBridge.library().flatMap(x=>x.tags||[]))].sort();
 window.OtakuDialog('<h2>Compartilhar minha biblioteca</h2><p><b>Qualquer pessoa com o link vê o que você liberou.</b> O perfil é somente leitura e separado da sua biblioteca privada.</p><label>Nome de exibição (opcional)<input id="share-name" type="text" maxlength="80" value="'+esc(settings.name)+'"></label><label>Apresentação (opcional)<textarea id="share-about" maxlength="300">'+esc(settings.about)+'</textarea></label><fieldset><legend>Status visíveis</legend>'+checks('statuses',model.statuses,settings.statuses)+'</fieldset><fieldset><legend>Tipos visíveis</legend>'+checks('kinds',model.kinds,settings.kinds)+'</fieldset><fieldset><legend>Listas/etiquetas (nenhuma selecionada = todas)</legend>'+checks('tags',tags,settings.tags)+'</fieldset><label><input id="share-favorites" type="checkbox" '+(settings.favorites?'checked':'')+'>Ocultar tudo exceto favoritos</label><fieldset><legend>Campos visíveis</legend>'+checks('field',Object.keys(labels).filter(k=>['rating','prog','added','updatedAt','fav','note'].includes(k)),Object.keys(settings.fields).filter(k=>settings.fields[k]))+'</fieldset><p>'+settings.hidden.length+' itens ocultos individualmente. Use “Ocultar do perfil público” nos detalhes de uma obra. Alterar a seleção exige publicar novamente para atualizar o link.</p><button class="chip" id="share-restore-hidden">Permitir novamente os itens ocultos</button><div class="feature-tools"><button class="btn" id="share-preview-button">Ver como seus amigos vão ver</button><button class="btn" id="share-publish" disabled>Publicar / atualizar link</button><button class="chip" id="share-revoke" '+(!settings.id?'disabled':'')+'>Revogar link</button></div><div id="share-preview" class="share-preview">Nenhum dado será enviado antes da prévia e da publicação.</div><p id="share-message" role="status"></p><div id="share-output" hidden><label>Link público<input id="share-link" type="text" readonly></label><button class="chip" id="share-copy">Copiar link</button><button class="chip" id="share-native">Compartilhar</button><a class="chip" id="share-open" target="_blank" rel="noopener noreferrer">Abrir perfil</a><div id="share-qr" role="img" aria-label="QR code do perfil público"></div></div><p>Revogar impede novas leituras pelo link, inclusive em outra aba aberta ao atualizar. Não apaga capturas ou cópias que seus amigos já fizeram. Perfis não ficam guardados para uso offline.</p>');
 preview=null;$('#share-preview-button').onclick=()=>{try{const c=collect();preview=model.project(window.OtakuBridge.library(),c);previewSignature=signature(c);$('#share-preview').innerHTML=summary(preview);const frame=document.createElement('iframe');frame.title='Prévia completa do perfil público';frame.src='./perfil.html#preview';frame.onload=()=>{if(preview)frame.contentWindow.postMessage({type:'otaku-profile-preview',document:preview},location.origin)};$('#share-preview').append(frame);$('#share-publish').disabled=false;$('#share-message').textContent='Confira os campos e itens antes de publicar.'}catch(e){$('#share-message').textContent=e.message}};
 $('#share-publish').onclick=publish;
 document.querySelectorAll('#box input:not([readonly]),#box textarea').forEach(el=>el.addEventListener('change',invalidate));
 $('#share-restore-hidden').onclick=()=>{settings.hidden=[];persist();panel()};
 $('#share-revoke').onclick=async()=>{if(!settings.id||busy)return;busy=true;controls();try{await rpc('revoke_otaku_profile',{profile_id:settings.id});settings.id=null;persist();link='';$('#share-output').hidden=true;$('#share-message').textContent='Link revogado. Uma nova publicação criará outro endereço.'}catch(e){$('#share-message').textContent=e.message}finally{busy=false;controls();$('#share-revoke').disabled=!settings.id}};
 $('#share-copy').onclick=async()=>{try{await navigator.clipboard.writeText(link);$('#share-message').textContent='Link copiado.'}catch(e){$('#share-link').select();$('#share-message').textContent='Selecione e copie o link acima.'}};
 $('#share-native').onclick=async()=>{try{if(navigator.share)await navigator.share({title:'Minha Biblioteca Otaku',url:link});else $('#share-copy').click()}catch(e){if(e.name!=='AbortError')$('#share-message').textContent='Não foi possível compartilhar. Copie o link.'}};
 const showLink=()=>{$('#share-open').href=link;$('#share-link').value=link};
 $('#share-output').addEventListener('click',showLink,true);
 if(settings.id){link=new URL('perfil.html#'+settings.id,location.href).href;$('#share-output').hidden=false;showLink()}
}
window.OtakuShare={isHidden:id=>settings.hidden.map(String).includes(String(id)),toggleHidden(id){const key=String(id);settings.hidden=settings.hidden.map(String).includes(key)?settings.hidden.filter(x=>String(x)!==key):[...settings.hidden,key];persist()},panel};
$('#share-library').onclick=panel;
})();
