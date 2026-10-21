/* Esta página não carrega o aplicativo, a autenticação nem o armazenamento local. */
(function(){
'use strict';
const $=s=>document.querySelector(s),model=window.OtakuPublicModel,esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const names={anime:'Anime',donghua:'Donghua',aeni:'Aeni',manga:'Mangá',manhwa:'Manhwa',manhua:'Manhua',novel:'Novel',webnovel:'WEB Novel',book:'Livro',movie:'Filme',game:'Jogo'};
let documentData=null,filtered=[],shown=0,loading=false;
const id=location.hash.slice(1),preview=id==='preview';
function message(text){$('#profile-message').textContent=text}
function option(value,label){return '<option value="'+esc(value)+'">'+esc(label)+'</option>'}
function load(data){
 const d=model.validate(data);if(documentData&&documentData.updatedAt===d.updatedAt&&!$('#profile-content').hidden)return;const selected=Object.fromEntries(['kind','status','genre'].map(k=>[k,$('#profile-'+k).value]));documentData=d;$('#profile-name').textContent=d.name||'Biblioteca compartilhada';document.title=(d.name||'Biblioteca')+' · Biblioteca Otaku';$('#profile-about').textContent=d.about;
 $('#profile-updated').textContent=d.updatedAt?'atualizado em '+new Date(d.updatedAt).toLocaleDateString('pt-BR'):'';
 const counts={};for(const x of d.items){counts[x.kind]=(counts[x.kind]||0)+1;counts[x.status]=(counts[x.status]||0)+1}
 $('#profile-summary').innerHTML='<span>'+d.items.length+' itens</span>'+Object.entries(counts).map(([k,v])=>'<span>'+esc(names[k]||k)+': '+v+'</span>').join('');
 $('#profile-kind').innerHTML=option('','Todos os tipos')+[...new Set(d.items.map(x=>x.kind))].map(k=>option(k,names[k])).join('');
 $('#profile-status').innerHTML=option('','Todos os status')+[...new Set(d.items.map(x=>x.status))].map(k=>option(k,k)).join('');
 $('#profile-genre').innerHTML=option('','Todos os gêneros')+[...new Set(d.items.flatMap(x=>x.genres))].sort().map(k=>option(k,k)).join('');
 for(const [key,value] of Object.entries(selected))if([...$('#profile-'+key).options].some(x=>x.value===value))$('#profile-'+key).value=value;
 $('#profile-content').hidden=false;message(d.items.length?(preview?'Prévia privada: nenhum dado foi publicado.':''):'Este perfil está vazio. O dono ainda não liberou itens.');render();
}
function render(){
 if(!documentData)return;const q=$('#profile-search').value.toLocaleLowerCase('pt-BR'),kind=$('#profile-kind').value,status=$('#profile-status').value,g=$('#profile-genre').value,sort=$('#profile-sort').value;
 filtered=documentData.items.filter(x=>(!q||x.title.toLocaleLowerCase('pt-BR').includes(q))&&(!kind||x.kind===kind)&&(!status||x.status===status)&&(!g||x.genres.includes(g)));
 filtered.sort((a,b)=>sort==='rating'?(b.rating||0)-(a.rating||0):sort==='added'?(b.added||0)-(a.added||0):a.title.localeCompare(b.title,'pt-BR'));
 shown=0;$('#profile-grid').innerHTML='';$('#profile-count').textContent=filtered.length+' itens encontrados';append();
}
function append(){
 $('#profile-grid').insertAdjacentHTML('beforeend',filtered.slice(shown,shown+48).map(x=>'<button class="card" data-id="'+x.id+'" aria-label="Detalhes de '+esc(x.title)+'"><img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="'+esc(x.cover||'./icon.svg')+'" alt=""><div class="i"><div class="t">'+esc(x.title)+'</div><div class="m">'+esc(names[x.kind])+' · '+esc(x.status)+'</div><div class="m">'+(x.rating!==undefined?x.rating+'★ ':'')+(x.fav?'♥ Favorito':'')+'</div></div></button>').join(''));
 shown+=48;$('#profile-more').hidden=shown>=filtered.length;
}
$('#profile-grid').onclick=e=>{const b=e.target.closest('[data-id]');if(!b)return;const x=documentData.items.find(x=>x.id===b.dataset.id);if(!x)return;
 $('#public-detail-body').innerHTML='<div class="public-detail-layout"><img referrerpolicy="no-referrer" src="'+esc(x.cover||'./icon.svg')+'" alt="Capa de '+esc(x.title)+'"><div><h2 id="public-detail-title">'+esc(x.title)+'</h2><p>'+esc(x.status)+'</p><p>'+x.genres.map(esc).join(' · ')+'</p><p style="white-space:pre-line">'+esc(x.syn||'Sinopse não disponível.')+'</p>'+(x.rating!==undefined?'<p>Nota do dono: '+x.rating+'/5</p>':'')+(x.prog!==undefined?'<p>Progresso: '+esc(x.prog)+'</p>':'')+(x.fav?'<p>♥ Favorito</p>':'')+(['added','updatedAt'].map(k=>x[k]?'<p>'+(k==='added'?'Adicionado':'Atualizado')+': '+new Date(x[k]).toLocaleDateString('pt-BR')+'</p>':'').join(''))+(x.note?'<h3>Anotações liberadas pelo dono</h3><p style="white-space:pre-line">'+esc(x.note)+'</p>':'')+'<h3>Fontes originais</h3>'+x.links.map(l=>'<a class="chip" href="'+esc(l.url)+'" target="_blank" rel="noopener noreferrer">'+esc(l.site)+'</a>').join(' ')+'</div></div>';
 $('#public-detail').showModal();
};
$('#public-close').onclick=()=>$('#public-detail').close();$('#profile-more').onclick=append;
let timer;$('#profile-search').oninput=()=>{clearTimeout(timer);timer=setTimeout(render,180)};
for(const k of ['kind','status','genre','sort'])$('#profile-'+k).onchange=render;
document.addEventListener('error',e=>{if(e.target.tagName==='IMG'&&!e.target.src.endsWith('/icon.svg'))e.target.src='./icon.svg'},true);
async function fetchProfile(){
 if(loading||preview)return;loading=true;
 try{
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))throw Error('Link inválido. Confira se copiou o endereço completo.');
  const c=window.OtakuPublicConfig,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);let r;
  try{r=await fetch(c.url+'/rest/v1/rpc/read_otaku_profile',{method:'POST',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal,headers:{apikey:c.key,'Content-Type':'application/json'},body:JSON.stringify({profile_id:id})})}finally{clearTimeout(timeout)}
  if(!r.ok)throw Error('Não foi possível consultar o perfil. Tente novamente mais tarde.');const d=await r.json();
  if(!d){documentData=null;$('#profile-content').hidden=true;$('#public-detail').open&&$('#public-detail').close();throw Error('Este link foi revogado ou não existe mais.')}
  load(d);
 }catch(e){documentData=null;$('#profile-content').hidden=true;$('#profile-grid').innerHTML='';$('#public-detail-body').innerHTML='';$('#public-detail').open&&$('#public-detail').close();message(navigator.onLine===false?'Sem internet. Conecte-se para conferir se este perfil continua disponível.':e.name==='AbortError'?'A consulta demorou demais. Recarregue para tentar novamente.':e.message)}finally{loading=false}
}
if(preview){message('Aguardando a prévia…');window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===window.parent&&e.data?.type==='otaku-profile-preview'){try{load(e.data.document)}catch(error){message(error.message)}}})}
else{fetchProfile();setInterval(()=>{if(document.visibilityState!=='hidden')fetchProfile()},60000);window.addEventListener('focus',fetchProfile);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')fetchProfile()});window.addEventListener('online',fetchProfile);window.addEventListener('offline',()=>{$('#profile-content').hidden=true;$('#public-detail').open&&$('#public-detail').close();message('Sem internet. Conecte-se para verificar este perfil. Não guardamos uma cópia pública offline.')})}
})();
