'use client';

import {useCallback,useEffect,useState} from 'react';
import {ArrowLeft,Check,ExternalLink,LoaderCircle,LockKeyhole,RefreshCw,ShieldCheck,TriangleAlert,X} from 'lucide-react';
import ConfirmActionDialog from '../ConfirmActionDialog';
import './domain-corrections.css';
import AccessGate from '../AccessGate';

type RequestRow={id:string;domain:string;contact_email:string;contact_name:string;organization:string;message:string;evidence_url:string|null;owner_attested_at:string;created_at:string;expires_at:string};
const formatDate=(value:string,withTime=false)=>new Date(value).toLocaleString('uk-UA',withTime?{dateStyle:'medium',timeStyle:'short'}:{dateStyle:'medium'});

export default function DomainCorrectionsQueue(){
  const [rows,setRows]=useState<RequestRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [accessDenied,setAccessDenied]=useState(false);
  const [notice,setNotice]=useState('');
  const [responses,setResponses]=useState<Record<string,string>>({});
  const [ownerVerified,setOwnerVerified]=useState<Record<string,boolean>>({});
  const [sourceVerified,setSourceVerified]=useState<Record<string,boolean>>({});
  const [rejecting,setRejecting]=useState<RequestRow|null>(null);
  const rejectionBusy=busy===rejecting?.id;

  const load=useCallback(async()=>{
    setLoading(true);setError('');setAccessDenied(false);
    try{
      const response=await fetch('/api/admin/domain-corrections',{cache:'no-store'});
      const body=await response.json() as {error?:string;requests?:RequestRow[]};
      if(response.status===401||response.status===403){setAccessDenied(true);throw new Error(body.error||'У вас немає доступу до черги модерації.');}
      if(!response.ok)throw new Error(body.error||'Не вдалося завантажити чергу.');
      setRows(body.requests||[]);
    }catch(reason){setError(reason instanceof Error?reason.message:'Не вдалося завантажити чергу.');}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{const id=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(id)},[load]);

  if(accessDenied)return <AccessGate variant="restricted"/>;

  async function review(row:RequestRow,action:'publish'|'reject'){
    if(busy)return;
    setBusy(row.id);setError('');setNotice('');
    try{
      const response=await fetch('/api/admin/domain-corrections',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({id:row.id,action,response:responses[row.id]||'',ownerVerified:ownerVerified[row.id]===true,sourceVerified:sourceVerified[row.id]===true,confirmReject:action==='reject'}),
      });
      const body=await response.json() as {error?:string;message?:string};
      if(!response.ok)throw new Error(body.error||'Дію не виконано.');
      setNotice(body.message||'Зміни збережено.');
      setRows(items=>items.filter(item=>item.id!==row.id));
      setRejecting(null);
    }catch(reason){setError(reason instanceof Error?reason.message:'Дію не виконано.');}
    finally{setBusy('');}
  }

  const replyLength=(id:string)=>(responses[id]||'').trim().length;
  return <>
    <main className="domainReviewPage">
      <header className="domainReviewTopbar">
        <a href="/dashboard/support"><ArrowLeft aria-hidden="true"/>Підтримка</a>
        <div><ShieldCheck aria-hidden="true"/><span><small>SUPPORT CONSOLE</small><b>Модерація доменів</b></span></div>
        <button type="button" onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?'domainReviewSpin':''} aria-hidden="true"/>Оновити</button>
      </header>

      <section className="domainReviewIntro">
        <small>ПУБЛІЧНИЙ ІНДЕКС · МОДЕРАЦІЯ</small>
        <h1>Звернення представників</h1>
        <p>Перевірте повноваження заявника та першоджерело окремо. Відповідь публікується як позиція представника й не змінює агрегований показник домену.</p>
        <aside><TriangleAlert aria-hidden="true"/><span>Не підтверджуйте представництво лише за заявою у формі. Перевірте робочий контакт та офіційну сторінку компанії.</span></aside>
      </section>

      {notice&&<p className="domainReviewNotice" role="status"><Check aria-hidden="true"/>{notice}</p>}
      {error&&!accessDenied&&<p className="domainReviewError" role="alert">{error}</p>}
      {accessDenied?<section className="domainReviewState domainReviewAccess" role="alert"><span><LockKeyhole aria-hidden="true"/></span><h2>Доступ обмежено</h2><p>{error}</p><div><a href="/dashboard/support">Повернутися до Support</a><button type="button" onClick={()=>void load()}>Спробувати ще раз</button></div></section>:
      loading?<div className="domainReviewState"><LoaderCircle className="domainReviewSpin" aria-hidden="true"/><b>Завантажуємо чергу…</b></div>:
      error&&!rows.length?<section className="domainReviewState"><span><TriangleAlert aria-hidden="true"/></span><h2>Не вдалося завантажити чергу</h2><p>Перевірте з’єднання та спробуйте ще раз.</p><div><button type="button" onClick={()=>void load()}>Спробувати ще раз</button></div></section>:
      rows.length?<div className="domainReviewList">{rows.map(row=>{
        const responseLength=replyLength(row.id);
        const canPublish=ownerVerified[row.id]===true&&sourceVerified[row.id]===true&&responseLength>=20&&responseLength<=3000&&!busy;
        return <article key={row.id}>
          <header className="domainReviewCardHeader"><div><small>ДОМЕН</small><b>{row.domain}</b></div><span><small>ЗБЕРІГАТИ ДО</small><b>{formatDate(row.expires_at)}</b></span></header>
          <div className="domainReviewMeta"><div><b>{row.organization}</b><span>Контакт: {row.contact_name}</span></div><a href={`mailto:${row.contact_email}`}>{row.contact_email}</a><small>Надіслано {formatDate(row.created_at,true)}</small></div>
          <section className="domainReviewSubmission"><small>ЗВЕРНЕННЯ</small><p>{row.message}</p></section>
          <section className="domainReviewSource"><div><ShieldCheck aria-hidden="true"/><span><b>Офіційне джерело</b><small>{row.evidence_url?'Посилання надане заявником — перевірте його належність компанії.':'Заявник не додав посилання. Знайдіть і звірте офіційне першоджерело окремо.'}</small></span></div>{row.evidence_url&&<a href={row.evidence_url} target="_blank" rel="noopener noreferrer">Відкрити джерело<ExternalLink aria-hidden="true"/></a>}</section>
          <label className="domainReviewReply">Публічна відповідь представника<textarea value={responses[row.id]||''} onChange={event=>setResponses(value=>({...value,[row.id]:event.target.value}))} maxLength={3000} rows={4} placeholder="Відредагуйте відповідь, зберігаючи її зміст і фактичну точність…"/><span className={responseLength<20?'domainReviewCount muted':''}>{responseLength} / 3000 символів · мінімум 20</span></label>
          <fieldset className="domainReviewChecks"><legend>Перевірки перед публікацією</legend>
            <label className="domainReviewCheck"><input type="checkbox" checked={ownerVerified[row.id]===true} onChange={event=>setOwnerVerified(value=>({...value,[row.id]:event.target.checked}))}/><span><b>Повноваження перевірено</b><small>Звірив(-ла) особу й організацію через незалежний робочий канал.</small></span></label>
            <label className="domainReviewCheck"><input type="checkbox" checked={sourceVerified[row.id]===true} onChange={event=>setSourceVerified(value=>({...value,[row.id]:event.target.checked}))}/><span><b>Джерело перевірено</b><small>Перевірив(-ла) офіційність посилання або знайшов(-ла) надійне першоджерело.</small></span></label>
          </fieldset>
          <footer><button type="button" className="domainReviewReject" onClick={()=>{setError('');setRejecting(row)}} disabled={Boolean(busy)}><X aria-hidden="true"/>Відхилити</button><button type="button" className="domainReviewPublish" onClick={()=>void review(row,'publish')} disabled={!canPublish}>{busy===row.id?<LoaderCircle className="domainReviewSpin" aria-hidden="true"/>:<Check aria-hidden="true"/>}Опублікувати відповідь</button></footer>
        </article>;
      })}</div>:<section className="domainReviewState"><span><ShieldCheck aria-hidden="true"/></span><h2>Черга порожня</h2><p>Нові звернення представників доменів з’являться тут після надсилання форми.</p></section>}
    </main>
    <ConfirmActionDialog
      open={Boolean(rejecting)}
      title="Відхилити звернення?"
      description={rejecting?`Звернення від ${rejecting.organization} для ${rejecting.domain} буде відхилене та зникне з черги. Цю дію не можна скасувати.`:''}
      confirmLabel="Так, відхилити"
      busy={Boolean(rejectionBusy)}
      message={rejecting?error:''}
      onClose={()=>setRejecting(null)}
      onConfirm={()=>rejecting&&void review(rejecting,'reject')}
    />
  </>;
}
