import type {Metadata} from 'next';
import Link from './NativeLink';
import './service-status.css';

export const metadata:Metadata={title:'Сторінку не знайдено — Sift',robots:{index:false,follow:false}};

export default function NotFound(){
  return <main className="siftStatusPage">
    <Link className="siftStatusBrand" href="/" aria-label="S SIFT — на головну"><span>S</span>SIFT</Link>
    <section className="siftStatusCard" aria-labelledby="sift-404-title">
      <small className="siftStatusEyebrow">ПОМИЛКА 404</small>
      <h1 id="sift-404-title">Цієї сторінки немає</h1>
      <p>Можливо, адресу змінено або посилання застаріло. Поверніться на головну чи зверніться до підтримки.</p>
      <div className="siftStatusActions">
        <Link className="siftStatusPrimary" href="/">На головну <span aria-hidden="true">↗</span></Link>
        <a className="siftStatusSecondary" href="mailto:support@sift.app?subject=Sift%20%E2%80%94%20%D1%81%D1%82%D0%BE%D1%80%D1%96%D0%BD%D0%BA%D1%83%20%D0%BD%D0%B5%20%D0%B7%D0%BD%D0%B0%D0%B9%D0%B4%D0%B5%D0%BD%D0%BE">Підтримка</a>
      </div>
      <code className="siftStatusCode">HTTP 404 · NOT FOUND</code>
    </section>
    <footer className="siftStatusFooter">Sift · Зрозуміло до оплати.</footer>
  </main>;
}
