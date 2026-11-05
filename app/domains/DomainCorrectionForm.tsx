'use client';

import {useState} from 'react';
import Link from 'next/link';
import {ArrowRight,Check,LoaderCircle,Send} from 'lucide-react';

type FieldName='domain'|'contactName'|'contactEmail'|'organization'|'message'|'evidenceUrl'|'ownerAttests';
type FieldErrors=Partial<Record<FieldName,string>>;

function isPublicHttpUrl(value:string){
  try{
    const candidate=/^[a-z][a-z\d+.-]*:\/\//i.test(value)?value:`https://${value}`;
    const url=new URL(candidate);
    return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.hostname.includes('.');
  }catch{return false}
}

export default function DomainCorrectionForm({domain,initialOpen=false}:{domain?:string;initialOpen?:boolean}){
  const [busy,setBusy]=useState(false);
  const [successMessage,setSuccessMessage]=useState('');
  const [error,setError]=useState('');
  const [reply,setReply]=useState('');
  const [fieldErrors,setFieldErrors]=useState<FieldErrors>({});

  function validate(payload:{domain:string;contactName:string;contactEmail:string;organization:string;message:string;evidenceUrl:string;ownerAttests:boolean}){
    const next:FieldErrors={};
    if(!domain&&!isPublicHttpUrl(payload.domain))next.domain='Вкажіть коректний публічний домен.';
    if(payload.contactName.trim().length<2)next.contactName='Вкажіть ім’я щонайменше з 2 символів.';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contactEmail.trim()))next.contactEmail='Вкажіть робочу email-адресу.';
    if(payload.organization.trim().length<2)next.organization='Вкажіть назву організації щонайменше з 2 символів.';
    if(payload.message.trim().length<20)next.message='Додайте щонайменше 20 символів.';
    else if(payload.message.length>3000)next.message='Скоротіть відповідь до 3000 символів.';
    if(payload.evidenceUrl&&!isPublicHttpUrl(payload.evidenceUrl))next.evidenceUrl='Додайте коректне публічне HTTP(S)-посилання.';
    if(!payload.ownerAttests)next.ownerAttests='Підтвердьте свої повноваження.';
    return next;
  }

  function clearFieldError(field:FieldName){
    setFieldErrors(current=>{if(!current[field])return current;const next={...current};delete next[field];return next});
  }

  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy)return;
    setSuccessMessage('');setError('');
    const formElement=event.currentTarget,form=new FormData(formElement);
    const payload={
      domain:domain||String(form.get('domain')||'').trim(),
      contactName:String(form.get('contactName')||'').trim(),
      contactEmail:String(form.get('contactEmail')||'').trim(),
      organization:String(form.get('organization')||'').trim(),
      message:reply,
      evidenceUrl:String(form.get('evidenceUrl')||'').trim(),
      ownerAttests:form.get('ownerAttests')==='on',
    };
    const validation=validate(payload);
    setFieldErrors(validation);
    const firstInvalid=Object.keys(validation)[0] as FieldName|undefined;
    if(firstInvalid){formElement.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();return}
    setBusy(true);
    try{
      const response=await fetch('/api/domain-index/corrections',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const body=await response.json();
      if(!response.ok){
        const message=String(body.error||'Не вдалося надіслати звернення.');
        const serverFields:FieldErrors={};
        if(/домен/i.test(message))serverFields.domain=message;
        else if(/email/i.test(message))serverFields.contactEmail=message;
        else if(/повноваження|представляєте/i.test(message))serverFields.ownerAttests=message;
        else if(/ім’я|організацію|символ/i.test(message)){serverFields.contactName='Перевірте ім’я.';serverFields.organization='Перевірте назву організації.';serverFields.message='Відповідь має містити щонайменше 20 символів.'}
        else if(/посилання/i.test(message))serverFields.evidenceUrl=message;
        if(Object.keys(serverFields).length){setFieldErrors(serverFields);const first=Object.keys(serverFields)[0] as FieldName;formElement.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()}
        else setError(message);
        return;
      }
      formElement.reset();setReply('');setFieldErrors({});
      setSuccessMessage('Звернення на модерації. Публікація не автоматична: команда Sift спочатку перевірить повноваження та надані докази.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Не вдалося надіслати звернення. Спробуйте пізніше.')}
    finally{setBusy(false)}
  }

  const fieldError=(field:FieldName)=>fieldErrors[field]?<small className="domainCorrectionFieldError" id={`correction-${field}-error`} role="alert">{fieldErrors[field]}</small>:null;

  return <details className="domainCorrection" open={initialOpen}>
    <summary><span><Send aria-hidden="true"/>Ви представляєте цей сервіс? Подайте відповідь або виправлення</span><ArrowRight aria-hidden="true"/></summary>
    <form onSubmit={submit} noValidate>
      <p>Звернення перевірить команда Sift. Публікація не відбувається автоматично: відповідь з’явиться на сторінці лише після модерації. Контактні дані зберігаються до 180 днів згідно з <Link href="/privacy">Політикою приватності</Link>.</p>
      <div className="domainCorrectionFields">
        {!domain&&<label className="domainCorrectionWide">Домен сервісу<input name="domain" type="text" autoComplete="url" maxLength={253} required placeholder="example.com" aria-invalid={Boolean(fieldErrors.domain)} aria-describedby={fieldErrors.domain?'correction-domain-error':undefined} onChange={()=>clearFieldError('domain')}/>{fieldError('domain')}</label>}
        <label>Ваше ім’я<input name="contactName" autoComplete="name" maxLength={100} required aria-invalid={Boolean(fieldErrors.contactName)} aria-describedby={fieldErrors.contactName?'correction-contactName-error':undefined} onChange={()=>clearFieldError('contactName')}/>{fieldError('contactName')}</label>
        <label>Робочий email<input name="contactEmail" type="email" autoComplete="email" maxLength={254} required aria-invalid={Boolean(fieldErrors.contactEmail)} aria-describedby={fieldErrors.contactEmail?'correction-contactEmail-error':undefined} onChange={()=>clearFieldError('contactEmail')}/>{fieldError('contactEmail')}</label>
        <label className="domainCorrectionWide">Організація<input name="organization" autoComplete="organization" maxLength={140} required aria-invalid={Boolean(fieldErrors.organization)} aria-describedby={fieldErrors.organization?'correction-organization-error':undefined} onChange={()=>clearFieldError('organization')}/>{fieldError('organization')}</label>
        <label className="domainCorrectionWide">Відповідь або пояснення<textarea name="message" minLength={20} maxLength={3000} rows={5} required placeholder="Опишіть, що варто перевірити, і наведіть конкретні факти…" value={reply} aria-invalid={Boolean(fieldErrors.message)} aria-describedby={`correction-message-help correction-message-count${fieldErrors.message?' correction-message-error':''}`} onChange={event=>{setReply(event.currentTarget.value);clearFieldError('message')}}/>
          <span className="domainCorrectionMessageMeta"><span id="correction-message-help">Від 20 до 3000 символів</span><output id="correction-message-count" aria-live="polite">{reply.length} / 3000</output></span>{fieldError('message')}
        </label>
        <label className="domainCorrectionWide">Посилання на офіційне підтвердження <span className="domainCorrectionOptional">Необов’язково</span><input name="evidenceUrl" type="url" maxLength={500} placeholder="https://example.com/terms" aria-invalid={Boolean(fieldErrors.evidenceUrl)} aria-describedby={fieldErrors.evidenceUrl?'correction-evidenceUrl-error':undefined} onChange={()=>clearFieldError('evidenceUrl')}/>{fieldError('evidenceUrl')}</label>
        <label className="domainCorrectionAttestation"><input type="checkbox" name="ownerAttests" required aria-invalid={Boolean(fieldErrors.ownerAttests)} aria-describedby={fieldErrors.ownerAttests?'correction-ownerAttests-error':undefined} onChange={()=>clearFieldError('ownerAttests')}/><span>Я уповноважений(-а) представляти цю організацію та підтверджую точність поданих відомостей.{fieldError('ownerAttests')}</span></label>
      </div>
      <button type="submit" disabled={busy}>{busy?<LoaderCircle className="domainSpin" aria-hidden="true"/>:<Send aria-hidden="true"/>}{busy?'Надсилаємо…':'Надіслати команді Sift'}<ArrowRight aria-hidden="true"/></button>
      {successMessage&&<p className="domainFormSuccess" role="status"><Check aria-hidden="true"/><span><b>Звернення на модерації</b><br/>{successMessage.replace('Звернення на модерації. ','')}</span></p>}
      {error&&<p className="domainFormError" role="alert">{error}</p>}
    </form>
  </details>;
}
