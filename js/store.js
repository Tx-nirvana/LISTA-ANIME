/* Biblioteca Otaku — Store único */
(function(){
'use strict';
const KEY='otaku-store-v1';
const defaults=()=>({version:1,preferences:{recKind:'all',genre:'',mode:'recommended'},ai:{feedback:{},authors:{},history:[],noRecommend:{},recommended:{}},updatedAt:Date.now()});
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'null')||defaults()}catch(e){return defaults()}}
let state=read();
function persist(){state.updatedAt=Date.now();try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){};return state}
function patch(fn){fn(state);return persist()}
function library(){return Object.values(window.lib||{}).filter(x=>x&&x.id)}
function saveLibrary(){if(typeof window.save==='function')window.save();return persist()}
function get(){return state}
window.OtakuStore={get,patch,persist,library,saveLibrary,
 setPreference:(k,v)=>patch(s=>s.preferences[k]=v),
 feedback:(id,v)=>patch(s=>{s.ai.feedback[String(id)]=v;if(v==='avoid'||v==='dislike')s.ai.noRecommend[String(id)]=Date.now();else delete s.ai.noRecommend[String(id)]}),
 markRecommended:(x,mode)=>patch(s=>{const id=String(x.id);s.ai.recommended[id]={last:Date.now(),count:(s.ai.recommended[id]?.count||0)+1};s.ai.history.push({id,title:x.title||'',kind:x.kind||'',mode:mode||'recommended',at:Date.now()});s.ai.history=s.ai.history.slice(-500)}),
 isBlocked:id=>{const a=state.ai;return !!a.noRecommend[String(id)]||['avoid','dislike'].includes(a.feedback[String(id)])},
 export:()=>{const lib=window.lib||{};return {version:2,updatedAt:Math.max(Number(state.updatedAt)||0,...Object.values(lib).map(x=>Number(x?.updatedAt||x?.upd||0))),library:Object.values(lib),preferences:state.preferences,ai:state.ai}},
 import:d=>{if(!d)return;try{if(Array.isArray(d.library)){const out={};d.library.forEach(x=>{if(x&&x.id)out[String(x.id)]=x});window.lib=out;localStorage.setItem('otaku-lib',JSON.stringify(out))}if(d.preferences)state.preferences=Object.assign(state.preferences,d.preferences);if(d.ai)state.ai=Object.assign(defaults().ai,d.ai);persist();if(typeof window.refresh==='function')window.refresh()}catch(e){console.error(e)}}
};
window.addEventListener('beforeunload',persist);
})();