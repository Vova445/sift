import type {ReactNode} from 'react';
import './legal.css';

// Legal pages use native document navigation so links work even if client-side routing fails.
/* eslint @next/next/no-html-link-for-pages: "off" */

const policies=[['/privacy','Приватність'],['/terms','Умови'],['/refund','Повернення']];

export default function LegalLayout({children}:{children:ReactNode}){
  return <div className="legalSite">
    <header className="legalNav"><a className="legalBrand" href="/" target="_top" aria-label="Sift — на головну"><span className="legalBrandMark">S</span><b>SIFT</b><small>KNOW BEFORE YOU PAY</small></a><nav className="legalNavActions" aria-label="Навігація документами"><a className="legalDocsLink" href="/legal" target="_top">Усі документи</a><a className="legalBack" href="/" target="_top">← На головну</a></nav></header>
    {children}
    <footer className="legalFooter"><a className="legalBrand" href="/" target="_top"><span className="legalBrandMark">S</span><b>SIFT</b></a><nav aria-label="Юридичні документи"><a href="/legal" target="_top">Усі документи</a>{policies.map(([href,label])=><a key={href} href={href} target="_top">{label}</a>)}</nav><a href="mailto:support@sift.app">support@sift.app</a><small>© 2026 AVEIron · Автоматична інформація, не юридична порада.</small></footer>
  </div>;
}
