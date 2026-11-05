import type {Metadata} from 'next';
import {ArrowRight,ArrowUpRight,CreditCard,FileText,ShieldCheck} from 'lucide-react';
import {pageMetadata} from '../../../lib/seo';
import '../legal-index.css';

/* eslint @next/next/no-html-link-for-pages: "off" */

export const metadata:Metadata=pageMetadata('/legal','Правові документи — Sift','Політика приватності, умови користування та правила оплати й повернення Sift.');

const documents=[
  {href:'/privacy',number:'01',title:'Приватність',description:'Які дані використовує Sift, як їх захищає та з ким ділиться.',icon:ShieldCheck},
  {href:'/terms',number:'02',title:'Умови користування',description:'Як працюють акаунт, тарифи та автоматичний аналіз сторінок.',icon:FileText},
  {href:'/refund',number:'03',title:'Оплата та повернення',description:'Як скасувати підписку, перевірити платіж і попросити повернення.',icon:CreditCard},
];

export default function LegalIndexPage(){
  return <main className="legalDocument legalIndex">
    <div className="legalHero"><span className="legalEyebrow"><i/> ДОКУМЕНТИ · SIFT</span><h1>Усе важливе —<br/>в одному місці.</h1><p>Оберіть документ, який хочете переглянути. На кожній сторінці є повернення до цього списку та на головну.</p></div>
    <nav className="legalIndexGrid" aria-label="Правові документи Sift">{documents.map(document=>{const Icon=document.icon;return <a className="legalIndexCard" href={document.href} target="_top" key={document.href}><div className="legalIndexCardTop"><span className="legalIndexIcon"><Icon aria-hidden="true"/></span><small>{document.number} · ДОКУМЕНТ</small><ArrowUpRight className="legalIndexArrow" aria-hidden="true"/></div><div className="legalIndexCardCopy"><h2>{document.title}</h2><p>{document.description}</p></div><b className="legalIndexCardAction">Читати документ <ArrowRight aria-hidden="true"/></b></a>})}</nav>
    <a className="legalIndexHome" href="/" target="_top"><ArrowRight aria-hidden="true"/> На Sift</a>
  </main>;
}
