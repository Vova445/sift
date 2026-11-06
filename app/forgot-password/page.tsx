'use client';

import {FormEvent,useState} from 'react';
import {ArrowRight,Check,CircleAlert,Clock3,Mail,ScanSearch,ShieldCheck} from 'lucide-react';
import Link from '../NativeLink';
import TurnstileWidget from '../TurnstileWidget';

export default function ForgotPasswordPage(){
  const[email,setEmail]=useState('');
  const[busy,setBusy]=useState(false);
  const[sent,setSent]=useState(false);
  const[error,setError]=useState('');
  const[turnstileToken,setTurnstileToken]=useState('');
  const[turnstileReset,setTurnstileReset]=useState(0);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setBusy(true);
    setError('');
    try{
      const response=await fetch('/api/auth/password/forgot',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({email,turnstileToken}),
      });
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error||'Не вдалося обробити запит. Спробуйте пізніше.');
      setSent(true);
    }catch(cause){
      setError(cause instanceof Error?cause.message:'Не вдалося надіслати запит. Спробуйте пізніше.');
      setTurnstileToken('');
      setTurnstileReset(value=>value+1);
    }finally{
      setBusy(false);
    }
  }

  function requestAnother(){
    setSent(false);
    setError('');
    setTurnstileToken('');
    setTurnstileReset(value=>value+1);
  }

  return <main className="verifyPage recoveryPage">
    <section className="verifyCard recoveryCard" aria-labelledby="forgot-title">
      <Link className="verifyBrand" href="/" aria-label="Sift — на головну"><span><ScanSearch size={18}/></span>SIFT</Link>
      <small className="verifyEyebrow">ВІДНОВЛЕННЯ ДОСТУПУ</small>
      <h1 id="forgot-title">Забули пароль?</h1>
      <p className="recoveryLead">Вкажіть email акаунта, і ми надішлемо одноразове посилання для створення нового пароля.</p>

      {sent?<div className="recoveryResult" role="status" aria-live="polite">
        <span className="recoveryResultIcon"><Check size={20}/></span>
        <div><h2>Перевірте пошту</h2><p>Якщо акаунт із такою адресою існує, ми надішлемо інструкцію. Перевірте також папку «Спам».</p></div>
        <button type="button" className="recoveryResend" onClick={requestAnother}>Надіслати запит ще раз <ArrowRight size={15}/></button>
      </div>:<form className="passwordForm recoveryForm" onSubmit={submit} aria-busy={busy}>
        <label htmlFor="reset-email">Email</label>
        <input id="reset-email" type="email" autoComplete="email" inputMode="email" maxLength={254} required value={email} onChange={event=>setEmail(event.target.value)} placeholder="you@email.com" aria-invalid={Boolean(error)} aria-describedby={error?'forgot-error':undefined}/>
        <TurnstileWidget action="password_reset" onToken={setTurnstileToken} resetVersion={turnstileReset}/>
        {error&&<div id="forgot-error" className="verifyStatus error recoveryStatus" role="alert"><CircleAlert size={16}/><span>{error}</span></div>}
        <button type="submit" disabled={busy||!turnstileToken}><Mail size={16}/>{busy?'Надсилаємо…':'Надіслати посилання'}<ArrowRight size={15}/></button>
      </form>}

      <Link className="verifySecondary recoveryBack" href="/?login=1">Повернутися до входу</Link>
      <footer className="verifySecurity recoverySecurity"><ShieldCheck size={15}/><span><b><Clock3 size={13}/> Посилання діє одну годину</b> · одноразове; відповідь не розкриває, чи існує акаунт.</span></footer>
    </section>
  </main>;
}
