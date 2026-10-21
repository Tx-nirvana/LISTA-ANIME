(function(){
'use strict';
const $=s=>document.querySelector(s),esc=s=>window.OtakuFeatureHelpers.esc(s),model=window.OtakuPublicModel;
const label={anime:'Anime',donghua:'Donghua',aeni:'Aeni',manga:'Mangá',manhwa:'Manhwa',manhua:'Manhua',novel:'Novel',webnovel:'WEB Novel',book:'Livro',movie:'Filme',game:'Jogo'};
const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const identity=x=>norm(x.title).replace(/[^a-z0-9\u3400-\u9fff]/g,'');
function short(x){return x.kind==='movie'?x.rt>0&&x.rt<=100:x.kind==='book'?x.pg>0&&x.pg<=250:x.kind==='game'?x.playtime>0&&x.playtime<=10:['anime','donghua','aeni'].includes(x.kind)?x.eps>0&&x.eps<=13:x.ch>0&&x.ch<=(['novel','webnovel'].includes(x.kind)?100:50)}
function rank(candidates,library,options={},blocked={}){
 const owned=new Set(library.map(x=>String(x.id))),titles=new Set(library.map(identity)),seeds=library.filter(x=>x.rating>=4||x.fav),genres=new Map(),tags=new Map();
 for(const x of seeds){for(const g of x.genres||[])genres.set(norm(g),(genres.get(norm(g))||0)+(x.rating||4));for(const t of x.tags||[])tags.set(norm(t),(tags.get(norm(t))||0)+(x.rating||4))}
 const seen=new Set(),out=[];
 for(const x of candidates){
  const id=String(x.id),key=identity(x);if(!x.title||owned.has(id)||titles.has(key)||blocked[id]||seen.has(key)||options.kind&&x.kind!==options.kind||options.genre&&!(x.genres||[]).some(g=>norm(g)===norm(options.genre))||options.short&&!short(x))continue;
  seen.add(key);let affinity=0;for(const g of x.genres||[])affinity+=genres.get(norm(g))||0;for(const t of [...(x.tags||[]),...(x.genres||[])])affinity+=tags.get(norm(t))||0;
  const seed=seeds.map(s=>({s,common:(s.genres||[]).filter(g=>(x.genres||[]).some(h=>norm(h)===norm(g))).length})).sort((a,b)=>b.common-a.common||b.s.rating-a.s.rating)[0];
  const reason=seed?.common?'Porque você '+(seed.s.rating>=4?'deu '+seed.s.rating+'★ para ':'favoritou ')+seed.s.title+' e ambos têm '+(seed.s.genres||[]).filter(g=>(x.genres||[]).some(h=>norm(h)===norm(g))).slice(0,2).join(' e '):affinity?'Combina com as etiquetas das obras que você mais gosta.':options.different?'Uma opção fora dos gêneros mais frequentes da sua biblioteca.':'Uma descoberta do catálogo. Avalie mais obras para personalizar.';
  const score=(options.different?-affinity:affinity)+Math.min(100,Number(x.avg)||0)/20+(options.surprise?Math.random()*15:0);
  out.push({item:x,score,reason});
 }
 return out.sort((a,b)=>b.score-a.score);
}
let ticket=0,pool=[],poolAt=0;
async function candidates(kind){
 const bridge=window.OtakuBridge;if(Date.now()-poolAt>3600000){pool=[];poolAt=Date.now()}
 const loaded=new Set(pool.map(x=>x.kind));
 const types=kind?[kind]:['anime','manga','webnovel'];
 for(const k of types){if(loaded.has(k))continue;try{const result=await bridge.candidates(k);pool.push(...result)}catch(e){}}
 return [...pool,...bridge.candidatesSeen()];
}
function panel(mode){
 const genres=[...new Set([...window.OtakuBridge.library(),...window.OtakuBridge.candidatesSeen()].flatMap(x=>x.genres||[]))].sort();
 window.OtakuDialog('<h2>'+(mode==='surprise'?'Me surpreenda':'Recomendados para você')+'</h2><p>Seus gostos são comparados localmente. Nenhuma nota, etiqueta ou lista é enviada às APIs de recomendações.</p><label>Tipo <select id="discovery-kind"><option value="">Anime, mangá e WEB Novel</option>'+model.kinds.map(k=>'<option value="'+k+'">'+label[k]+'</option>').join('')+'</select></label><label>Gênero <select id="discovery-genre"><option value="">Todos</option>'+genres.map(g=>'<option>'+esc(g)+'</option>').join('')+'</select></label>'+(mode==='surprise'?'<label><input type="checkbox" id="discovery-short">Algo curto (apenas obras com duração conhecida)</label><label><input type="checkbox" id="discovery-different">Algo diferente do que costumo ver</label>':'')+'<button class="btn" id="discovery-go">Buscar sugestões</button><p id="discovery-message" role="status"></p><div class="grid" id="discovery-results"></div><button id="discovery-more" class="more" hidden>Mais sugestões</button>');
 $('#discovery-go').onclick=async()=>{
  const id=++ticket,message=$('#discovery-message');$('#discovery-go').disabled=true;message.textContent='Carregando candidatos públicos...';
  try{
   const opts={kind:$('#discovery-kind').value,genre:$('#discovery-genre').value,short:!!$('#discovery-short')?.checked,different:!!$('#discovery-different')?.checked,surprise:mode==='surprise'};
   const data=await candidates(opts.kind);if(id!==ticket||!$('#discovery-results'))return;
   const results=rank(data,window.OtakuBridge.library(),opts,window.OtakuStore.get().ai.noRecommend);let at=0;$('#discovery-results').innerHTML='';
   const append=()=>{
    $('#discovery-results').insertAdjacentHTML('beforeend',results.slice(at,at+12).map(({item:x,reason})=>{window.OtakuBridge.remember(x);return '<div class="rec-card-wrap">'+window.OtakuBridge.card(x)+'<p class="recommendation-note">'+esc(reason)+'</p><button class="chip" data-disinterest="'+x.id+'">Não me interessa</button></div>'}).join(''));at+=12;$('#discovery-more').hidden=at>=results.length;
   };append();$('#discovery-more').onclick=append;
   message.textContent=results.length?results.length+' sugestões sem repetir a sua biblioteca.':'Nenhuma novidade com esses filtros. Tente outros tipos/gêneros. Filmes exigem a chave TMDB já usada no site.';
  }catch(e){message.textContent='Não foi possível obter sugestões. Suas preferências continuam salvas.'}finally{if($('#discovery-go'))$('#discovery-go').disabled=false}
 };
 $('#discovery-results').onclick=e=>{
  const no=e.target.closest('[data-disinterest]');if(no){e.stopPropagation();window.OtakuStore.feedback(no.dataset.disinterest,'avoid');no.closest('.rec-card-wrap').remove();return}
  const c=e.target.closest('[data-id],[data-bo5-id]');if(c)window.openModal(Number(c.dataset.id||c.dataset.bo5Id));
 };
 if(mode==='recommended')$('#discovery-go').click();
}
function author(name){
 const bridge=window.OtakuBridge,all=bridge.novels(),parts=s=>norm(s).split(/[,;|]/).map(x=>x.trim());
 const works=all.filter(x=>(x.authors||[]).some(a=>norm(a.name||a)===norm(name))||parts(x.by||x.author||'').includes(norm(name)));
 window.OtakuDialog('<h2>Obras de '+esc(name)+'</h2><p>Obras disponíveis no catálogo de fontes originais. O catálogo pode não incluir toda a bibliografia do autor.</p><div id="novel-author-results" class="grid"></div><p id="novel-author-message" role="status"></p>');
 const host=$('#novel-author-results');for(const x of works)bridge.remember(x);window.OtakuPages.render(host,works,bridge.card);host.onclick=e=>{const c=e.target.closest('[data-id]');if(c)window.openModal(Number(c.dataset.id))};
 if(!works.length){$('#novel-author-message').textContent='Nenhuma outra obra no catálogo local. Buscando a bibliografia disponível...';window.OtakuAI?.authorSearch(name).then(a=>{if(!host.isConnected)return;const list=a.works.map(bridge.fromAniList);list.forEach(bridge.remember);window.OtakuPages.render(host,list,bridge.card);$('#novel-author-message').textContent=list.length+' obras encontradas no AniList.'}).catch(()=>{if(host.isConnected)$('#novel-author-message').textContent='Autor não encontrado nesta fonte. O catálogo local pode estar incompleto.'})}
}
window.OtakuDiscovery={rank,short,author,panel};
$('#rec').onclick=()=>panel('recommended');$('#rnd').onclick=()=>panel('surprise');
// Evita as consultas antigas baseadas em títulos privados nas abas extras.
document.addEventListener('click',e=>{if(e.target.closest('#lf-rec-go,#bo5-rnd-go,#bo5-rec-go')){e.preventDefault();e.stopImmediatePropagation();panel('recommended')}},true);
})();
