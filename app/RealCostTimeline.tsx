'use client';

import {useId} from 'react';
import {CalendarClock, CircleAlert, CircleDollarSign, Clock3, ShieldCheck, TrendingUp} from 'lucide-react';
import {buildRealCostTimeline} from '../lib/real-cost-timeline.js';
import './real-cost-timeline.css';

type Props = {
  report: Parameters<typeof buildRealCostTimeline>[0] & {
    title?: string;
    priceDetails?: Array<{amount:number|null;currency:'USD'|'EUR'|'GBP'|'UAH'|null;cadence:'monthly'|'yearly'|'weekly'|'quarterly'|'half-yearly'|null;introMonths?:number}>;
  };
};

const formatDate = (value:string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('uk-UA',{day:'numeric',month:'short',timeZone:'UTC'});
const formatMoney = (value:number,currency:string) => new Intl.NumberFormat('uk-UA',{style:'currency',currency,maximumFractionDigits:2}).format(value);
const formatCompact = (value:number,currency:string) => new Intl.NumberFormat('uk-UA',{style:'currency',currency,notation:'compact',maximumFractionDigits:1}).format(value);

export default function RealCostTimeline({report}:Props){
  const id=useId();
  const now=new Date();
  const today=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
  const timeline=buildRealCostTimeline(report,today);
  const max=Math.max(...timeline.months.map(item=>item.cumulative),1);
  const points=timeline.months.map((item,index)=>({x:16+index*29.8,y:137-(item.cumulative/max)*105,item}));
  const line=points.map(point=>`${point.x},${point.y}`).join(' ');
  const area=`16,145 ${line} 343,145`;
  const kinds:Record<string,{icon:typeof CalendarClock;className:string}>={
    trial:{icon:Clock3,className:'trial'},firstCharge:{icon:CircleDollarSign,className:'firstCharge'},increase:{icon:TrendingUp,className:'increase'},
    penalty:{icon:CircleAlert,className:'penalty'},refund:{icon:ShieldCheck,className:'refund'},
  };

  return <section className="realCostCard" aria-labelledby={`${id}-title`}>
    <header className="realCostHeader">
      <div><small>12-МІСЯЧНИЙ ПРОГНОЗ</small><h3 id={`${id}-title`}>Часова шкала реальної вартості</h3><p>За умовами, які Sift підтвердив у цьому звіті.</p></div>
      {timeline.total!==null&&timeline.currency&&<div className="realCostTotal"><small>ПРОГНОЗ ПЛАТЕЖІВ</small><b>{formatMoney(timeline.total,timeline.currency)}</b><span>за 12 місяців від сьогодні</span></div>}
    </header>

    {timeline.total!==null&&timeline.currency?<>
      <div className="realCostChartWrap">
        <svg className="realCostChart" viewBox="0 0 360 180" role="img" aria-labelledby={`${id}-chart-title ${id}-chart-desc`}>
          <title id={`${id}-chart-title`}>Накопичені платежі за 12 місяців</title>
          <desc id={`${id}-chart-desc`}>{timeline.months.map((item)=>`Місяць ${item.month}: ${formatMoney(item.cumulative,timeline.currency!)}`).join('. ')}</desc>
          {[0,1,2,3].map((step)=><line key={step} x1="14" x2="346" y1={35+step*35} y2={35+step*35} className="realCostGridLine"/>)}
          <polygon points={area} className="realCostArea"/>
          <polyline points={line} className="realCostLine"/>
          {points.map(({x,y,item})=><g key={item.month}><circle cx={x} cy={y} r="3.2" className="realCostDot"><title>{`Місяць ${item.month}: ${formatMoney(item.cumulative,timeline.currency!)}`}</title></circle><text x={x} y="166" textAnchor="middle" className="realCostAxisLabel">{item.month}</text></g>)}
        </svg>
        <div className="realCostChartCaption"><span><i/>Накопичена сума регулярних платежів</span><span>Місяць</span></div>
      </div>
      <details className="realCostMonthDetails"><summary>Суми за кожен місяць</summary><div className="realCostMonthGrid">{timeline.months.map(item=><div key={item.month}><small>М{item.month}</small><b>{formatCompact(item.cumulative,timeline.currency!)}</b></div>)}</div></details>
      {timeline.sourceEvidence&&<details className="realCostEvidence"><summary>Показати доказ ціни</summary><blockquote>{timeline.sourceEvidence}</blockquote></details>}
    </>:<div className="realCostUnavailable"><CircleAlert aria-hidden="true"/><div className="realCostUnavailableCopy"><b>Надійний прогноз поки неможливо побудувати</b><p>{timeline.unavailableReason}</p></div></div>}

    {timeline.events.length>0&&<div className="realCostTimelineBlock"><h4><CalendarClock aria-hidden="true"/>Події протягом року</h4><ol className="realCostTimelineNodes">{timeline.events.map((event,index)=>{const config=kinds[event.kind]||kinds.trial;const Icon=config.icon;return <li className={`realCostTimelineNode ${config.className}`} key={`${event.kind}-node-${index}`}><span className="realCostTimelineDot"><Icon aria-hidden="true"/></span><div><small>{event.date?`${formatDate(event.date)} · Місяць ${event.month}`:event.month?`Місяць ${event.month} · дата не визначена`:'Строк не визначено'}</small><b>{event.title}</b><p>{event.detail}</p></div></li>})}</ol></div>}

    {timeline.events.length>0&&<div className="realCostEvents"><h4><CalendarClock aria-hidden="true"/>Ключові умови</h4><ul>{timeline.events.map((event,index)=>{const config=kinds[event.kind]||kinds.trial;const Icon=config.icon;return <li className={`realCostEvent ${config.className}`} key={`${event.kind}-${index}`}><span className="realCostEventIcon"><Icon aria-hidden="true"/></span><div className="realCostEventBody"><div className="realCostEventTitle"><b>{event.title}</b>{event.date&&<time dateTime={event.date}>{formatDate(event.date)} · М{event.month}</time>}</div><p>{event.detail}</p>{event.evidence&&<details><summary>Доказ з умов</summary><blockquote>{event.evidence}</blockquote></details>}</div></li>})}</ul></div>}

    {timeline.notes.length>0&&<ul className="realCostNotes">{timeline.notes.map((note,index)=><li key={index}><CircleAlert aria-hidden="true"/><span>{note}</span></li>)}</ul>}
    <p className="realCostFootnote">Це прогноз за доступними цитатами, а не гарантія продавця. Він не включає податки, курсові зміни чи непідтверджені комісії. Повернення та можливі штрафи не зменшують і не збільшують основну суму.</p>
  </section>;
}
