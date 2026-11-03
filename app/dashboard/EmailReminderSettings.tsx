'use client';

import {useEffect,useState} from 'react';
import {BellRing,MailCheck} from 'lucide-react';

type Preferences={enabled:boolean;configured:boolean;daysBefore:number};

export default function EmailReminderSettings(){
  const[preferences,setPreferences]=useState<Preferences|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{let active=true;fetch('/api/reminders/preferences').then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'Не вдалося завантажити налаштування');if(active)setPreferences(body)}).catch(error=>{if(active)setMessage(error instanceof Error?error.message:'Не вдалося завантажити налаштування')});return()=>{active=false}},[]);
  async function toggle(){
    if(!preferences||busy)return;
    setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/reminders/preferences',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:!preferences.enabled})}),body=await response.json();
      if(!response.ok)throw new Error(body.error||'Не вдалося оновити налаштування');
      setPreferences(body);setMessage(body.enabled?'Email-нагадування ввімкнено.':'Email-нагадування вимкнено.');
    }catch(error){setMessage(error instanceof Error?error.message:'Не вдалося оновити налаштування. Спробуйте ще раз.')}finally{setBusy(false)}
  }
  return <section className="emailReminderSettings" aria-label="Email-нагадування">
    <span className="emailReminderIcon"><BellRing aria-hidden="true"/></span>
    <div className="emailReminderCopy"><b>Email-нагадування</b><p>{preferences?`Лист за ${preferences.daysBefore} ${preferences.daysBefore===1?'день':preferences.daysBefore<5?'дні':'днів'} до дати у Planner.`:'Завантажуємо налаштування…'}{preferences&&!preferences.configured?' Відправник ще не налаштований.':''}</p>{message&&<small role="status">{message}</small>}</div>
    <button type="button" className="emailReminderSwitch" role="switch" aria-checked={preferences?.enabled||false} aria-label="Увімкнути email-нагадування" disabled={!preferences||busy} onClick={()=>void toggle()}>
      {preferences?.enabled?<MailCheck aria-hidden="true"/>:null}<span>{busy?'Зберігаємо…':preferences?.enabled?'Увімкнено':'Вимкнено'}</span>
    </button>
  </section>;
}
