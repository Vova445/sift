'use client';

import {FormEvent,useState,useSyncExternalStore} from 'react';
import {ArrowRight,Check,CheckCircle2,CircleAlert,Eye,EyeOff,KeyRound,ScanSearch,ShieldCheck} from 'lucide-react';
import Link from 'next/link';
import TurnstileWidget from '../TurnstileWidget';

const subscribe=(callback:()=>void)=>{window.addEventListener('hashchange',callback);const timer=window.setTimeout(callback,0);return()=>{window.clearTimeout(timer);window.removeEventListener('hashchange',callback)}};
const getToken=()=>new URLSearchParams(window.location.hash.slice(1)).get('token')||'';
const getServerToken=()=>'';

export default function ResetPasswordPage(){
  const token=useSyncExternalStore(subscribe,getToken,getServerToken);
  const[password,setPassword]=useState('');
  const[confirm,setConfirm]=useState('');
  const[showPassword,setShowPassword]=useState(false);
  const[showConfirm,setShowConfirm]=useState(false);
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState('');
  const[linkInvalid,setLinkInvalid]=useState(false);
  const[done,setDone]=useState(false);
  const[turnstileToken,setTurnstileToken]=useState('');
  const[turnstileReset,setTurnstileReset]=useState(0);
  const passwordsMatch=confirm.length>0&&password===confirm;
  const showMatchState=confirm.length>0;

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setMessage('');
    if(!passwordsMatch){setMessage('Паролі не збігаються. Перевірте обидва поля.');return}
    if(password.length<8){setMessage('Пароль має містити щонайменше 8 символів.');return}
    if(!token){setLinkInvalid(true);setMessage('У посиланні немає токена. Запросіть нове посилання.');return}
    setBusy(true);
    try{
      const response=await fetch('/api/auth/password/reset',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({token,password,turnstileToken}),
      });
      const body=await response.json() as {error?:string;message?:string};
      if(!response.ok){
        const error=body.error||'Не вдалося змінити пароль. Спробуйте ще раз.';
        if(response.status===410||response.status===409||(response.status===400&&/посилання/i.test(error))){
          setLinkInvalid(true);
          setMessage('Посилання недійсне, прострочене або вже використане. Запросіть нове.');
        }else{
          throw new Error(error);
        }
        setTurnstileToken('');
        setTurnstileReset(value=>value+1);
        return;
      }
      setDone(true);
      setMessage(body.message||'Пароль змінено. Попередні сесії завершено.');
      window.history.replaceState(null,'',window.location.pathname);
    }catch(cause){
      setMessage(cause instanceof Error?cause.message:'Не вдалося змінити пароль. Спробуйте ще раз.');
      setTurnstileToken('');
      setTurnstileReset(value=>value+1);
    }finally{
      setBusy(false);
    }
  }

  return <main className="verifyPage recoveryPage">
    <section className="verifyCard recoveryCard" aria-labelledby="reset-title">
      <Link className="verifyBrand" href="/" aria-label="Sift — на головну"><span><ScanSearch size={18}/></span>SIFT</Link>
      <small className="verifyEyebrow">ЗАХИСТ АКАУНТА</small>
      <h1 id="reset-title">{done?'Пароль оновлено':'Створіть новий пароль'}</h1>
      <p className="recoveryLead">{done?'Інші активні сесії завершено. Увійдіть із новим паролем.':'Оберіть пароль щонайменше з 8 символів. Після зміни пароля всі інші сесії буде завершено.'}</p>

      {done?<div className="recoveryResult" role="status" aria-live="polite">
        <span className="recoveryResultIcon"><CheckCircle2 size={21}/></span>
        <div><h2>Зміни збережено</h2><p>{message}</p></div>
        <Link className="recoveryPrimaryLink" href="/?login=1">Перейти до входу <ArrowRight size={15}/></Link>
      </div>:!token?<div className="recoveryResult recoveryResultError" role="alert" aria-live="assertive">
        <span className="recoveryResultIcon"><CircleAlert size={20}/></span>
        <div><h2>Посилання не знайдено</h2><p>У посиланні відсутній токен. Запросіть нове посилання для скидання пароля.</p></div>
        <Link className="recoveryPrimaryLink" href="/forgot-password">Запросити нове посилання <ArrowRight size={15}/></Link>
      </div>:linkInvalid?<div className="recoveryResult recoveryResultError" role="alert" aria-live="assertive">
        <span className="recoveryResultIcon"><CircleAlert size={20}/></span>
        <div><h2>Посилання більше не діє</h2><p>{message}</p></div>
        <Link className="recoveryPrimaryLink" href="/forgot-password">Запросити нове посилання <ArrowRight size={15}/></Link>
      </div>:<form className="passwordForm recoveryForm" onSubmit={submit} aria-busy={busy}>
        <label htmlFor="new-password">Новий пароль</label>
        <div className="recoveryPasswordField"><input id="new-password" type={showPassword?'text':'password'} autoComplete="new-password" minLength={8} maxLength={1024} required value={password} onChange={event=>{setPassword(event.target.value);setMessage('')}} placeholder="Мінімум 8 символів" aria-describedby="password-hint"/><button type="button" className="recoveryPasswordToggle" aria-label={showPassword?'Приховати символи':'Показати символи'} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
        <small id="password-hint" className="recoveryHint">Мінімум 8 символів</small>

        <label htmlFor="confirm-password">Повторіть пароль</label>
        <div className="recoveryPasswordField"><input id="confirm-password" type={showConfirm?'text':'password'} autoComplete="new-password" minLength={8} maxLength={1024} required value={confirm} onChange={event=>{setConfirm(event.target.value);setMessage('')}} placeholder="Введіть пароль ще раз" aria-describedby={showMatchState?'password-match':undefined} aria-invalid={showMatchState&&!passwordsMatch}/><button type="button" className="recoveryPasswordToggle" aria-label={showConfirm?'Приховати символи':'Показати символи'} aria-pressed={showConfirm} onClick={()=>setShowConfirm(value=>!value)}>{showConfirm?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
        {showMatchState&&<span id="password-match" className={`recoveryMatch${passwordsMatch?' isMatch':''}`} role="status" aria-live="polite">{passwordsMatch?<Check size={14}/>:<CircleAlert size={14}/>} {passwordsMatch?'Паролі збігаються':'Паролі не збігаються'}</span>}
        <TurnstileWidget action="password_reset" onToken={setTurnstileToken} resetVersion={turnstileReset}/>
        {message&&<div className="verifyStatus error recoveryStatus" role="alert"><CircleAlert size={16}/><span>{message}</span></div>}
        <button type="submit" disabled={busy||!turnstileToken||!passwordsMatch||password.length<8}><KeyRound size={16}/>{busy?'Зберігаємо…':'Змінити пароль'}<ArrowRight size={15}/></button>
      </form>}

      {!done&&token&&!linkInvalid&&<Link className="verifySecondary recoveryBack" href="/?login=1">Повернутися до входу</Link>}
      <footer className="verifySecurity recoverySecurity"><ShieldCheck size={15}/><span>Одноразове посилання діє одну годину. Пароль зберігається як PBKDF2-хеш.</span></footer>
    </section>
  </main>;
}
