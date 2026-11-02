'use client';

import {FormEvent,useState,useSyncExternalStore} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRight,KeyRound,ScanSearch,ShieldCheck} from 'lucide-react';
import Link from 'next/link';
import TurnstileWidget from '../TurnstileWidget';

const subscribe=(callback:()=>void)=>{window.addEventListener('hashchange',callback);return()=>window.removeEventListener('hashchange',callback)};
const getToken=()=>new URLSearchParams(window.location.hash.slice(1)).get('token')||'';
const getServerToken=()=>'';

export default function ResetPasswordPage(){
  const token=useSyncExternalStore(subscribe,getToken,getServerToken),router=useRouter();
  const[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[done,setDone]=useState(false),[turnstileToken,setTurnstileToken]=useState(''),[turnstileReset,setTurnstileReset]=useState(0);
  async function submit(event:FormEvent){
    event.preventDefault();setMessage('');
    if(password!==confirm){setMessage('Паролі не збігаються.');return}
    if(!token){setMessage('У посиланні немає токена. Запросіть нове посилання.');return}
    setBusy(true);
    try{
      const response=await fetch('/api/auth/password/reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,password,turnstileToken})}),body=await response.json();
      if(!response.ok)throw new Error(body.error||'Посилання недійсне або прострочене.');
      setDone(true);setMessage(body.message||'Пароль змінено. Попередні сесії завершено.');window.history.replaceState(null,'',window.location.pathname);window.setTimeout(()=>router.push('/?login=1'),2500);
    }catch(e){setMessage(e instanceof Error?e.message:'Не вдалося змінити пароль. Запросіть нове посилання.');setTurnstileToken('');setTurnstileReset(value=>value+1)}finally{setBusy(false)}
  }
  return <main className="verifyPage"><section className="verifyCard"><div className="verifyBrand"><span><ScanSearch size={18}/></span>SIFT</div><small className="verifyEyebrow">ЗАХИСТ АКАУНТА</small><h1>Створіть новий пароль</h1><p>Оберіть новий пароль щонайменше з 8 символів. Після зміни ми завершуємо всі попередні сесії.</p>{message&&<div className={`verifyStatus ${done?'':'error'}`} role={done?'status':'alert'}>{message}</div>}{!done&&<form className="passwordForm" onSubmit={submit}><label htmlFor="new-password">Новий пароль</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={1024} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Мінімум 8 символів"/><label htmlFor="confirm-password">Повторіть пароль</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={1024} required value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Введіть пароль ще раз"/><TurnstileWidget action="password_reset" onToken={setTurnstileToken} resetVersion={turnstileReset}/><button type="submit" disabled={busy||!token||!turnstileToken}><KeyRound size={16}/>{busy?'Зберігаємо…':'Змінити пароль'}<ArrowRight size={15}/></button></form>}{!token&&!done&&<Link className="verifySecondary" href="/forgot-password">Запросити нове посилання</Link>}<footer className="verifySecurity"><ShieldCheck size={14}/> Посилання одноразове та діє одну годину. Пароль зберігається у вигляді PBKDF2-хешу.</footer></section></main>;
}
