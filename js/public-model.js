(function(){
'use strict';
const kinds=['anime','donghua','aeni','manga','manhwa','manhua','novel','webnovel','book','movie','game'];
const statuses=['Quero ver/ler','Em andamento','Completo','Abandonado'];
const text=(v,max=400)=>typeof v==='string'?v.slice(0,max):'';
function url(v){try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&![...u.searchParams.keys()].some(k=>/^(?:access_token|refresh_token|token|api_?key|authorization|signature)$/i.test(k))?u.href:''}catch(e){return ''}}
function status(v){return ['Lido','Assistido','Zerado'].includes(v)?'Completo':statuses.includes(v)?v:'Quero ver/ler'}
function item(v){
 if(!v||typeof v!=='object'||!String(v.id??'').match(/^-?\d{1,16}$/)||!kinds.includes(v.kind)||!text(v.title))throw Error('Item inválido no perfil.');
 const x={id:String(v.id),kind:v.kind,title:text(v.title),status:status(v.status),cover:url(v.cover),syn:text(v.syn,6000),genres:Array.isArray(v.genres)?v.genres.filter(g=>typeof g==='string').slice(0,25).map(g=>text(g,80)):[],links:[]};
 for(const l of (Array.isArray(v.links)?v.links:[]).slice(0,12)){if(url(l?.url))x.links.push({site:text(l.site,80)||'Fonte original',url:url(l.url)})}
 if(Number.isFinite(v.rating)&&v.rating>=0&&v.rating<=5)x.rating=v.rating;
 if(typeof v.prog==='string'||typeof v.prog==='number')x.prog=String(v.prog).slice(0,50);
 if(typeof v.fav==='boolean')x.fav=v.fav;
 for(const k of ['added','updatedAt'])if(Number.isFinite(v[k])&&v[k]>0)x[k]=v[k];
 if(typeof v.note==='string')x.note=text(v.note,6000);
 return x;
}
function validate(v){
 if(!v||v.version!==1||!Array.isArray(v.items)||v.items.length>5000)throw Error('Dados do perfil inválidos ou grandes demais.');
 return {version:1,name:text(v.name,80),about:text(v.about,300),updatedAt:Number(v.updatedAt)||0,items:v.items.map(item)};
}
const defaults=()=>({name:'',about:'',statuses:[...statuses],kinds:[...kinds],tags:[],hidden:[],favorites:false,fields:{rating:true,prog:false,added:false,updatedAt:false,fav:true,note:false},id:null});
function project(library,settings){
 const c={...defaults(),...settings,fields:{...defaults().fields,...settings.fields}},out=[],hidden=new Set(c.hidden.map(String));
 for(const v of library){
  if(!c.kinds.includes(v.kind)||!c.statuses.includes(status(v.status))||hidden.has(String(v.id))||c.favorites&&!v.fav||c.tags.length&&!c.tags.some(t=>(v.tags||[]).includes(t)))continue;
  const raw={id:v.id,kind:v.kind,title:v.title,status:status(v.status),cover:v.cover,syn:v.pt||v.syn||'',genres:v.genres,links:[...(v.links||[])]};
  for(const k of ['url','page'])if(url(v[k]))raw.links.push({site:'Fonte original',url:v[k]});
  for(const [k,show] of Object.entries(c.fields))if(show&&['rating','prog','added','updatedAt','fav','note'].includes(k))raw[k]=v[k];
  out.push(item(raw));
 }
 const d=validate({version:1,name:c.name,about:c.about,updatedAt:Date.now(),items:out});
 if(new TextEncoder().encode(JSON.stringify(d)).length>1900000)throw Error('Perfil grande demais. Selecione menos itens ou oculte sinopses longas.');
 return d;
}
window.OtakuPublicModel={kinds,statuses,defaults,validate,project,url,status};
})();
