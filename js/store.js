/* Biblioteca Otaku — Store único */
(function(){
'use strict';
['otaku-reader-progress','otaku-reader-prefs','otaku-reader-online-progress'].forEach(key=>{
 try{localStorage.removeItem(key)}catch(e){}
});
const KEY='otaku-store-v1';
const object=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
let unreadableState=false,originalState=null;
const read=(key,fallback)=>{try{const raw=localStorage.getItem(key);if(key===KEY)originalState=raw;return JSON.parse(raw||'null')??fallback}catch(e){if(key===KEY)unreadableState=true;return fallback}};
const defaults=()=>({version:1,preferences:{recKind:'all',genre:'',mode:'recommended'},ai:{feedback:{},authors:{},history:[],noRecommend:{},recommended:{}},updatedAt:0});
function normalize(raw){
 const base=defaults(),x=object(raw),ai=object(x.ai);
 return {...base,...x,preferences:{...base.preferences,...object(x.preferences)},ai:{...base.ai,...ai,feedback:object(ai.feedback),authors:Object.fromEntries(Object.entries(object(ai.authors)).filter(([,v])=>v&&typeof v==='object'&&!Array.isArray(v))),noRecommend:object(ai.noRecommend),recommended:object(ai.recommended),history:Array.isArray(ai.history)?ai.history.filter(v=>v&&typeof v==='object'):[]}};
}
let state=normalize(read(KEY,null));
function persist(touch=false){
 if(touch)state.updatedAt=Date.now();
 try{if(unreadableState){if(originalState===null)return state;localStorage.setItem(KEY+'-recovery',originalState);unreadableState=false}localStorage.setItem(KEY,JSON.stringify(state))}catch(e){if(typeof notifyStorageFailure==='function')notifyStorageFailure()}
 return state;
}
function patch(fn){fn(state);return persist(true)}
function library(){return Object.values(window.lib||{}).filter(x=>x&&x.id)}
function saveLibrary(){if(typeof window.save==='function')window.save();return persist()}
const stamp=x=>Math.max(0,...['updatedAt','_updatedAt','upd','added','updated','at'].map(k=>Number(x?.[k])||0));
const latest=(a,b)=>{
 const out={...object(a)};
 Object.entries(object(b)).forEach(([k,v])=>{if(!(k in out)||stamp(v)>stamp(out[k]))out[k]=v});
 return out;
};
function itemsOf(d){
 let raw=d.library??d.items??{};
 if(d.scale===10||d.ratingScale===10||String(d.settings?.scale)==='10'){
  raw=JSON.parse(JSON.stringify(raw));Object.values(raw).forEach(x=>{if(x&&x.rating)x.rating=Math.ceil(Math.min(10,Number(x.rating)||0)/2)});
 }
 if(typeof normalizeLibraryItems==='function')return normalizeLibraryItems(raw);
 const values=Array.isArray(raw)?raw:Object.values(object(raw));
 const out={};values.forEach(x=>{if(x&&x.id)out[String(x.id)]=x});return out;
}
function historyOf(a,b,limit){
 const m=new Map();[...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])].forEach(x=>{if(x&&x.id)m.set(String(x.id)+'|'+Number(x.at||0),x)});
 return [...m.values()].sort((x,y)=>(Number(x.at)||0)-(Number(y.at)||0)).slice(-limit);
}
function merge(local,remote){
 if(!remote||typeof remote!=='object'||(!Array.isArray(remote.library)&&!remote.library&&!remote.items))throw new Error('Backup inválido.');
 const l=object(local),r=object(remote),lm=itemsOf(l),rm=itemsOf(r),library={...lm};
 Object.entries(rm).forEach(([id,x])=>{if(!library[id]||stamp(x)>stamp(library[id]))library[id]=x});
 const deleted={...object(l.deleted||l.del)};
 Object.entries(object(r.deleted||r.del)).forEach(([id,t])=>{if(Number.isFinite(Number(t)))deleted[id]=Math.max(Number(deleted[id])||0,Number(t))});
 Object.entries(deleted).forEach(([id,t])=>{if(library[id]&&t>=stamp(library[id]))delete library[id]});
 const remotePrefs=Number(r.storeUpdatedAt||0)>Number(l.storeUpdatedAt||0);
 const first=remotePrefs?l:r,last=remotePrefs?r:l;
 const la=normalize(l).ai,ra=normalize(r).ai;
 const ai={...la,...ra,feedback:{...object(first.ai?.feedback),...object(last.ai?.feedback)},authors:latest(la.authors,ra.authors),noRecommend:{...la.noRecommend,...ra.noRecommend},recommended:latest(la.recommended,ra.recommended),history:historyOf(la.history,ra.history,500)};
 return {...r,...l,version:2,library:Object.values(library),deleted,preferences:{...object(first.preferences),...object(last.preferences)},ai,progress:latest(l.progress,r.progress),history:historyOf(l.history,r.history,100),settings:{...object(r.settings),...object(l.settings)},storeUpdatedAt:Math.max(Number(l.storeUpdatedAt)||0,Number(r.storeUpdatedAt)||0),updatedAt:Math.max(Number(l.updatedAt)||0,Number(r.updatedAt)||0,...Object.values(library).map(stamp),...Object.values(deleted).map(t=>Number(t)||0))};
}
function exportData(){
 const progress=object(read('otaku-progress-v1',{})),history=read('otaku-discovery-history',[]),deleted=typeof dels!=='undefined'?dels:object(read('otaku-del',{}));
 return {version:2,updatedAt:Math.max(Number(state.updatedAt)||0,...library().map(stamp),...Object.values(progress).map(stamp),...Object.values(deleted).map(t=>Number(t)||0)),storeUpdatedAt:Number(state.updatedAt)||0,library:library(),deleted,preferences:state.preferences,ai:state.ai,progress,history:Array.isArray(history)?history:[],settings:{scale:'5',theme:readSetting('theme'),source:readSetting('otaku-source')}};
}
function readSetting(key){try{return localStorage.getItem(key)||''}catch(e){return ''}}
function write(entries,retry=true){
 const before=new Map(),done=[];
 try{Object.keys(entries).forEach(k=>before.set(k,localStorage.getItem(k)));for(const [k,v] of Object.entries(entries)){localStorage.setItem(k,v);done.push(k)}}
 catch(e){for(const k of done.reverse()){try{const old=before.get(k);if(old===null)localStorage.removeItem(k);else localStorage.setItem(k,old)}catch(x){}}if(retry&&typeof localStorage.key==='function'){const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith('otaku-api-cache-v1:'))keys.push(k)}if(keys.length){keys.forEach(k=>localStorage.removeItem(k));return write(entries,false)}}throw e}
}
function importData(data){
 if(typeof libraryReadFailed!=='undefined'&&libraryReadFailed)throw new Error('Os dados locais precisam ser recuperados antes de sincronizar.');
 const d=merge(exportData(),data),out=Object.fromEntries(d.library.map(x=>[String(x.id),x]));
 // Valida tudo antes de tocar na lista atual ou no armazenamento.
 const serialized=JSON.stringify(out);
 try{write({'otaku-lib':serialized,'otaku-del':JSON.stringify(d.deleted),'otaku-progress-v1':JSON.stringify(d.progress),'otaku-discovery-history':JSON.stringify(d.history),'otaku-scale':'5'})}
 catch(e){if(typeof notifyStorageFailure==='function')notifyStorageFailure();throw new Error('Não foi possível salvar a biblioteca neste navegador.')}
 window.lib=out;
 if(typeof dels!=='undefined')dels=d.deleted;
 state=normalize({...state,preferences:d.preferences,ai:d.ai,updatedAt:d.storeUpdatedAt});
 const settings=d.settings||{};
 if(settings.theme)localStorage.setItem('theme',String(settings.theme));
 if(settings.source)localStorage.setItem('otaku-source',String(settings.source));
 persist();
 if(typeof window.refresh==='function')window.refresh();
 document.dispatchEvent?.(new CustomEvent('otaku-data-restored'));
 return d;
}
window.OtakuStore={get:()=>state,patch,persist,library,saveLibrary,merge,write,export:exportData,import:importData,
 setPreference:(k,v)=>patch(s=>s.preferences[k]=v),
 feedback:(id,v)=>patch(s=>{s.ai.feedback[String(id)]=v;if(v==='avoid'||v==='dislike')s.ai.noRecommend[String(id)]=Date.now();else delete s.ai.noRecommend[String(id)]}),
 markRecommended:(x,mode)=>patch(s=>{const id=String(x.id);s.ai.recommended[id]={last:Date.now(),count:(s.ai.recommended[id]?.count||0)+1};s.ai.history.push({id,title:x.title||'',kind:x.kind||'',mode:mode||'recommended',at:Date.now()});s.ai.history=s.ai.history.slice(-500)}),
 isBlocked:id=>!!state.ai.noRecommend[String(id)]||['avoid','dislike'].includes(state.ai.feedback[String(id)])
};
window.addEventListener('beforeunload',()=>persist());
})();
