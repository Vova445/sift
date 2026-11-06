'use client';

import {useState,useSyncExternalStore} from 'react';
import {ArrowRight,CheckCircle2,CircleAlert,LoaderCircle,Mail,ScanSearch,ShieldCheck} from 'lucide-react';
import Link from '../NativeLink';

const subscribe=(callback:()=>void)=>{window.addEventListener('hashchange',callback);const timer=window.setTimeout(callback,0);return()=>{window.clearTimeout(timer);window.removeEventListener('hashchange',callback)}};
const getToken=()=>new URLSearchParams(window.location.hash.slice(1)).get('token')||'';
const getServerToken=()=>'';

type VerificationState='ready'|'working'|'done'|'error';

export default function VerifyEmailPage(){
  const token=useSyncExternalStore(subscribe,getToken,getServerToken);
  const[state,setState]=useState<VerificationState>('ready');
  const[message,setMessage]=useState('');
  const hasToken=Boolean(token);
  const missingToken=!hasToken&&state==='ready';

  async function verify(){
    if(!token){
      setMessage('У посиланні немає токена підтвердження. Увійдіть і надішліть новий лист.');
      setState('error');
      return;
    }
    setState('working');
    setMessage('Перевіряємо одноразове посилання…');
    try{
      const response=await fetch('/api/auth/verify-email',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({token}),
      });
      const body=await response.json() as {message?:string;error?:string};
      if(!response.ok)throw new Error(body.error||'Не вдалося підтвердити email. Увійдіть і надішліть новий лист.');
      setMessage(body.message||'Email підтверджено. Тепер доступні платні можливості Sift.');
      setState('done');
    }catch(cause){
      setMessage(cause instanceof Error?cause.message:'Посилання недійсне або прострочене. Увійдіть і надішліть новий лист.');
      setState('error');
    }
  }

  const isError=state==='error'||missingToken;
  const isDone=state==='done';

  return <main className="verifyPage recoveryPage">
    <section className="verifyCard recoveryCard" aria-labelledby="verify-title">
      <Link className="verifyBrand" href="/" aria-label="Sift — на головну"><span><ScanSearch size={18}/></span>SIFT</Link>
      <div className={`recoveryStateIcon${isDone?' isSuccess':isError?' isError':''}`} aria-hidden="true">{isDone?<CheckCircle2 size={24}/>:isError?<CircleAlert size={24}/>:state==='working'?<LoaderCircle className="recoverySpinner" size={24}/>:<Mail size={23}/>}</div>
      <small className="verifyEyebrow">ПЕРЕВІРКА АДРЕСИ</small>
      <h1 id="verify-title">{isDone?'Email підтверджено':isError?'Посилання не діє':'Підтвердіть свій email'}</h1>
      <p className="recoveryLead">{isDone?'Акаунт захищений підтвердженою адресою. Можете повернутися до Sift.':isError?'Посилання може бути простроченим, уже використаним або неповним. Увійдіть до акаунта й запросіть новий лист.':'Підтвердьте адресу, щоб захистити акаунт і відкрити платні можливості Sift.'}</p>

      {message&&<div className={`verifyStatus recoveryStatus${isError?' error':''}`} role={isError?'alert':'status'} aria-live={isError?'assertive':'polite'}>{message}</div>}
      {state==='ready'&&hasToken&&<button className="recoveryMainAction" type="button" onClick={()=>void verify()}><Mail size={16}/>Підтвердити email<ArrowRight size={15}/></button>}
      {state==='working'&&<div className="recoveryWorking" role="status" aria-live="polite" aria-busy="true"><LoaderCircle className="recoverySpinner" size={16}/>Підтверджуємо адресу…</div>}
      {isDone&&<Link className="recoveryPrimaryLink" href="/?login=1">Перейти до входу <ArrowRight size={15}/></Link>}
      {isError&&<Link className="recoveryPrimaryLink" href="/?login=1">Увійти й надіслати новий лист <ArrowRight size={15}/></Link>}

      <footer className="verifySecurity recoverySecurity"><ShieldCheck size={15}/><span>Посилання одноразове. Якщо ви не створювали акаунт Sift, просто закрийте цю сторінку.</span></footer>
    </section>
  </main>;
}
