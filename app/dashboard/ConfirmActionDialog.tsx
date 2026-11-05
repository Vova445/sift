'use client';

import {useId} from 'react';
import {AlertTriangle, X} from 'lucide-react';
import {useAccessibleDialog} from '../useAccessibleDialog';
import {useBodyScrollLock} from '../useBodyScrollLock';
import './confirm-action-dialog.css';

type Props={
  open:boolean;
  title:string;
  description:string;
  confirmLabel:string;
  busy?:boolean;
  message?:string;
  onConfirm:()=>void;
  onClose:()=>void;
};

export default function ConfirmActionDialog({open,title,description,confirmLabel,busy=false,message='',onConfirm,onClose}:Props){
  const id=useId();
  const dialogRef=useAccessibleDialog<HTMLElement>(open,()=>{if(!busy)onClose()});
  useBodyScrollLock(open);
  if(!open)return null;
  return <div className="actionConfirmBackdrop" onMouseDown={()=>{if(!busy)onClose()}}>
    <section className="actionConfirmDialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} tabIndex={-1} ref={dialogRef} onMouseDown={event=>event.stopPropagation()}>
      <button type="button" className="actionConfirmClose" aria-label="Закрити" onClick={onClose} disabled={busy}><X aria-hidden="true"/></button>
      <span className="actionConfirmIcon"><AlertTriangle aria-hidden="true"/></span>
      <small>ПОТРІБНЕ ПІДТВЕРДЖЕННЯ</small>
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-description`}>{description}</p>
      {message&&<p className="actionConfirmMessage" role="alert">{message}</p>}
      <div className="actionConfirmButtons">
        <button type="button" className="actionConfirmCancel" onClick={onClose} disabled={busy}>Скасувати</button>
        <button type="button" className="actionConfirmSubmit" onClick={onConfirm} disabled={busy}>{busy?'Виконуємо…':confirmLabel}</button>
      </div>
    </section>
  </div>;
}
