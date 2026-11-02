import type {Metadata} from 'next';
import Link from 'next/link';

export const metadata:Metadata={title:'Правові документи — Sift',description:'Політика приватності, умови користування та правила оплати й повернення Sift.'};

const documents=[
  {href:'/privacy',number:'01',title:'Політика приватності',description:'Які дані обробляє Sift, для чого, як довго та яким постачальникам вони передаються.'},
  {href:'/terms',number:'02',title:'Умови користування',description:'Як працює сервіс, тарифи, акаунт і межі автоматичного аналізу.'},
  {href:'/refund',number:'03',title:'Оплата та повернення',description:'Разова покупка, підписка, скасування й порядок звернення щодо платежу.'},
];

export default function LegalIndexPage(){
  return <main className="legalDocument legalIndex">
    <div className="legalHero"><span className="legalEyebrow"><i/> ДОКУМЕНТИ · SIFT</span><h1>Усе важливе —<br/>в одному місці.</h1><p>Оберіть документ, який хочете переглянути. На кожній сторінці є повернення до цього списку та на головну.</p></div>
    <nav className="legalIndexGrid" aria-label="Правові документи Sift">{documents.map(document=><a className="legalIndexCard" href={document.href} key={document.href}><span>{document.number}</span><div><h2>{document.title}</h2><p>{document.description}</p><b>Відкрити документ <i>↗</i></b></div></a>)}</nav>
    <Link className="legalIndexHome" href="/">← Повернутися до Sift</Link>
  </main>;
}
