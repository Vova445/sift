'use client';
/* eslint-disable @next/next/no-img-element -- blob preview must stay local and must not be uploaded to image optimization. */

import {useEffect,useRef,useState,type CSSProperties,type DragEvent} from 'react';
import {AlertTriangle,Check,ImagePlus,LoaderCircle,ScanSearch,ShieldCheck,Trash2,UploadCloud} from 'lucide-react';
import './dark-pattern-detector.css';

type Finding={id:string;category:string;label:string;confidence:number;confidenceLevel:'high'|'medium'|'low';evidence:string;explanation:string;bbox:{x:number;y:number;width:number;height:number}};
type Analysis={findings:Finding[];image:{width:number;height:number};supportedPatterns:string[];dailyLimit:number;dailyUsed:number;privacy:string};
const MAX_BYTES=4*1024*1024;
const allowedTypes=['image/png','image/jpeg','image/webp'];
const allowedExtensions=new Set(['png','jpg','jpeg','webp']);
const highImpactCategories=new Set(['prechecked_option','hidden_fees','cancellation_obstruction']);

function confidenceLabel(level:Finding['confidenceLevel']){
  return level==='high'?'Висока впевненість':level==='medium'?'Середня впевненість':'Низька впевненість';
}
function formatFileSize(bytes:number){return bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} КБ`:`${new Intl.NumberFormat('uk-UA',{maximumFractionDigits:1}).format(bytes/1024/1024)} МБ`}

export default function DarkPatternDetector(){
  const inputRef=useRef<HTMLInputElement>(null);
  const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[imageSize,setImageSize]=useState<{width:number;height:number}|null>(null),[result,setResult]=useState<Analysis|null>(null),[active,setActive]=useState(0),[busy,setBusy]=useState(false),[dragging,setDragging]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');

  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);

  function acceptFile(next:File|null){
    if(!next)return;
    setError('');setNotice('');setResult(null);setActive(0);
    const extension=next.name.split('.').pop()?.toLowerCase()||'';
    if(!allowedTypes.includes(next.type)&&!(!next.type&&allowedExtensions.has(extension))){if(preview)URL.revokeObjectURL(preview);setFile(null);setImageSize(null);setPreview('');setError('Не підтримуємо цей формат. Оберіть файл PNG, JPG або WebP.');if(inputRef.current)inputRef.current.value='';return}
    if(next.size===0){if(preview)URL.revokeObjectURL(preview);setFile(null);setImageSize(null);setPreview('');setError('Файл порожній. Оберіть інший скриншот у форматі PNG, JPG або WebP.');if(inputRef.current)inputRef.current.value='';return}
    if(next.size>MAX_BYTES){if(preview)URL.revokeObjectURL(preview);setFile(null);setImageSize(null);setPreview('');setError(`Файл перевищує ліміт 4 МБ (${formatFileSize(next.size)}). Стисніть зображення або оберіть менший скриншот.`);if(inputRef.current)inputRef.current.value='';return}
    if(preview)URL.revokeObjectURL(preview);
    setFile(next);setImageSize(null);setPreview(URL.createObjectURL(next));
  }

  function clearFile(){if(preview)URL.revokeObjectURL(preview);setFile(null);setImageSize(null);setPreview('');setResult(null);setError('');setNotice('');setActive(0);if(inputRef.current)inputRef.current.value=''}

  async function analyze(){
    if(!file||busy)return;
    setBusy(true);setError('');setNotice('');setResult(null);setActive(0);
    try{
      const form=new FormData();form.set('screenshot',file,file.name||'screenshot');
      const response=await fetch('/api/dark-patterns',{method:'POST',body:form,cache:'no-store'});
      const body=await response.json() as Analysis&{error?:string};
      if(!response.ok)throw new Error(body.error||'Не вдалося проаналізувати зображення.');
      setResult(body);
      setNotice(body.findings.length?'Перевірте обведені місця на оригінальній сторінці перед висновком.':'Виразних ознак у цьому скриншоті не знайдено. Це не гарантує, що сторінка не містить ризиків.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Не вдалося проаналізувати скриншот. Спробуйте ще раз.')}finally{setBusy(false)}
  }

  function onDrop(event:DragEvent<HTMLButtonElement>){event.preventDefault();setDragging(false);acceptFile(event.dataTransfer.files?.[0]||null)}

  const frameTone=(category:string)=>highImpactCategories.has(category)?'major':'caution';
  const imageStageStyle=imageSize?{width:`min(100%, ${500*imageSize.width/imageSize.height}px)`,aspectRatio:`${imageSize.width} / ${imageSize.height}`} as CSSProperties:undefined;

  return <section className="darkPatternPanel" aria-labelledby="dark-pattern-title">
    <header className="darkPatternHeader"><div><small>ВІЗУАЛЬНА ПЕРЕВІРКА · AI</small><h2 id="dark-pattern-title">Знайдіть сумнівні трюки до оплати.</h2><p>Завантажте скриншот checkout-сторінки. Sift підсвітить видимі ознаки й покаже докази для вашої перевірки.</p></div><span className="darkPatternShield"><ShieldCheck aria-hidden="true"/></span></header>
    <div className="darkPatternTaxonomy" aria-label="Сім типів ознак, які перевіряються">{['Попередньо вибрані опції','Таймери терміновості','Приховані збори','Складне скасування','Тиск через сором','Непідтверджений дефіцит','Відволікання від вибору'].map(label=><span key={label}>{label}</span>)}</div>
    <div className="darkPatternGrid">
      <div className="darkPatternUploadColumn">
        {!preview?<button type="button" className={`darkPatternDrop ${dragging?'dragging':''}`} onClick={()=>inputRef.current?.click()} onDragEnter={event=>{event.preventDefault();setDragging(true)}} onDragOver={event=>event.preventDefault()} onDragLeave={()=>setDragging(false)} onDrop={onDrop} aria-label="Вибрати або перетягнути скриншот">
          <span><ImagePlus aria-hidden="true"/></span><b>Додайте скриншот оплати</b><small>Перетягніть файл сюди або натисніть, щоб обрати</small><em>PNG · JPG · WEBP · ДО 4 МБ</em>
        </button>:<div className="darkPatternPreviewWrap"><div className="darkPatternPreviewToolbar"><span><Check aria-hidden="true"/><b>{file?.name}</b><small>{file?formatFileSize(file.size):''} · надсилається лише для аналізу</small></span><div className="darkPatternFileActions"><button type="button" onClick={()=>inputRef.current?.click()} aria-label="Замінити скриншот"><ImagePlus/></button><button type="button" onClick={clearFile} aria-label="Видалити скриншот з попереднього перегляду"><Trash2/></button></div></div><div className="darkPatternPreview" data-testid="dark-pattern-preview"><div className="darkPatternImageStage" style={imageStageStyle}><img src={preview} alt="Попередній перегляд скриншота сторінки оплати" onLoad={event=>setImageSize({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})}/>{result&&imageSize&&<svg className="darkPatternOverlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="Нумеровані ділянки з можливими ознаками">{result.findings.map((finding,index)=>{const tone=frameTone(finding.category),label=finding.label;return <g key={finding.id} className={`${tone} ${active===index?'active':''}`} role="button" tabIndex={0} aria-label={`Ознака ${index+1}: ${label}`} aria-pressed={active===index} onFocus={()=>setActive(index)} onClick={()=>setActive(index)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setActive(index)}}}><rect x={finding.bbox.x} y={finding.bbox.y} width={finding.bbox.width} height={finding.bbox.height} vectorEffect="non-scaling-stroke"/><circle cx={Math.min(985,finding.bbox.x+18)} cy={Math.min(985,finding.bbox.y+18)} r="16" vectorEffect="non-scaling-stroke"/><text x={Math.min(985,finding.bbox.x+18)} y={Math.min(985,finding.bbox.y+23)} textAnchor="middle">{index+1}</text></g>})}</svg>}</div></div></div>}
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="darkPatternFileInput" onChange={event=>{acceptFile(event.target.files?.[0]||null);event.currentTarget.value=''}}/>
        <button type="button" className="darkPatternAnalyze" onClick={()=>void analyze()} disabled={!file||busy}>{busy?<><LoaderCircle className="darkPatternSpin"/>Аналізуємо зображення…</>:<><ScanSearch/>Перевірити скриншот</>}</button>
        <p className="darkPatternPrivacy"><ShieldCheck aria-hidden="true"/><span><b>Файл не зберігається у Sift.</b> Звірте ознаки з реальною сторінкою перед висновком.</span></p>
        <p className="darkPatternScope"><AlertTriangle aria-hidden="true"/><span>Підсвітка позначає можливі ознаки, а не встановлює порушення чи провину.</span></p>
      </div>
      <div className="darkPatternFindings" aria-live="polite">
        {!result&&!busy&&<div className="darkPatternEmpty"><span><UploadCloud aria-hidden="true"/></span><b>Тут з’являться докази</b><p>AI перевіряє зображення за 7 типами видимих ознак. Кожна рамка має цитату, пояснення та рівень упевненості.</p><small><AlertTriangle aria-hidden="true"/> Оцінка приблизна — звірте її з реальною сторінкою.</small></div>}
        {busy&&<div className="darkPatternLoading" role="status"><LoaderCircle/><b>Перевіряємо скриншот</b><p>Зазвичай це займає кілька секунд.</p><div className="darkPatternSkeletonList" aria-hidden="true"><i/><i/><i/></div></div>}
        {result&&<><div className="darkPatternResultsHeading"><div><small>РЕЗУЛЬТАТ АНАЛІЗУ</small><b>{result.findings.length?`Знайдено ознак: ${result.findings.length}`:'Виразних ознак не знайдено'}</b></div><span>{result.image.width} × {result.image.height}</span></div>{result.findings.length?<div className="darkPatternFindingList">{result.findings.map((finding,index)=>{const tone=frameTone(finding.category);return <button type="button" key={finding.id} className={`darkPatternFindingCard ${tone} ${active===index?'selected':''}`} onClick={()=>setActive(index)} aria-pressed={active===index}><span className="darkPatternFindingNumber">{index+1}</span><span className="darkPatternFindingBody"><b>{finding.label}</b><span className="darkPatternImpact">{tone==='major'?'Може вплинути на ціну або вибір':'Застереження для перевірки'}</span><small>{confidenceLabel(finding.confidenceLevel)} · {Math.round(finding.confidence*100)}%</small><q>{finding.evidence}</q><span>{finding.explanation}</span></span></button>})}</div>:<div className="darkPatternNoFindings"><Check aria-hidden="true"/>На цьому скриншоті AI не помітив виразних ознак.</div>}<p className="darkPatternResultNote"><AlertTriangle aria-hidden="true"/>{notice}</p><small className="darkPatternUsage">Сьогодні використано {result.dailyUsed} з {result.dailyLimit} аналізів для вашого плану.</small></>}
        {error&&<p className="darkPatternError" role="alert">{error}</p>}
      </div>
    </div>
  </section>;
}
