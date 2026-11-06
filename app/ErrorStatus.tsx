'use client';

import Link from 'next/link';

export default function ErrorStatus({reset,digest}:{reset?:()=>void;digest?:string}){
  return <main className="siftStatusPage">
    <Link className="siftStatusBrand" href="/" aria-label="S SIFT — на головну"><span>S</span>SIFT</Link>
    <section className="siftStatusCard" aria-labelledby="sift-500-title" role="alert">
      <small className="siftStatusEyebrow">ПОМИЛКА 500</small>
      <h1 id="sift-500-title">Щось пішло не так</h1>
      <p>Не вдалося завантажити сторінку. Спробуйте ще раз або поверніться на головну. Якщо проблема повторюється, напишіть у підтримку.</p>
      <div className="siftStatusActions">
        {reset&&<button className="siftStatusSecondary" type="button" onClick={reset}>Спробувати ще раз</button>}
        <Link className="siftStatusPrimary" href="/">На головну <span aria-hidden="true">↗</span></Link>
        <a className="siftStatusSecondary" href="mailto:support@sift.app?subject=Sift%20%E2%80%94%20%D0%BF%D0%BE%D0%BC%D0%B8%D0%BB%D0%BA%D0%B0%20500">Підтримка</a>
      </div>
      <code className="siftStatusCode">HTTP 500{digest?` · ${digest}`:' · SERVER ERROR'}</code>
    </section>
    <footer className="siftStatusFooter">Sift · Зрозуміло до оплати.</footer>
  </main>;
}
