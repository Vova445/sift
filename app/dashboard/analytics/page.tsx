'use client';

import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,ArrowRight,RefreshCw,ShieldCheck,Users,ScanSearch,UserRoundPlus,PanelTop,CreditCard} from 'lucide-react';
import './analytics.css';

type Funnel={visit:number;analyze:number;signup:number;paywall:number;pay:number};
const steps:{key:keyof Funnel;label:string;hint:string;Icon:typeof Users}[]=[
  {key:'visit',label:'Візит',hint:'Надали згоду на вимірювання',Icon:Users},
  {key:'analyze',label:'Аналіз',hint:'Успішно отримали звіт',Icon:ScanSearch},
  {key:'signup',label:'Реєстрація',hint:'Акаунт створено',Icon:UserRoundPlus},
  {key:'paywall',label:'Paywall',hint:'Увійшли у checkout',Icon:PanelTop},
  {key:'pay',label:'Оплата',hint:'Платіж підтверджено',Icon:CreditCard},
];

export default function AnalyticsPage(){
  const[data,setData]=useState<{funnel:Funnel;periodDays:number;generatedAt:string}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true);
  async function load(){setBusy(true);setError('');try{const r=await fetch('/api/analytics/funnel',{cache:'no-store'}),body=await r.json();if(!r.ok)throw new Error(body.error||'Аналітика недоступна');setData(body)}catch(e){setError(e instanceof Error?e.message:'Не вдалося завантажити воронку')}finally{setBusy(false)}}
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer)},[]);
  const funnel=data?.funnel,largest=Math.max(funnel?.visit||0,1);
  const conversions=useMemo(()=>steps.map((step,index)=>({key:step.key,percent:index===0?100:funnel&&funnel[steps[index-1]!.key]?Math.round(funnel[step.key]/funnel[steps[index-1]!.key]*100):0})),[funnel]);
  return <main className="funnelPage"><div className="funnelShell"><header className="funnelTop"><a href="/dashboard"><ArrowLeft/>До Dashboard</a><span><ShieldCheck/>ПРИВАТНА ВОРОНКА</span></header><section className="funnelIntro"><div><small>PRODUCT ANALYTICS · 30 ДНІВ</small><h1>Шлях від візиту<br/><em>до оплати.</em></h1><p>Лише агреговані етапи від користувачів, які дали згоду. Без email, URL сторінок і рекламних трекерів.</p></div><button className="funnelRefresh" onClick={()=>void load()} disabled={busy}><RefreshCw className={busy?'funnelSpin':''}/>Оновити</button></section>
    {error?<section className="funnelEmpty" role="alert"><ShieldCheck/><b>{error}</b><p>Перевірте адміністративний доступ та налаштування сервера.</p><button onClick={()=>void load()}>Спробувати знову <ArrowRight/></button></section>:<section className="funnelSteps" aria-label="Конверсійна воронка">{steps.map((step,index)=>{const value=funnel?.[step.key]||0,Icon=step.Icon;return <article className="funnelStep" key={step.key}><div className="funnelStepHead"><span className="funnelStepIcon"><Icon/></span><small>0{index+1}</small></div><div className="funnelStepValue">{busy?'—':value}</div><b>{step.label}</b><p>{step.hint}</p><div className="funnelBarTrack"><span style={{width:`${Math.max(value?8:0,Math.round(value/largest*100))}%`}}/></div><div className="funnelStepFoot"><span>{index?`${conversions[index]?.percent||0}% з попереднього`:data?.periodDays?`${data.periodDays} днів`:'Останні 30 днів'}</span>{index>0&&funnel&&funnel[steps[index-1]!.key]>value&&<span>−{funnel[steps[index-1]!.key]-value}</span>}</div></article>})}</section>}
    <footer className="funnelFoot"><span><ShieldCheck/>Псевдонімізовані сесії · автоматичне видалення через 90 днів</span>{data&&<span>Оновлено {new Date(data.generatedAt).toLocaleString('uk-UA')}</span>}</footer>
  </div></main>;
}
