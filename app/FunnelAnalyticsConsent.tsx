'use client';

import {useEffect,useState} from 'react';
import {LockKeyhole,Settings2,X} from 'lucide-react';
import {privacySignalPresent,setAnalyticsConsent,trackFunnelVisit} from '../lib/funnel-analytics-client';
import './funnel-analytics.css';

export default function FunnelAnalyticsConsent(){
  const[open,setOpen]=useState(false),[known,setKnown]=useState(false);
  useEffect(()=>{
    const blocked=privacySignalPresent();
    let stored='';try{stored=localStorage.getItem('sift-funnel-consent')||''}catch{}
    if(stored==='granted')void trackFunnelVisit();
    const initial=window.setTimeout(()=>{setOpen(!blocked&&!stored);setKnown(true)},0);
    const reopen=()=>{if(!blocked)setOpen(true)};
    window.addEventListener('sift:privacy-settings',reopen);
    return()=>{window.clearTimeout(initial);window.removeEventListener('sift:privacy-settings',reopen)};
  },[]);
  function choose(value:'granted'|'denied'){
    setAnalyticsConsent(value);setOpen(false);
    if(value==='granted')void trackFunnelVisit();
  }
  if(!known||!open)return null;
  return <aside className="funnelConsent" aria-label="Налаштування аналітики" aria-live="polite">
    <div className="funnelConsentIcon"><LockKeyhole/></div>
    <div className="funnelConsentCopy"><b>Допомогти покращити Sift?</b><p>За згодою ми запишемо анонімні етапи користування: візит, аналіз і покупку. Без email, адрес сторінок чи рекламних трекерів. Дані зберігаються до 90 днів.</p><a href="/privacy">Як це працює</a></div>
    <div className="funnelConsentActions"><button className="funnelConsentAllow" onClick={()=>choose('granted')}>Дозволити</button><button className="funnelConsentDeny" onClick={()=>choose('denied')}>Ні, дякую</button></div>
    <button className="funnelConsentClose" aria-label="Закрити налаштування аналітики" onClick={()=>choose('denied')}><X/></button>
  </aside>;
}

export function AnalyticsSettingsButton(){return <button className="funnelSettingsLink" type="button" onClick={()=>window.dispatchEvent(new Event('sift:privacy-settings'))}><Settings2/>Налаштування приватності</button>}
