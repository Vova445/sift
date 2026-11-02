'use client';

import {useEffect,useRef,useState} from 'react';

type WidgetApi={render:(container:HTMLElement,options:Record<string,unknown>)=>string;remove:(widgetId:string)=>void};
declare global{interface Window{turnstile?:WidgetApi}}
let scriptLoad:Promise<void>|null=null;

function loadTurnstile(){
  if(window.turnstile)return Promise.resolve();
  if(!scriptLoad){scriptLoad=new Promise((resolve,reject)=>{let script=document.querySelector<HTMLScriptElement>('script[data-sift-turnstile]');if(!script){script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;script.dataset.siftTurnstile='true';document.head.appendChild(script)}script.addEventListener('load',()=>resolve(),{once:true});script.addEventListener('error',()=>reject(new Error('Turnstile не завантажився.')),{once:true});if(window.turnstile)resolve()})}
  return scriptLoad;
}

export default function TurnstileWidget({action,onToken,resetVersion=0}:{action:'signup'|'password_reset';onToken:(token:string)=>void;resetVersion?:number}){
  const container=useRef<HTMLDivElement>(null),tokenCallback=useRef(onToken),[siteKey,setSiteKey]=useState(''),[configReady,setConfigReady]=useState(false),[error,setError]=useState('');
  useEffect(()=>{tokenCallback.current=onToken},[onToken]);
  useEffect(()=>{let alive=true;fetch('/api/security/turnstile',{cache:'no-store'}).then(async response=>await response.json() as {siteKey?:string}).then(config=>{if(alive){setSiteKey(config.siteKey||'');setConfigReady(true)}}).catch(()=>{if(alive){setConfigReady(true);setError('Не вдалося завантажити антибот-перевірку.')}});return()=>{alive=false}},[]);
  useEffect(()=>{if(!configReady||!siteKey)return;let alive=true,widgetId='';loadTurnstile().then(()=>{if(!alive||!container.current||!window.turnstile)return;widgetId=window.turnstile.render(container.current,{sitekey:siteKey,action,theme:'light',callback:(token:string)=>tokenCallback.current(token),'expired-callback':()=>tokenCallback.current(''),'error-callback':()=>{tokenCallback.current('');setError('Перевірка не пройшла. Оновіть її та спробуйте ще раз.')}});setError('')}).catch(()=>{if(alive)setError('Не вдалося завантажити антибот-перевірку.')});return()=>{alive=false;if(widgetId&&window.turnstile)window.turnstile.remove(widgetId)}},[action,configReady,resetVersion,siteKey]);
  const visibleError=error||(configReady&&!siteKey?'Антибот-перевірка тимчасово недоступна.':'');
  return <div className="turnstileField"><div ref={container} className="turnstileMount" aria-label="Антибот-перевірка"/>{visibleError?<small className="turnstileError" role="status">{visibleError}</small>:null}</div>;
}
