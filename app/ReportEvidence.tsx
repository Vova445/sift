'use client';

import {useState} from 'react';
import {BadgeCheck,CircleDollarSign,Clock3,FileSearch,LockKeyhole,ShieldAlert,ShieldCheck} from 'lucide-react';
import './report-evidence.css';

export type EvidenceFinding={kind:string;title:string;summary:string;evidence:string;severity?:'good'|'medium'|'high';confidence?:'high'|'medium'|'low';sourceUrl?:string;unresolved?:boolean};
export type EvidenceReport={url:string;host:string;findings:EvidenceFinding[];unknowns?:EvidenceFinding[]};
const confidenceText={high:'Висока впевненість',medium:'Середня впевненість',low:'Низька впевненість',unknown:'Не оцінено'};
const severityText={good:'Позитивна умова',medium:'Зверніть увагу',high:'Важливо'};
const iconFor=(kind:string)=>kind==='renewal'?Clock3:kind==='refund'?BadgeCheck:kind==='cancellation'?LockKeyhole:kind==='price'?CircleDollarSign:kind==='warning'||kind==='penalty'?ShieldAlert:ShieldCheck;
type TranslationLanguage='ukrainian'|'polish'|'german';
type LanguageChoice='original'|TranslationLanguage;
const languageOptions:Array<{value:LanguageChoice;label:string;short:string}>=[{value:'original',label:'Оригінал',short:'Ориг.'},{value:'ukrainian',label:'Українська',short:'UA'},{value:'polish',label:'Польська',short:'PL'},{value:'german',label:'Німецька',short:'DE'}];
type Props={report:EvidenceReport;translations?:Record<string,string>;translatingKey?:string|null;translationKey?:(index:number,language:TranslationLanguage)=>string;onTranslate?:(index:number,language:TranslationLanguage)=>void;translationLabel?:(index:number,language:TranslationLanguage)=>string;translationErrors?:Record<string,string>;onUnlockTranslation?:()=>void};

export default function ReportEvidence({report,translations={},translatingKey=null,translationKey=(index)=>String(index),onTranslate,translationLabel,translationErrors={},onUnlockTranslation}:Props){
  const [selectedLanguages,setSelectedLanguages]=useState<Record<string,LanguageChoice>>({});
  const cards=[...report.findings.map((finding,index)=>({...finding,index,unresolved:false})),...(report.unknowns||[]).map((finding,index)=>({...finding,index:-1,unresolved:true,cardKey:`unknown-${finding.kind}-${index}`}))];
  return <div className="riskgrid reportFindings" aria-label="Умови з цитатами та рівнем впевненості">
    {cards.map((finding,cardIndex)=>{
      const Icon=iconFor(finding.kind),cardKey='cardKey' in finding?finding.cardKey:`finding-${finding.kind}-${finding.index}`,selectedLanguage=selectedLanguages[cardKey]||'original';
      const translatedLanguage=selectedLanguage==='original'?null:selectedLanguage;
      const key=translatedLanguage&&finding.index>=0?translationKey(finding.index,translatedLanguage):'';
      const translated=key?translations[key]:'',isTranslating=Boolean(key&&key===translatingKey),sourceUrl=finding.sourceUrl||report.url;
      const confidence=finding.confidence||'unknown',severity=finding.severity||'medium';
      const actionLabel=translatedLanguage?translationLabel?.(finding.index,translatedLanguage):'';
      function chooseLanguage(language:LanguageChoice){
        setSelectedLanguages(current=>({...current,[cardKey]:language}));
        if(language==='original'||finding.unresolved||finding.index<0)return;
        const languageKey=translationKey(finding.index,language);
        if(!translations[languageKey]&&translationLabel?.(finding.index,language)==='Показати переклад')onTranslate?.(finding.index,language);
      }
      return <article key={`${finding.kind}-${cardIndex}`} className={`${confidence==='low'?'lowConfidence':''} ${finding.unresolved?'unresolvedFinding':''}`}>
        <header>
          <span className={`icon ${severity==='high'?'red':severity==='good'?'green':'amber'}`}><Icon size={17}/></span>
          <small>{finding.title}</small>
          {finding.unresolved?<span className="unknownBadge">Невідомо</span>:<span className={`severityBadge ${severity}`}>{severityText[severity]}</span>}
          <span className={`confidenceBadge ${confidence}`}>{confidenceText[confidence]}</span>
        </header>
        <h3>{finding.summary}</h3>
        {finding.unresolved
          ? <p className="unknownEvidence">Цитату не знайдено у доступному тексті. Це не підтверджує, що такої умови немає.</p>
          : <>
            <div className="evidenceLanguageSwitch" role="group" aria-label={`Мова доказу: ${finding.title}`}>
              {languageOptions.map(option=><button key={option.value} type="button" aria-label={option.label} aria-pressed={selectedLanguage===option.value} onClick={()=>chooseLanguage(option.value)}>{option.short}</button>)}
            </div>
            {finding.evidence==='Повний доказ доступний у One Sift або Pro'
              ? <div className="evidenceLocked"><span className="evidenceBlur" aria-hidden="true"><i/><i/><i/></span><div><LockKeyhole size={15}/><b>Цитату приховано у Free</b><small>Першоджерело й тип умови доступні в описі. Повний доказ відкриває One Sift або Pro.</small>{onUnlockTranslation&&<button type="button" onClick={onUnlockTranslation}>Відкрити план <BadgeCheck size={13}/></button>}</div></div>
              : <blockquote>{translated||`“${finding.evidence}”`}</blockquote>}
            {confidence==='low'&&<p className="lowConfidenceNote"><ShieldAlert size={14}/> Не вдалося визначити впевнено. Перевірте цитату на сторінці продавця.</p>}
            {translatedLanguage&&!translated&&!isTranslating&&actionLabel&&actionLabel!=='Показати переклад'&&<div className="translationLocked"><LockKeyhole size={14}/><span>Переклад доказу доступний у One Sift або Pro.</span>{onUnlockTranslation&&<button type="button" onClick={onUnlockTranslation}>Відкрити план</button>}</div>}
            {isTranslating&&<p className="translationPending" role="status">Перекладаємо доказ…</p>}
            {key&&translationErrors[key]&&<small className="translateFailure" role="status">{translationErrors[key]}</small>}
          </>}
        <footer><FileSearch size={12}/><a href={sourceUrl} target="_blank" rel="noopener noreferrer">Джерело: {report.host} ↗</a>{translated&&<span> · Переклад Cloudflare AI</span>}</footer>
      </article>;
    })}
  </div>;
}
