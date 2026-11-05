'use client';

import {useEffect,useMemo,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {ArrowLeft,ArrowRight,BadgeCheck,ExternalLink,RefreshCw,ScanSearch,ShieldAlert,ShieldCheck} from 'lucide-react';
import {compareOfferReports,type PriceDetail} from '../../lib/offer-comparison.js';
import './compare.css';

type Finding={kind:string;title:string;summary:string;evidence:string;severity?:string;confidence?:'high'|'medium'|'low';sourceUrl?:string;unresolved?:boolean};
type Report={id:string;url:string;host:string;title:string;score:number;decision:'buy'|'wait'|'close';verdict:string;prices:string[];priceDetails?:PriceDetail[];findings:Finding[];unknowns?:Finding[];lockedCount?:number;access?:Access};
type Access={plan:'free'|'one'|'pro';credits:number;used:number;limit:number};
type Result={left:Report;right?:Report};

const examples=[
  {label:'Spotify Premium',url:'https://www.spotify.com/us/premium/'},
  {label:'Apple Music',url:'https://www.apple.com/apple-music/'},
];
const decisionLabels={buy:'Купувати',wait:'Почекати',close:'Закрити вкладку'};

function getDeviceId(){let id=localStorage.getItem('sift-device-id');if(!id){id=crypto.randomUUID();localStorage.setItem('sift-device-id',id)}return id}
function formatMoney(amount:number,currency:string){try{return new Intl.NumberFormat('uk-UA',{style:'currency',currency,maximumFractionDigits:2}).format(amount)}catch{return `${amount.toFixed(2)} ${currency}`}}
function reportTerm(report:Report,kind:string){
  const finding=report.findings.find(item=>item.kind===kind);
  if(finding)return <><span className={`compareConfidence ${finding.confidence||'unknown'}`}>{finding.confidence?({high:'Висока впевненість',medium:'Середня впевненість',low:'Низька впевненість'})[finding.confidence]:'Рівень не збережено'}</span><b>{finding.summary}</b><small>{finding.evidence}</small><a className="compareSource" href={finding.sourceUrl||report.url} target="_blank" rel="noopener noreferrer">Джерело: {report.host} ↗</a></>;
  const unknown=report.unknowns?.find(item=>item.kind===kind||(kind==='penalty'&&item.kind==='penalty'));
  if(unknown)return <><span className="compareConfidence low">Низька впевненість</span><b>{unknown.summary}</b><a className="compareSource" href={unknown.sourceUrl||report.url} target="_blank" rel="noopener noreferrer">Джерело: {report.host} ↗</a></>;
  if(report.lockedCount)return <span className="compareUnknown">Частина умов прихована тарифом.</span>;
  return <span className="compareUnknown">Sift не знайшов цю умову у доступному тексті сторінки.</span>;
}
function annualText(report:Report,amount:number|null,currency:string|null,firstYearAmount:number|null,introMonths:number){
  if(amount!==null&&currency)return <><strong>{formatMoney(amount,currency)}<small>/ рік · регулярна ціна</small></strong><span>Найнижчий знайдений тариф, перерахований на 12 місяців.</span>{report.priceDetails&&report.priceDetails.filter(item=>item.annualAmount!==null).length>1&&<span className="comparePromo">На сторінці кілька тарифів; перевірте вимоги до найдешевшого.</span>}{introMonths>0&&firstYearAmount!==null&&<span className="comparePromo">Перший рік: ≈ {formatMoney(firstYearAmount,currency)} за умови {introMonths===1?'1 безкоштовного місяця':`${introMonths} безкоштовних місяців`} та права на пропозицію.</span>}</>;
  const uncertainPrice=report.findings.find(item=>item.kind==='price'&&item.confidence==='low');
  if(uncertainPrice)return <><strong>Не вдалося визначити впевнено</strong><span>{uncertainPrice.evidence}</span><a className="compareSource" href={uncertainPrice.sourceUrl||report.url} target="_blank" rel="noopener noreferrer">Джерело: {report.host} ↗</a></>;
  if(report.priceDetails?.some(item=>item.currency&&item.amount!==null))return <><strong>Потрібне уточнення</strong><span>Знайдено кілька валют або не визначено період оплати. {report.prices.slice(0,3).join(' · ')}</span></>;
  if(report.prices.length)return <><strong>Період не підтверджено</strong><span>Знайдено: {report.prices.slice(0,3).join(' · ')}</span></>;
  return <><strong>Не визначено</strong><span>Sift не знайшов ціну з підтвердженим періодом оплати.</span></>;
}

export default function ComparePage(){
  const[leftUrl,setLeftUrl]=useState(''),[rightUrl,setRightUrl]=useState(''),[access,setAccess]=useState<Access|null>(null),[quotaLoading,setQuotaLoading]=useState(true),[busy,setBusy]=useState(false),[stage,setStage]=useState(0),[error,setError]=useState(''),[result,setResult]=useState<Result|null>(null);
  const quotaMessage=useMemo(()=>{
    if(!access)return '';
    if(access.plan==='free'&&access.limit-access.used<2)return 'Для порівняння потрібно 2 перевірки. У вашому безкоштовному ліміті їх залишилося менше.';
    if(access.plan==='one'&&access.credits<2)return 'Для порівняння потрібно 2 повні перевірки. Активуйте ще один звіт або Sift Pro.';
    return '';
  },[access]);

  useEffect(()=>{let alive=true;const deviceId=getDeviceId();fetch(`/api/history?deviceId=${encodeURIComponent(deviceId)}`,{cache:'no-store'}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'Не вдалося перевірити ліміт');if(alive)setAccess(body.access||null)}).catch(()=>{}).finally(()=>{if(alive)setQuotaLoading(false)});return()=>{alive=false}},[]);

  async function analyzeOne(target:string){
    const response=await fetch('/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:target,deviceId:getDeviceId()})});
    const body=await response.json();
    if(!response.ok)throw new Error(body.error||`Не вдалося перевірити ${new URL(target).hostname}.`);
    if(body.access)setAccess(body.access);
    return body as Report;
  }

  async function compare(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');setResult(null);
    const urls=[leftUrl.trim(),rightUrl.trim()];
    try{
      const parsed=urls.map(value=>{const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Вкажіть публічні посилання, що починаються з https:// або http://.');return url});
      if(parsed[0].href===parsed[1].href)throw new Error('Вставте два різні посилання для порівняння.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Перевірте обидва посилання.');return}
    setBusy(true);setStage(1);
    try{
      const left=await analyzeOne(urls[0]);setResult({left});setStage(2);
      const right=await analyzeOne(urls[1]);setResult({left,right});setStage(0);
    }catch(reason){setError(reason instanceof Error?reason.message:'Не вдалося завершити порівняння. Перевірте URL та спробуйте ще раз.');setStage(0)}finally{setBusy(false)}
  }

  const comparison=result?.right?compareOfferReports(result.left,result.right):null;
  const offers=result?.right?[result.left,result.right]:result?[result.left]:[];
  const mobileLabel=(index:number)=>`Пропозиція ${index+1}`;

  return <main className="comparePage">
    <header className="compareTop"><Link href="/" className="compareBrand"><span>S</span>SIFT</Link><Link href="/" className="compareBack"><ArrowLeft/>Головна</Link></header>
    <section className="compareIntro"><small>ПОРІВНЯННЯ ПРОПОЗИЦІЙ</small><h1>Дві підписки.<br/><em>Один ясний вибір.</em></h1><p>Перевірте реальні сторінки тарифів поруч: річну регулярну ціну, автопродовження, повернення й можливі штрафи.</p></section>
    <section className="compareTool" aria-labelledby="compare-form-title">
      <div className="compareToolTop"><div><small>01 — ДОДАЙТЕ ДВА ПОСИЛАННЯ</small><h2 id="compare-form-title">Які пропозиції зіставити?</h2></div><span><ScanSearch/>2 перевірки</span></div>
      <div className="compareExamples"><span>Приклади сторінок:</span>{examples.map(item=><button type="button" key={item.url} onClick={()=>{setLeftUrl(examples[0].url);setRightUrl(examples[1].url);setError('');setResult(null)}}>{item.label}</button>)}</div>
      <form onSubmit={compare}>
        <label><span><i>01</i> Перша пропозиція</span><input type="url" required maxLength={2048} inputMode="url" autoCapitalize="none" autoCorrect="off" value={leftUrl} onChange={event=>setLeftUrl(event.target.value)} placeholder="https://service.com/pricing"/></label>
        <label><span><i>02</i> Друга пропозиція</span><input type="url" required maxLength={2048} inputMode="url" autoCapitalize="none" autoCorrect="off" value={rightUrl} onChange={event=>setRightUrl(event.target.value)} placeholder="https://another-service.com/terms"/></label>
        <div className="compareSubmit"><p><ShieldCheck/> Два аналізи зараховуються до ліміту вашого тарифу. Порівнюємо лише дані, які сторінки відкрито показали.</p><button type="submit" disabled={busy||quotaLoading||Boolean(quotaMessage)}>{busy?<><RefreshCw className="compareSpin"/>{stage===1?'Перевіряємо першу…':'Перевіряємо другу…'}</>:<>Порівняти умови <ArrowRight/></>}</button></div>
      </form>
      {quotaLoading&&<p className="compareQuota" role="status">Перевіряємо доступні перевірки…</p>}
      {!quotaLoading&&quotaMessage&&<p className="compareQuota" role="status">{quotaMessage} <Link href="/#pricing">Тарифи <ArrowRight/></Link></p>}
      {error&&<p className="compareError" role="alert"><ShieldAlert/>{error}</p>}
    </section>

    {offers.length>0&&<section className="compareResults" aria-live="polite" aria-busy={busy}>
      <header className="compareResultsHead"><div><small>02 — РЕЗУЛЬТАТИ З ПЕРШОДЖЕРЕЛ</small><h2>{result?.right?'Поруч, за однаковими критеріями':'Перша сторінка перевірена'}</h2></div>{busy&&<span className="compareProgress">{stage===1?'1':'2'} з 2</span>}</header>
      <div className="compareMatrix" role="table" aria-label="Порівняння двох пропозицій">
        <div className="compareRow compareHead" role="row"><div className="compareMetric" role="columnheader">Критерій</div>{offers.map((offer,index)=><div className="compareOfferHead" role="columnheader" key={offer.id}><span>{mobileLabel(index)}</span><b>{offer.host}</b><small>{offer.title}</small><a href={offer.url} target="_blank" rel="noopener noreferrer">Першоджерело <ExternalLink/></a></div>)}{!result?.right&&<div className="compareOfferHead comparePending"><span>Пропозиція 2</span><b>Очікує перевірки</b><small>Друга URL ще не проаналізована.</small></div>}</div>
        {result?.right&&comparison&&<>
          <div className="compareRow" role="row"><div className="compareMetric" role="rowheader">Регулярна ціна за 12 місяців</div><div className="compareValue" role="cell" data-label={mobileLabel(0)}>{annualText(result.left,comparison.leftCost.amount,comparison.leftCost.currency,comparison.leftCost.firstYearAmount??null,comparison.leftCost.introMonths||0)}</div><div className="compareValue" role="cell" data-label={mobileLabel(1)}>{annualText(result.right,comparison.rightCost.amount,comparison.rightCost.currency,comparison.rightCost.firstYearAmount??null,comparison.rightCost.introMonths||0)}</div></div>
          <div className="compareRow" role="row"><div className="compareMetric" role="rowheader">Повторне списання</div><div className="compareValue" role="cell" data-label={mobileLabel(0)}>{reportTerm(result.left,'renewal')}</div><div className="compareValue" role="cell" data-label={mobileLabel(1)}>{reportTerm(result.right,'renewal')}</div></div>
          <div className="compareRow" role="row"><div className="compareMetric" role="rowheader">Скасування та повернення</div><div className="compareValue" role="cell" data-label={mobileLabel(0)}>{reportTerm(result.left,'cancellation')}<div className="compareSubterm">{reportTerm(result.left,'refund')}</div></div><div className="compareValue" role="cell" data-label={mobileLabel(1)}>{reportTerm(result.right,'cancellation')}<div className="compareSubterm">{reportTerm(result.right,'refund')}</div></div></div>
          <div className="compareRow" role="row"><div className="compareMetric" role="rowheader">Штрафи й неповоротні умови</div><div className="compareValue" role="cell" data-label={mobileLabel(0)}>{result.left.findings.some(item=>item.kind==='penalty'||item.kind==='warning')?reportTerm(result.left,result.left.findings.some(item=>item.kind==='penalty')?'penalty':'warning'):reportTerm(result.left,'penalty')}</div><div className="compareValue" role="cell" data-label={mobileLabel(1)}>{result.right.findings.some(item=>item.kind==='penalty'||item.kind==='warning')?reportTerm(result.right,result.right.findings.some(item=>item.kind==='penalty')?'penalty':'warning'):reportTerm(result.right,'penalty')}</div></div>
          <div className="compareRow" role="row"><div className="compareMetric" role="rowheader">Пробний період</div><div className="compareValue" role="cell" data-label={mobileLabel(0)}>{reportTerm(result.left,'trial')}</div><div className="compareValue" role="cell" data-label={mobileLabel(1)}>{reportTerm(result.right,'trial')}</div></div>
          <div className="compareRow" role="row"><div className="compareMetric" role="rowheader">Clarity Score</div>{[result.left,result.right].map((offer,index)=><div className="compareValue compareScore" role="cell" data-label={mobileLabel(index)} key={offer.id}><strong>{offer.score}<small>/100</small></strong><span>{decisionLabels[offer.decision]}</span><div className="compareScoreBar"><i style={{width:`${Math.max(0,Math.min(100,offer.score))}%`}}/></div></div>)}</div>
        </>}
      </div>
      {result?.right&&comparison&&<div className="compareVerdict"><span><BadgeCheck/></span><div><small>ВЕРДИКТ SIFT</small><b>{comparison.verdict}</b><p>Річна сума перерахована з найнижчої чітко визначеної регулярної ціни. Не включає податки, промо, можливі збори чи персональні тарифи. Clarity Score показує повноту умов, а не гарантує безпеку продавця.</p></div></div>}
      {!result?.right&&<p className="comparePartial" role="status">Перша перевірка збережена окремо. Порівняння з’явиться, коли завершиться друга.</p>}
      <p className="compareFoot"><ShieldCheck/> Обидва аналізи зберігаються окремими звітами в історії Sift. Перед оплатою звірте ціну й цитати на оригінальних сторінках.</p>
    </section>}
    <footer className="compareFooter"><span>SIFT · KNOW BEFORE YOU PAY</span><Link href="/#top">Перевірити окрему сторінку <ArrowRight/></Link></footer>
  </main>;
}
