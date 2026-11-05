'use client';

import {useState} from 'react';
import Link from 'next/link';
import {ArrowRight,Check,LoaderCircle,Send} from 'lucide-react';

export default function DomainCorrectionForm({domain,initialOpen=false}:{domain?:string;initialOpen?:boolean}){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);setMessage('');setError('');
    const formElement=event.currentTarget,form=new FormData(formElement);
    const payload={domain:domain||String(form.get('domain')||''),contactName:String(form.get('contactName')||''),contactEmail:String(form.get('contactEmail')||''),organization:String(form.get('organization')||''),message:String(form.get('message')||''),evidenceUrl:String(form.get('evidenceUrl')||''),ownerAttests:form.get('ownerAttests')==='on'};
    try{
      const response=await fetch('/api/domain-index/corrections',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),body=await response.json();
      if(!response.ok)throw new Error(body.error||'Не вдалося надіслати звернення.');
      formElement.reset();setMessage(body.message||'Звернення отримано.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Не вдалося надіслати звернення. Спробуйте пізніше.')}finally{setBusy(false)}
  }
  return <details className="domainCorrection" open={initialOpen}><summary><span><Send aria-hidden="true"/>Ви представляєте цей сервіс? Подайте відповідь або виправлення</span><ArrowRight aria-hidden="true"/></summary>
    <form onSubmit={submit}>
      <p>Звернення перевірить команда Sift. Текст не з’явиться публічно до модерації; на сторінці можуть опублікувати лише перевірену відповідь представника. Контактні дані зберігаються до 180 днів згідно з <Link href="/privacy">Політикою приватності</Link>.</p>
      <div className="domainCorrectionFields">{!domain&&<label className="domainCorrectionWide">Домен сервісу<input name="domain" type="text" autoComplete="url" maxLength={253} required placeholder="example.com"/></label>}<label>Ваше ім’я<input name="contactName" autoComplete="name" maxLength={100} required/></label><label>Робочий email<input name="contactEmail" type="email" autoComplete="email" maxLength={254} required/></label><label className="domainCorrectionWide">Організація<input name="organization" autoComplete="organization" maxLength={140} required/></label><label className="domainCorrectionWide">Пояснення або відповідь<textarea name="message" minLength={20} maxLength={3000} rows={5} required placeholder="Опишіть, що варто перевірити, та наведіть конкретні факти…"/></label><label className="domainCorrectionWide">Посилання на офіційне підтвердження (необов’язково)<input name="evidenceUrl" type="url" maxLength={500} placeholder="https://example.com/terms"/></label><label className="domainCorrectionAttestation"><input type="checkbox" name="ownerAttests" required/><span>Я уповноважений(-а) представляти цю організацію та підтверджую точність поданих відомостей.</span></label></div>
      <button disabled={busy}>{busy?<LoaderCircle className="domainSpin"/>:<Send aria-hidden="true"/>}{busy?'Надсилаємо…':'Надіслати команді Sift'}</button>
      {message&&<p className="domainFormSuccess" role="status"><Check aria-hidden="true"/>{message}</p>}{error&&<p className="domainFormError" role="alert">{error}</p>}
    </form>
  </details>;
}
