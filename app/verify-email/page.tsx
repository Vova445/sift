'use client';

import {useState,useSyncExternalStore} from 'react';
import {ArrowRight,Check,Mail,ScanSearch} from 'lucide-react';
import Link from 'next/link';

const subscribe=(callback:()=>void)=>{window.addEventListener('hashchange',callback);return()=>window.removeEventListener('hashchange',callback)};
const getToken=()=>new URLSearchParams(window.location.hash.slice(1)).get('token')||'';
const getServerToken=()=>'';

export default function VerifyEmailPage(){
  const token=useSyncExternalStore(subscribe,getToken,getServerToken),[state,setState]=useState<'ready'|'working'|'done'|'error'>('ready'),[message,setMessage]=useState('');
  async function verify(){if(!token){setMessage('У посиланні немає токена підтвердження. Увійдіть і надішліть нове.');setState('error');return}setState('working');setMessage('Підтверджуємо адресу…');try{const response=await fetch('/api/auth/verify-email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})}),body=await response.json();if(!response.ok)throw new Error(body.error||'Не вдалося підтвердити email');setMessage(body.message);setState('done')}catch(error){setMessage(error instanceof Error?error.message:'Посилання недійсне або прострочене.');setState('error')}}
  return <main className="verifyPage"><section className="verifyCard"><div className="verifyBrand"><span><ScanSearch size={18}/></span>SIFT</div><small className="verifyEyebrow">ПЕРЕВІРКА АДРЕСИ</small><h1>{state==='done'?'Адресу підтверджено.':'Підтвердіть свій email.'}</h1><p>Це допомагає захистити акаунт. Після підтвердження стануть доступні покупки та платні можливості Sift.</p>{message&&<div className={`verifyStatus ${state==='error'?'error':''}`} role={state==='error'?'alert':'status'}>{state==='done'&&<Check size={15}/>} {message}</div>}{state==='ready'||state==='working'?<button type="button" onClick={()=>void verify()} disabled={state==='working'||!token}><Mail size={15}/>{state==='working'?'Підтверджуємо…':token?'Підтвердити адресу':'Завантажуємо посилання…'} <ArrowRight size={15}/></button>:null}{state==='done'?<Link href="/?login=1">Увійти до Sift <ArrowRight size={15}/></Link>:null}{state==='error'?<Link className="verifySecondary" href="/?login=1">Увійдіть і надішліть нове посилання</Link>:null}</section></main>;
}
