import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,ArrowRight,Info,ShieldCheck} from 'lucide-react';
import {normalizeDomain} from '../../../lib/domain-index-policy.js';
import {publicDomainProfile} from '../../../lib/domain-index';
import {pageMetadata} from '../../../lib/seo';
import DomainCorrectionForm from '../DomainCorrectionForm';
import '../domain-index.css';

type Params={params:Promise<{domain:string}>};
export const dynamic='force-dynamic';

export async function generateMetadata({params}:Params):Promise<Metadata>{
  const {domain:raw}=await params,domain=normalizeDomain(raw);
  const profile=domain?await publicDomainProfile(domain).catch(()=>null):null;
  if(!profile)return{...pageMetadata('/domains','Профіль домену недоступний — Sift','Для публічного профілю потрібна мінімальна кількість незалежних згоджених перевірок.'),robots:{index:false,follow:false}};
  const title=`${domain}: індекс прозорості умов — Sift`;
  const description=`Агрегований індекс повноти умов Sift для ${domain}, на основі ${profile.sampleCount} незалежних акаунтів. Не є оцінкою чесності чи юридичним висновком.`;
  return{...pageMetadata(`/domains/${encodeURIComponent(domain)}`,title,description),robots:{index:true,follow:true}};
}

export default async function DomainProfilePage({params}:Params){
  const {domain:raw}=await params,domain=normalizeDomain(raw);
  if(!domain)notFound();
  const profile=await publicDomainProfile(domain).catch(()=>null);
  if(!profile)notFound();
  const confidence=profile.confidence==='higher'?'Обсяг вибірки: значний · 30+ акаунтів':profile.confidence==='moderate'?'Обсяг вибірки: середній · 10–29 акаунтів':'Обсяг вибірки: обмежений · 5–9 акаунтів';
  const jsonLd={'@context':'https://schema.org','@type':'WebPage','name':`${domain}: індекс прозорості умов`,'description':`Агреговані сигнали повноти умов для ${domain}.`,'url':`https://sift-app.sift-vova445.workers.dev/domains/${encodeURIComponent(domain)}`,'isPartOf':{'@type':'WebSite','name':'Sift','url':'https://sift-app.sift-vova445.workers.dev'}};
  return <main className="domainIndexPage"><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,'\\u003c')}}/><header className="domainIndexNav"><Link href="/" className="domainIndexBrand"><span>S</span>SIFT</Link><nav><Link href="/domains">Індекс доменів <ArrowRight aria-hidden="true"/></Link><Link href="/">На головну <ArrowLeft aria-hidden="true"/></Link></nav></header>
    <article className="domainProfile"><div className="domainProfileEyebrow"><ShieldCheck aria-hidden="true"/> АГРЕГОВАНІ СИГНАЛИ УМОВ</div><h1>{domain}</h1><p className="domainProfileIntro">Індекс повноти інформації, яку знаходить Sift у сторінках цього домену. Це не оцінка чесності компанії та не рекомендація купувати.</p>
      <section className="domainScoreCard"><div className="domainScoreValue"><b>{profile.clarityScore}</b><small>/100</small><span>ПОВНОТА УМОВ</span></div><div className="domainScoreInfo"><b>{profile.sampleCount} незалежних акаунтів</b><span className={`domainSampleTier ${profile.confidence}`}>{confidence}</span><span>Останнє оновлення: {new Date(profile.updatedAt).toLocaleDateString('uk-UA')}</span><Link href="/domains/methodology">Як читати цей показник <ArrowRight aria-hidden="true"/></Link></div></section>
      <section className="domainSignals"><header><div><small>ЧАСТКА ВНЕСКІВ, ДЕ УМОВУ ЗНАЙДЕНО</small><h2>Сигнали Sift</h2></div><span>За останні 12 місяців</span></header><div>{profile.indicators.map(indicator=><article key={indicator.key}><span>{indicator.label}</span><strong>{indicator.sharePercent}%</strong><div role="meter" aria-label={`${indicator.label}: ${indicator.sharePercent}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={indicator.sharePercent}><i style={{width:`${indicator.sharePercent}%`}}/></div><small>{indicator.accountCount} із {profile.sampleCount} внесків</small></article>)}</div><p className="domainSignalNote"><Info aria-hidden="true"/>Якщо Sift не знайшов умову, це не доводить, що її немає. Вміст сторінок може змінюватися або бути недоступним для автоматичного читання.</p></section>
      {profile.ownerResponse&&<section className="domainOwnerReply"><small>ВІДПОВІДЬ ПРЕДСТАВНИКА · ПЕРЕВІРЕНО КОМАНДОЮ SIFT</small><h2>{profile.ownerResponse.organization}</h2><p>{profile.ownerResponse.response}</p><span>Опубліковано {new Date(profile.ownerResponse.published_at).toLocaleDateString('uk-UA')}</span></section>}
      <section className="domainCaution"><b>Використовуйте як орієнтир</b><p>Індекс відображає агреговані результати автоматичного аналізу, а не юридичну оцінку сервісу. Перед оплатою звірте ключові умови з офіційною сторінкою.</p><Link href="/domains/methodology">Методологія та обмеження <ArrowRight aria-hidden="true"/></Link></section>
      <DomainCorrectionForm domain={domain}/>
    </article><footer className="domainIndexFooter"><span>© AVEIron · автоматична інформація, не юридична порада</span><Link href="/domains">Усі домени</Link><Link href="/privacy">Приватність</Link></footer>
  </main>;
}
