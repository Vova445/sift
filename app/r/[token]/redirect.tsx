'use client';

import {useEffect} from 'react';
import Link from '../../NativeLink';

const tokenPattern=/^[A-Za-z0-9_-]{43}$/;

export default function ReferralRedirect({token}:{token:string}){
  const valid=tokenPattern.test(token);
  const destination=valid?`/?ref=${encodeURIComponent(token)}`:'/';

  useEffect(()=>{
    window.location.replace(destination);
  },[destination]);

  return <main className="siftReferralRedirect" aria-live="polite">
    <Link className="siftStatusBrand" href="/" aria-label="S SIFT — на головну"><span>S</span>SIFT</Link>
    <section className="siftRedirectMessage">
      <span className="siftRedirectSpinner" aria-hidden="true"/>
      <h1>Перенаправляємо на Sift…</h1>
      <p>Зараз відкриється сторінка, де можна прийняти запрошення.</p>
      <Link href={destination}>Продовжити вручну <span aria-hidden="true">↗</span></Link>
    </section>
  </main>;
}
