'use client';

export default function EmailVerificationNotice({message,onResend,busy}:{message:string;onResend:()=>void;busy:boolean}){
  return <div className="verificationNotice"><b>Email ще не підтверджено</b><p>{message||'Підтвердіть адресу, щоб оплачувати та користуватися платними можливостями.'}</p><button type="button" onClick={onResend} disabled={busy}>{busy?'Надсилаємо…':'Надіслати лист ще раз'}</button></div>;
}
