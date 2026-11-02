'use client';

import {FormEvent,useState} from 'react';
import {ArrowRight,Mail,ScanSearch,ShieldCheck} from 'lucide-react';
import Link from 'next/link';
import TurnstileWidget from '../TurnstileWidget';

export default function ForgotPasswordPage(){
  const[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState(''),[turnstileToken,setTurnstileToken]=useState(''),[turnstileReset,setTurnstileReset]=useState(0);
  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');
    try{
      const response=await fetch('/api/auth/password/forgot',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,turnstileToken})}),data=await response.json();
      if(!response.ok)throw new Error(data.error||'Не вдалося обробити запит. Спробуйте пізніше.');
      setSent(true);
    }catch(e){setError(e instanceof Error?e.message:'Не вдалося надіслати запит. Спробуйте пізніше.');setTurnstileToken('');setTurnstileReset(value=>value+1)}finally{setBusy(false)}
  }
  return <main className="verifyPage"><section className="verifyCard"><div className="verifyBrand"><span><ScanSearch size={18}/></span>SIFT</div><small className="verifyEyebrow">ВІДНОВЛЕННЯ ДОСТУПУ</small><h1>Забули пароль?</h1><p>Вкажіть email акаунта. Якщо адреса зареєстрована, надішлемо одноразове посилання для створення нового пароля.</p>{sent?<div className="verifyStatus" role="status">Якщо акаунт із такою адресою існує, ми надішлемо інструкцію зі скидання пароля. Перевірте також папку «Спам».</div>:<form className="passwordForm" onSubmit={submit}><label htmlFor="reset-email">Email</label><input id="reset-email" type="email" autoComplete="email" inputMode="email" maxLength={254} required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com"/><TurnstileWidget action="password_reset" onToken={setTurnstileToken} resetVersion={turnstileReset}/><button type="submit" disabled={busy||!turnstileToken}><Mail size={16}/>{busy?'Надсилаємо…':'Надіслати посилання'}<ArrowRight size={15}/></button>{error&&<div className="verifyStatus error" role="alert">{error}</div>}</form>}<Link className="verifySecondary" href="/?login=1">Повернутися до входу</Link><footer className="verifySecurity"><ShieldCheck size={14}/> Посилання одноразове, діє одну годину та не розкриває, чи існує акаунт.</footer></section></main>;
}
