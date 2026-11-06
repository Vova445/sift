'use client';

import {FormEvent,useState} from 'react';
import {AlertTriangle,Download,FileJson,FileSpreadsheet,Trash2,X} from 'lucide-react';
import {useBodyScrollLock} from './useBodyScrollLock';
import {useAccessibleDialog} from './useAccessibleDialog';
import {createPasswordProof} from '../lib/password-client';

export default function AccountDataControls({email,hasActiveSubscription=false}:{email:string;hasActiveSubscription?:boolean}){
  const[exporting,setExporting]=useState<'json'|'csv'|null>(null),[exportError,setExportError]=useState(''),[open,setOpen]=useState(false),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[deleteBusy,setDeleteBusy]=useState(false),[deleteError,setDeleteError]=useState('');
  const deleteDialogRef=useAccessibleDialog<HTMLElement>(open,()=>{if(!deleteBusy)setOpen(false)});
  useBodyScrollLock(open);
  async function exportData(format:'json'|'csv'){
    setExporting(format);setExportError('');
    try{const response=await fetch(`/api/account/export?format=${format}`,{cache:'no-store'});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'Не вдалося завантажити дані.')}const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`sift-account-export.${format}`;document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}
    catch(error){setExportError(error instanceof Error?error.message:'Помилка експорту. Спробуйте ще раз.')}finally{setExporting(null)}
  }
  async function deleteAccount(event:FormEvent){
    event.preventDefault();setDeleteError('');setDeleteBusy(true);
    try{const proof=await createPasswordProof(email,password,'delete');const response=await fetch('/api/account',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({challengeId:proof.challengeId,proof:proof.proof,upgrade:proof.upgrade,upgradeProof:proof.upgradeProof,confirmation})}),body=await response.json();if(!response.ok)throw new Error(body.error||'Не вдалося видалити акаунт.');location.assign('/');}
    catch(error){setDeleteError(error instanceof Error?error.message:'Не вдалося видалити акаунт. Спробуйте ще раз.')}finally{setDeleteBusy(false)}
  }
  return <>
    <section className="accountDataCard" aria-labelledby="account-data-heading">
      <header><div><small>КОНТРОЛЬ ВАШИХ ДАНИХ</small><h2 id="account-data-heading">Експорт і видалення акаунта</h2><p>Завантажте повну історію звітів і нотатки Planner або видаліть дані з Sift.</p></div><span className="accountDataMark"><Download size={18}/></span></header>
      <div className="accountExportActions"><button type="button" onClick={()=>void exportData('json')} disabled={Boolean(exporting)}><FileJson size={16}/>{exporting==='json'?'Готуємо JSON…':'Завантажити JSON'}</button><button type="button" onClick={()=>void exportData('csv')} disabled={Boolean(exporting)}><FileSpreadsheet size={16}/>{exporting==='csv'?'Готуємо CSV…':'Завантажити CSV'}</button></div>
      {exportError&&<p className="accountDataError" role="alert">{exportError}</p>}
      <div className="accountDeleteRow"><div><b>Видалити акаунт</b><p>Звіти, нотатки, профіль і дані Sift буде стерто. Регулярну підписку скасуємо у WayForPay перед видаленням.</p></div><button type="button" onClick={()=>{setDeleteError('');setPassword('');setConfirmation('');setOpen(true)}}><Trash2 size={15}/> Видалити</button></div>
    </section>
    {open&&<div className="accountDeleteBackdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!deleteBusy)setOpen(false)}}><section className="accountDeleteDialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" tabIndex={-1} ref={deleteDialogRef}><button className="accountDeleteClose" type="button" aria-label="Закрити" onClick={()=>!deleteBusy&&setOpen(false)} disabled={deleteBusy}><X/></button><span className="accountDeleteIcon"><AlertTriangle size={21}/></span><small>НЕЗВОРОТНА ДІЯ</small><h2 id="delete-account-title">Видалити акаунт?</h2><p>Акаунт <b>{email}</b>, усі збережені звіти, нотатки та профільні дані буде видалено з Sift. {hasActiveSubscription?'У вас є активне автопродовження: WayForPay буде попросено скасувати його перед видаленням.':'Якщо до акаунта прив’язане активне автопродовження, його буде скасовано через WayForPay перед видаленням.'} Експортуйте потрібні дані перед продовженням.</p><form onSubmit={deleteAccount}><label htmlFor="delete-account-password">Підтвердіть паролем</label><input id="delete-account-password" type="password" autoComplete="current-password" maxLength={1024} required value={password} onChange={event=>setPassword(event.target.value)} placeholder="Поточний пароль"/><label htmlFor="delete-account-confirm">Введіть ВИДАЛИТИ для підтвердження</label><input id="delete-account-confirm" autoComplete="off" required value={confirmation} onChange={event=>setConfirmation(event.target.value)} placeholder="ВИДАЛИТИ"/><small className="accountDeleteRetention">Після підтвердження видалення з робочої бази відбувається одразу. Провайдер платежів може зберігати власні записи відповідно до своїх правил.</small>{deleteError&&<div className="accountDataError" role="alert">{deleteError}</div>}<button className="accountDeleteConfirm" type="submit" disabled={deleteBusy||confirmation!=='ВИДАЛИТИ'}>{deleteBusy?'Скасовуємо оплату й видаляємо…':'Підтвердити видалення'}</button><button className="accountDeleteCancel" type="button" onClick={()=>setOpen(false)} disabled={deleteBusy}>Залишити акаунт</button></form></section></div>}
  </>;
}
