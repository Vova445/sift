'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowRight,ChartNoAxesColumn,Check,LockKeyhole,ShieldCheck,Trash2} from 'lucide-react';
import ConfirmActionDialog from './ConfirmActionDialog';
import './domain-index-consent.css';

type Consent={enabled:boolean;agreedAt:string|null;updatedAt:string|null;contributionCount:number;removedContributions?:number;processedReports?:number};
type Confirmation='revoke'|'delete_contributions'|null;

export default function DomainIndexConsent({emailVerified}:{emailVerified:boolean}){
  const [consent,setConsent]=useState<Consent|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[confirmation,setConfirmation]=useState<Confirmation>(null);
  useEffect(()=>{let active=true;fetch('/api/domain-index/consent',{cache:'no-store'}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'Не вдалося завантажити налаштування');if(active)setConsent(body)}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Не вдалося завантажити налаштування')});return()=>{active=false}},[]);

  async function updateConsent(enabled:boolean){
    if(busy)return;setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/domain-index/consent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled})}),body=await response.json();
      if(!response.ok)throw new Error(body.error||'Не вдалося оновити згоду');
      setConsent(body);setConfirmation(null);
      setNotice(enabled?`Участь увімкнено. Опрацьовано попередніх звітів: ${body.processedReports||0}.`:`Участь відкликано. Видалено внесків: ${body.removedContributions||0}.`);
    }catch(reason){setError(reason instanceof Error?reason.message:'Не вдалося оновити згоду. Спробуйте ще раз.')}
    finally{setBusy(false)}
  }

  async function deleteContributions(){
    if(busy)return;setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/domain-index/consent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'delete_contributions'})}),body=await response.json();
      if(!response.ok)throw new Error(body.error||'Не вдалося видалити внески');
      setConsent(body);setConfirmation(null);setNotice(`Видалено внесків: ${body.removedContributions||0}. Участь залишається ${body.enabled?'увімкненою':'вимкненою'}.`);
    }catch(reason){setError(reason instanceof Error?reason.message:'Не вдалося видалити внески. Спробуйте ще раз.')}
    finally{setBusy(false)}
  }

  async function confirmAction(){if(confirmation==='revoke')await updateConsent(false);else if(confirmation==='delete_contributions')await deleteContributions()}

  return <>
    <section className="domainConsentPanel" aria-labelledby="domain-consent-title">
      <header>
        <span className="domainConsentHeroIcon"><ChartNoAxesColumn aria-hidden="true"/></span>
        <div><small>ДОБРОВІЛЬНА УЧАСТЬ</small><h2 id="domain-consent-title">Допоможіть покращити індекс сервісів</h2></div>
        <b className={consent?.enabled?'domainConsentOn':'domainConsentOff'}>{consent?.enabled?'УЧАСТЬ УВІМКНЕНО':'ВИМКНЕНО ЗА ЗАМОВЧУВАННЯМ'}</b>
      </header>
      <p className="domainConsentIntro">Участь добровільна й вимкнена, доки ви самі її не ввімкнете. Знеособлені сигнали показуються лише в загальному індексі після мінімальної кількості незалежних акаунтів.</p>
      <div className="domainConsentDataGrid">
        <article><span className="domainConsentDataIcon included"><Check aria-hidden="true"/></span><div><b>Що передається</b><ul><li>основний домен перевіреного сервісу;</li><li>Clarity Score і наявність категорій умов;</li><li>дата сигналу та псевдонімний ключ для підрахунку унікальних акаунтів.</li></ul></div></article>
        <article><span className="domainConsentDataIcon excluded"><LockKeyhole aria-hidden="true"/></span><div><b>Що не передається</b><ul><li>email, ім’я або ID акаунта;</li><li>повна адреса сторінки, шлях і параметри URL;</li><li>цитати, текст звіту, листи й дані оплати.</li></ul></div></article>
      </div>
      <p className="domainConsentPrivacyNote">Псевдонімний ключ потрібен лише для дедуплікації внеску одного акаунта. Він не публікується. Агреговану статистику не показуємо, доки її не підтвердили щонайменше {5} незалежних акаунтів.</p>
      {!emailVerified&&<div className="domainConsentBlocked" role="status"><LockKeyhole aria-hidden="true"/><span><b>Участь поки заблокована</b><small>Підтвердіть email, щоб увімкнути внесок. Перегляд правил і видалення попередніх внесків залишаються доступними.</small></span></div>}
      <div className="domainConsentControls">
        <div className="domainConsentToggleRow"><div><b>Дозволити використання знеособлених підсумків</b><small>{consent?`Ваших внесків зараз: ${consent.contributionCount}`:'Завантажуємо стан участі…'}</small></div>
          <button className="domainConsentSwitch" type="button" role="switch" aria-label="Внесок до публічного індексу доменів" aria-checked={consent?.enabled||false} disabled={!consent||busy||!emailVerified} onClick={()=>consent?.enabled?setConfirmation('revoke'):void updateConsent(true)}><span/></button>
        </div>
        <div className="domainConsentActions"><Link href="/domains/methodology">Методологія індексу <ArrowRight aria-hidden="true"/></Link>
          <button type="button" className="domainConsentRevoke" disabled={!consent?.enabled||busy} onClick={()=>setConfirmation('revoke')}><ShieldCheck aria-hidden="true"/>Відкликати участь</button>
          <button type="button" className="domainConsentDelete" disabled={!consent||consent.contributionCount===0||busy} onClick={()=>setConfirmation('delete_contributions')}><Trash2 aria-hidden="true"/>Видалити внески</button>
        </div>
      </div>
      {notice&&<p className="domainConsentNotice" role="status"><Check aria-hidden="true"/>{notice}</p>}
      {error&&<p className="domainConsentError" role="alert">{error}</p>}
    </section>
    <ConfirmActionDialog open={confirmation!==null} title={confirmation==='revoke'?'Відкликати участь в індексі?':'Видалити ваші внески?'} description={confirmation==='revoke'?'Участь вимкнеться, а раніше збережені агреговані внески буде видалено. Нові перевірки не додаватимуться до індексу.':'Наявні внески буде видалено. Якщо участь увімкнена, майбутні перевірки знову можуть створювати внески.'} confirmLabel={confirmation==='revoke'?'Відкликати й видалити':'Видалити внески'} busy={busy} message={error} onConfirm={()=>void confirmAction()} onClose={()=>{if(!busy){setConfirmation(null);setError('')}}}/>
  </>;
}
