import type {ReactNode} from 'react';
import Link from 'next/link';
import './legal.css';

const policies=[['/privacy','Приватність'],['/terms','Умови'],['/refund','Повернення']];

export default function LegalLayout({children}:{children:ReactNode}){
  return <div className="legalSite">
    <header className="legalNav"><Link className="legalBrand" href="/" aria-label="Sift — на головну"><span className="legalBrandMark">S</span><b>SIFT</b><small>KNOW BEFORE YOU PAY</small></Link><nav className="legalNavActions" aria-label="Навігація документами"><Link className="legalDocsLink" href="/legal">Усі документи</Link><Link className="legalBack" href="/">← На головну</Link></nav></header>
    {children}
    <footer className="legalFooter"><Link className="legalBrand" href="/"><span className="legalBrandMark">S</span><b>SIFT</b></Link><nav aria-label="Юридичні документи"><Link href="/legal">Усі документи</Link>{policies.map(([href,label])=><Link key={href} href={href}>{label}</Link>)}</nav><a href="mailto:support@sift.app">support@sift.app</a><small>© 2026 AVEIron · Автоматична інформація, не юридична порада.</small></footer>
  </div>;
}
