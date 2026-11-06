import type {Metadata} from 'next';
import Link from '../../NativeLink';
import './share.css';

export const metadata:Metadata={title:'Картка недоступна — Sift',robots:{index:false,follow:false},referrer:'no-referrer'};

export default function PublicVerdictNotFound(){
  return <main className="publicVerdictPage publicVerdictMissing">
    <header className="publicVerdictNav"><Link href="/" className="publicVerdictBrand" aria-label="Sift — на головну"><span>S</span>SIFT</Link><small>ПУБЛІЧНА КАРТКА</small></header>
    <section className="publicVerdictMissingCard" aria-labelledby="share-missing-title">
      <span className="publicVerdictMissingMark" aria-hidden="true">×</span>
      <small>ПОСИЛАННЯ НЕДОСТУПНЕ</small>
      <h1 id="share-missing-title">Цю картку не знайдено</h1>
      <p>Власник міг відкликати посилання або воно більше не дійсне. Дані звіту залишаються приватними.</p>
      <Link href="/#top">Перевірити власну покупку <span aria-hidden="true">↗</span></Link>
    </section>
    <footer className="publicVerdictFooter"><span>Оцінка повноти умов, не чесності компанії.</span><Link href="/">На Sift <span aria-hidden="true">↗</span></Link></footer>
  </main>;
}
