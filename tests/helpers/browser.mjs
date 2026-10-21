import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const root=new URL('../../',import.meta.url);
export function browser(options={}){
 const {window:dom}=parseHTML(fs.readFileSync(new URL('index.html',root),'utf8'));
 const document=dom.document,saved=new Map(Object.entries({'otaku-scale':'5',...options.saved})),errors=[],alerts=[],calls=[],tasks=new Map();
 let now=0,seq=0,active=document.body;
 Object.defineProperty(document,'activeElement',{get:()=>active});
 dom.HTMLElement.prototype.focus=function(){active=this};
 dom.HTMLElement.prototype.scrollIntoView=function(){};
 Object.defineProperty(dom.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option[selected]')?.textContent??this.querySelector('option')?.getAttribute('value')??this.querySelector('option')?.textContent??''},set(value){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',(o.getAttribute('value')??o.textContent)===String(value))}});
 const media=(id,title)=>({id,type:'ANIME',format:'TV',countryOfOrigin:'JP',title:{english:title,romaji:title,native:''},coverImage:{large:'https://example.com/cover.jpg'},genres:['Action'],episodes:12,averageScore:80,status:'FINISHED',description:'Synopsis',startDate:{year:2020}});
 const ctx={document,HTMLElement:dom.HTMLElement,HTMLSelectElement:dom.HTMLSelectElement,MutationObserver:dom.MutationObserver,Event:dom.Event,CustomEvent:dom.CustomEvent,DOMParser:class extends dom.DOMParser{parseFromString(text,type){return super.parseFromString(type==='text/html'?'<html><body>'+text+'</body></html>':text,type)}},URL,URLSearchParams,Blob,Response,Request,Headers,AbortController,AbortSignal,TextEncoder,TextDecoder,CompressionStream,DecompressionStream,btoa,atob,console:{log(){},warn(){},error:e=>errors.push(e)},navigator:{clipboard:{writeText:async()=>{}}},location:{origin:'https://example.com',hostname:'example.com',href:'https://example.com/',reload(){}},localStorage:{get length(){return saved.size},key:i=>[...saved.keys()][i]??null,getItem:k=>saved.get(k)??null,setItem(k,v){options.beforeWrite?.(k,v);saved.set(k,String(v))},removeItem:k=>saved.delete(k)},setTimeout(fn,ms=0){const id=++seq;tasks.set(id,{fn,at:now+ms});return id},clearTimeout:id=>tasks.delete(id),setInterval(){return ++seq},clearInterval(){},requestAnimationFrame:fn=>fn(),alert:t=>alerts.push(t),prompt:()=>null,addEventListener:dom.addEventListener.bind(dom),dispatchEvent:dom.dispatchEvent.bind(dom),queueMicrotask,getComputedStyle:()=>({display:'block',visibility:'visible'})};
 ctx.window=ctx;ctx.self=ctx;
 ctx.fetch=async(input,init={})=>{
  const url=String(input);calls.push({url,init});
  const custom=await options.fetch?.(url,init);if(custom)return custom;
  if(url.includes('novels-catalog.json'))return Response.json(JSON.parse(fs.readFileSync(new URL('novels-catalog.json',root),'utf8')));
  if(url==='https://graphql.anilist.co'){
   const q=JSON.parse(init.body).query;
   if(q.includes('staff(search:'))return Response.json({data:{Page:{staff:[]}}});
   if(q.includes('recommendations('))return Response.json({data:{Media:{recommendations:{nodes:[{rating:50,mediaRecommendation:media(456,'Recommendation')}]}}}});
   if(q.includes('externalLinks'))return Response.json({data:{Media:{externalLinks:[],trailer:null,staff:{edges:[]},studios:{edges:[]},siteUrl:'https://anilist.co/anime/123'}}});
   if(q.includes('description(asHtml:false)')&&!q.includes('Page('))return Response.json({data:{Media:{description:'Synopsis'}}});
   return Response.json({data:{Page:{media:[media(123,'Example')],pageInfo:{hasNextPage:false}}}});
  }
  if(url.includes('translate.googleapis'))return Response.json([[['Sinopse traduzida']]]);
  if(url.includes('kitsu.io'))return Response.json({data:[],links:{}});
  if(url.includes('openlibrary.org/search'))return Response.json({docs:[],numFound:0});
  if(url.includes('cheapshark'))return Response.json([]);
  if(url.includes('query.wikidata'))return Response.json({results:{bindings:[]}});
  throw Error('Unexpected fetch: '+url);
 };
 const context=vm.createContext(ctx);
 const run=code=>vm.runInContext(code,context);
 for(const file of ['store','api','sync','app','ai','ui'])run(fs.readFileSync(new URL('js/'+file+'.js',root),'utf8'));
 document.dispatchEvent(new dom.Event('DOMContentLoaded'));
 async function flush(ms=5000){
  const until=now+ms;let count=0;
  for(let idle=0;idle<8;idle++){
   await new Promise(r=>setImmediate(r));
   const next=[...tasks].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];
   if(!next)continue;
   idle=0;const [id,t]=next;tasks.delete(id);now=t.at;
   if(++count>3000)throw Error('Timer loop');
   try{await t.fn()}catch(e){errors.push(e)}
  }
  now=until;
 }
 const click=selector=>document.querySelector(selector).dispatchEvent(new dom.Event('click',{bubbles:true}));
 return {window:ctx,document,saved,errors,alerts,calls,run,flush,click,media};
}
