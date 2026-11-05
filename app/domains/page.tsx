import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowLeft,ArrowRight,ChartNoAxesColumn,ShieldCheck} from 'lucide-react';
import {publicDomainProfiles} from '../../lib/domain-index';
import {pageMetadata} from '../../lib/seo';
import './domain-index.css';

export const dynamic='force-dynamic';
export const metadata:Metadata=pageMetadata('/domains','Індекс прозорості умов сервісів — Sift','Знеособлені підсумки реальних перевірок цін, продовження, скасування та повернень. Методологія відкрита.');

export default async function DomainIndexPage(){
  let profiles:Awaited<ReturnType<typeof publicDomainProfiles>>=[];
  try{profiles=await publicDomainProfiles()}catch{/* The rest of the site stays available while the D1 index is unavailable. */}
  return <main className="domainIndexPage"><header className="domainIndexNav"><Link href="/" className="domainIndexBrand"><span>S</span>SIFT</Link><nav><Link href="/domains/methodology">Методологія</Link><Link href="/">На головну <ArrowLeft aria-hidden="true"/></Link></nav></header>
    <section className="domainIndexHero"><small><ChartNoAxesColumn aria-hidden="true"/> ПУБЛІЧНИЙ ІНДЕКС SIFT</small><h1>Наскільки зрозумілі<br/><em>умови сервісу?</em></h1><p>Зводимо результати перевірок важливих умов: ціни, автопродовження, скасування та повернення. Це оцінка повноти інформації, а не рейтинг чесності чи юридичний висновок.</p><Link href="/domains/methodology">Як рахуються показники <ArrowRight aria-hidden="true"/></Link></section>
    <section className="domainIndexResults"><header><div><small>ДОМЕНИ З ДОСТАТНІМ ОБСЯГОМ ДАНИХ</small><h2>Індекс доменів</h2></div><span>{profiles.length} {profiles.length===1?'публічний профіль':'публічних профілів'}</span></header>
      {profiles.length?<div className="domainIndexGrid">{profiles.map(item=><Link href={`/domains/${encodeURIComponent(item.domain)}`} key={item.domain} className="domainIndexCard"><span><ShieldCheck aria-hidden="true"/><b>{item.clarityScore}<small>/100</small></b></span><strong>{item.domain}</strong><p>Індекс прозорості умов · {item.sampleCount} незалежних акаунтів</p><footer>Дані оновлено {new Date(item.updatedAt).toLocaleDateString('uk-UA')}<ArrowRight aria-hidden="true"/></footer></Link>)}</div>:<div className="domainIndexEmpty"><span><ChartNoAxesColumn aria-hidden="true"/></span><b>Публічних профілів поки немає</b><p>Профіль з’явиться, коли для домену набереться щонайменше п’ять незалежних перевірок від користувачів, які дали згоду на участь в індексі.</p><Link href="/domains/methodology">Переглянути методологію <ArrowRight aria-hidden="true"/></Link></div>}
    </section><footer className="domainIndexFooter"><span>Результати є агрегованими сигналами, а не твердженнями про сервіс.</span><Link href="/domains/methodology">Методологія</Link><Link href="/domains/respond">Представникам сервісів</Link><Link href="/privacy">Приватність</Link></footer>
  </main>;
}
