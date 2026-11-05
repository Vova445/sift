import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowLeft,ArrowRight,ChartNoAxesColumn,Info,ShieldCheck} from 'lucide-react';
import {publicDomainProfiles} from '../../lib/domain-index';
import {pageMetadata} from '../../lib/seo';
import './domain-index.css';

export const dynamic='force-dynamic';
export const metadata:Metadata=pageMetadata('/domains','Індекс прозорості умов сервісів — Sift','Знеособлені підсумки реальних перевірок цін, продовження, скасування та повернень. Методологія відкрита.');

export default async function DomainIndexPage(){
  let profiles:Awaited<ReturnType<typeof publicDomainProfiles>>|null=null;
  try{profiles=await publicDomainProfiles()}catch{/* Distinguish an unavailable index from a valid empty result. */}
  return <main className="domainIndexPage"><header className="domainIndexNav"><Link href="/" className="domainIndexBrand"><span>S</span>SIFT</Link><nav><Link href="/domains/methodology">Методологія</Link><Link href="/">На головну <ArrowLeft aria-hidden="true"/></Link></nav></header>
    <section className="domainIndexHero"><small><ChartNoAxesColumn aria-hidden="true"/> ПУБЛІЧНИЙ ІНДЕКС SIFT</small><h1>Наскільки зрозумілі<br/><em>умови сервісу?</em></h1><p>Зводимо результати перевірок важливих умов: ціни, автопродовження, скасування та повернення. Це оцінка повноти інформації, а не рейтинг чесності чи юридичний висновок.</p><div className="domainIndexHeroActions"><Link href="/domains/methodology">Як рахуються показники <ArrowRight aria-hidden="true"/></Link><Link href="/domains/respond">Форма представника сервісу <ArrowRight aria-hidden="true"/></Link></div></section>
    <section className="domainIndexResults"><header><div><small>ДОМЕНИ З ДОСТАТНІМ ОБСЯГОМ ДАНИХ</small><h2>Індекс доменів</h2></div><span>{profiles===null?'Дані індексу тимчасово недоступні':`${profiles.length} ${profiles.length===1?'публічний профіль':'публічних профілів'}`}</span></header>
      {profiles&&profiles.length>0?<div className="domainIndexGrid">{profiles.map(item=><Link href={`/domains/${encodeURIComponent(item.domain)}`} key={item.domain} className="domainIndexCard"><span><ShieldCheck aria-hidden="true"/><b>{item.clarityScore}<small>/100</small></b></span><strong>{item.domain}</strong><p>Індекс прозорості умов · {item.sampleCount} незалежних акаунтів</p><footer>Дані оновлено {new Date(item.updatedAt).toLocaleDateString('uk-UA')}<ArrowRight aria-hidden="true"/></footer></Link>)}</div>:profiles?<div className="domainIndexEmpty"><span><ChartNoAxesColumn aria-hidden="true"/></span><b>Публічних профілів поки немає</b><p>Профіль з’явиться, коли для домену набереться щонайменше п’ять незалежних перевірок від користувачів, які дали згоду на участь в індексі.</p><Link href="/domains/methodology">Переглянути поріг і методологію <ArrowRight aria-hidden="true"/></Link></div>:<div className="domainIndexUnavailable" role="status"><span><Info aria-hidden="true"/></span><b>Не вдалося завантажити індекс</b><p>Зараз не можемо перевірити, чи є опубліковані профілі. Це не означає, що даних немає.</p><Link href="/domains">Спробувати ще раз <ArrowRight aria-hidden="true"/></Link></div>}
    </section><footer className="domainIndexFooter"><span>Результати є агрегованими сигналами, а не твердженнями про сервіс.</span><Link href="/domains/methodology">Методологія</Link><Link href="/domains/respond">Представникам сервісів</Link><Link href="/privacy">Приватність</Link></footer>
  </main>;
}
