import Link from 'next/link';
import {ArrowLeft,ArrowRight,ChartNoAxesColumn,Info} from 'lucide-react';
import '../domain-index.css';

export default function DomainProfileNotFound(){
  return <main className="domainIndexPage">
    <header className="domainIndexNav">
      <Link href="/" className="domainIndexBrand"><span>S</span>SIFT</Link>
      <nav><Link href="/domains">Індекс доменів <ArrowRight aria-hidden="true"/></Link><Link href="/">На головну <ArrowLeft aria-hidden="true"/></Link></nav>
    </header>
    <article className="domainMethodology domainProfileNotFound">
      <small>404 · ПРОФІЛЬ НЕ ОПУБЛІКОВАНО</small>
      <h1>Поки недостатньо<br/><em>даних для профілю.</em></h1>
      <p>Публічний профіль з’являється, коли домен набирає щонайменше п’ять незалежних перевірок за останні 12 місяців від різних акаунтів, які дали згоду на участь в індексі.</p>
      <aside><Info aria-hidden="true"/><p>Поки поріг не досягнуто, Sift не показує Score і сигнали. Відсутність профілю означає лише брак агрегованих даних, а не оцінку сервісу.</p></aside>
      <div className="domainProfileNotFoundActions">
        <Link href="/domains"><ChartNoAxesColumn aria-hidden="true"/>Переглянути індекс</Link>
        <Link href="/domains/methodology">Методологія <ArrowRight aria-hidden="true"/></Link>
        <Link href="/domains/respond">Форма представника сервісу <ArrowRight aria-hidden="true"/></Link>
      </div>
    </article>
    <footer className="domainIndexFooter"><span>© AVEIron · агреговані сигнали, не оцінка чесності</span><Link href="/domains/methodology">Методологія</Link><Link href="/privacy">Приватність</Link></footer>
  </main>;
}
