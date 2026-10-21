/* Autenticação exclusiva do compartilhamento; não acessa a biblioteca ou sua sessão. */
(function(){
'use strict';
const cfg=window.OtakuPublicConfig,KEY='otaku-profile-session-v1:'+new URL(cfg.url).hostname;
let generation=0,refreshing=null;
function session(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){return null}}
function save(data){
 if(!data?.access_token||!data.refresh_token||!data.user?.id)throw Error('Sessão do perfil inválida.');
 const s={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Number(data.expires_at)||Math.floor(Date.now()/1000)+Number(data.expires_in||3600),user:{id:data.user.id}};
 try{localStorage.setItem(KEY,JSON.stringify(s))}catch(e){throw Error('Permita o armazenamento neste navegador para entrar e gerenciar seus links.')}
 return s;
}
async function request(path,body,token){
 const opt={method:body===undefined?'GET':'POST',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',headers:{apikey:cfg.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}};
 if(body!==undefined)opt.body=JSON.stringify(body);
 const fetcher=window.OtakuAPI?.fetch||fetch;
 const r=await fetcher(cfg.url+'/auth/v1/'+path,opt);if(r.status===204)return null;let data;try{data=await r.json()}catch(e){throw Error('O serviço de contas não respondeu. Tente novamente.')}
 if(!r.ok){const code=data?.error_code||data?.code;const text=r.status===429?'Muitas tentativas. Aguarde antes de tentar novamente.':code==='email_address_not_authorized'?'O envio de confirmação ainda exige configurar o SMTP deste projeto.':code==='invalid_credentials'?'E-mail ou senha incorretos.':code==='email_not_confirmed'?'Confirme seu e-mail antes de entrar.':data?.msg||data?.message||data?.error_description||'Não foi possível entrar.';throw Object.assign(Error(text),{status:r.status})}
 return data;
}
async function refresh(){
 const old=session();if(!old?.access_token)return null;
 if(old.expires_at>Date.now()/1000+60)return old;
 if(refreshing)return refreshing;
 const revision=generation;
 refreshing=(async()=>{try{const data=await request('token?grant_type=refresh_token',{refresh_token:old.refresh_token});if(revision!==generation)return null;return save(data)}catch(e){if(revision===generation&&(e.status===400||e.status===401)){generation++;localStorage.removeItem(KEY)}throw e}finally{refreshing=null}})();
 return refreshing;
}
async function sign(mode,email,password){
 if(!email||!password)throw Error('Informe e-mail e senha para o compartilhamento.');
 const revision=++generation;
 const path=mode==='signup'?'signup?redirect_to='+encodeURIComponent(new URL('conta-perfil.html',location.href).href):'token?grant_type=password';
 const data=await request(path,{email:email.trim(),password});
 if(revision!==generation)return null;
 return data?.access_token?save(data):null;
}
async function logout(){
 const old=session();generation++;localStorage.removeItem(KEY);
 if(old?.access_token)try{await request('logout?scope=local',{},old.access_token)}catch(e){/* A sessão local já foi encerrada. */}
}
window.OtakuProfileAuth={session,refresh,login:(email,password)=>sign('login',email,password),signup:(email,password)=>sign('signup',email,password),logout};
const status=document.querySelector('#profile-auth-result');
if(status){
 const params=new URLSearchParams(location.hash.slice(1));history.replaceState(null,'',location.pathname+location.search);
 (async()=>{try{
  if(params.get('error_description'))throw Error(params.get('error_description'));
  const token=params.get('access_token'),refreshToken=params.get('refresh_token');
  if(!token||!refreshToken)throw Error('Confirmação inválida ou expirada. Volte à biblioteca e tente entrar novamente.');
  const user=await request('user',undefined,token);save({access_token:token,refresh_token:refreshToken,expires_in:Number(params.get('expires_in'))||3600,user});
  status.textContent='E-mail confirmado. Volte à biblioteca e abra Compartilhar minha biblioteca.';
 }catch(e){status.textContent=e.message}})();
}
})();
