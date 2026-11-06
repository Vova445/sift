import type {Metadata} from 'next';
import Link from '../../NativeLink';
import {notFound} from 'next/navigation';
import {getPublicVerdict,publicVerdictOrigin} from '../../../lib/public-verdict';
import {publicVerdictLabel} from '../../../lib/public-verdict-policy.js';
import './share.css';

export const dynamic='force-dynamic';
export const revalidate=0;

type Props={params:Promise<{token:string}>};

export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {token}=await params,card=await getPublicVerdict(token);
  if(!card)return{title:'Картка недоступна — Sift',robots:{index:false,follow:false},referrer:'no-referrer'};
  const title=`Clarity Score ${card.score}/100 — Sift`;
  const description='Публічна картка показує лише Clarity Score і загальний вердикт. Назва сервісу, джерела й особисті дані приховані.';
  const image=`${publicVerdictOrigin()}/share/${encodeURIComponent(token)}/image`;
  const url=`${publicVerdictOrigin()}/share/${encodeURIComponent(token)}`;
  return{
    title,description,robots:{index:false,follow:false},referrer:'no-referrer',
    openGraph:{type:'website',locale:'uk_UA',siteName:'Sift',title,description,url,images:[{url:image,width:1200,height:630,alt:`Sift Clarity Score ${card.score} зі 100`}]},
    twitter:{card:'summary_large_image',title,description,images:[image]},
  };
}

const labels:Record<string,string>={buy:'КУПУВАТИ',wait:'ПОЧЕКАТИ',close:'ЗАКРИТИ ВКЛАДКУ'};

export default async function PublicVerdictPage({params}:Props){
  const {token}=await params,card=await getPublicVerdict(token);
  if(!card)notFound();
  return <main className="publicVerdictPage">
    <header className="publicVerdictNav"><Link href="/" className="publicVerdictBrand" aria-label="Sift — на головну"><span>S</span>SIFT</Link><small>ПУБЛІЧНА КАРТКА</small></header>
    <article className="publicVerdictCard" aria-labelledby="public-verdict-title">
      <div className="publicVerdictTop"><span>CLARITY SCORE</span><span>ОБМЕЖЕНІ ДАНІ</span></div>
      <div className="publicVerdictResult">
        <div className="publicVerdictScore"><strong>{card.score}</strong><span>/100</span></div>
        <div className={`publicVerdictDecision ${card.decision}`}><i aria-hidden="true"/>{labels[card.decision]}</div>
      </div>
      <h1 id="public-verdict-title">{publicVerdictLabel(card.decision)}</h1>
      <div className="publicVerdictPrivacy">Ця картка показує лише оцінку та загальний вердикт. Назва сервісу, URL, ціни, докази й дані власника приховані.</div>
    </article>
    <footer className="publicVerdictFooter"><span>Оцінка повноти умов, не чесності компанії.</span><Link href="/#top">Перевірити власну покупку <span aria-hidden="true">↗</span></Link></footer>
  </main>;
}
