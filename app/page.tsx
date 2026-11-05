'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {motion,AnimatePresence} from 'framer-motion';
import EmailVerificationNotice from './EmailVerificationNotice';
import TurnstileWidget from './TurnstileWidget';
import {useBodyScrollLock} from './useBodyScrollLock';
import {useAccessibleDialog} from './useAccessibleDialog';
import {AnalyticsSettingsButton} from './FunnelAnalyticsConsent';
import CancellationKitDialog from './CancellationKitDialog';
import ReportEvidence from './ReportEvidence';
import './cancellation-kit.css';
import './extension-prefill.css';
import './landing-ph7.css';
import './pricing-alignment.css';
import './auth-modal.css';
import './checkout-modal.css';
import {funnelSessionId,trackFunnelStage,trackFunnelVisit} from '../lib/funnel-analytics-client';
import {ArrowRight,ArrowUp,BadgeCheck,BellRing,BookmarkPlus,Check,ChevronRight,CircleAlert,CircleDollarSign,Clock3,Eye,EyeOff,FileSearch,Link2,LockKeyhole,Mail,Menu,ScanSearch,Search,ShieldCheck,Sparkles,X,Zap} from 'lucide-react';

type Finding={kind:string;title:string;summary:string;evidence:string;severity?:'good'|'medium'|'high';confidence?:'high'|'medium'|'low';sourceUrl?:string;unresolved?:boolean};
type Access={plan:'free'|'one'|'pro';credits:number;used:number;limit:number;testMode?:boolean;expiresAt?:string};
type PriceDetail={amount:number|null;currency:'USD'|'EUR'|'GBP'|'UAH'|null;cadence:'monthly'|'yearly'|'weekly'|'quarterly'|'half-yearly'|null;annualAmount:number|null;firstYearAmount:number|null;introMonths:number};
type Report={id:string;url:string;host:string;title:string;score:number;prices:string[];priceDetails?:PriceDetail[];findings:Finding[];unknowns?:Finding[];wordCount:number;verdict:string;translationPlan?:'one'|'pro'|null;decision?:'buy'|'wait'|'close';lockedCount?:number;access?:Access};
type HistoryItem={id:string;createdAt:string;result:Report};
type User={id:string;email:string;emailVerified:boolean};
type TranslationLanguage='ukrainian'|'polish'|'german';
const unavailablePageError=/недоступ|не вдалося завантаж|не відповів|тайм.?аут|\b502\b|\b504\b|заблок|javascript|не html|майже не містить доступного тексту|замало тексту|завелика для безпечної|загальну або не ту сторінку|забагато перенаправлень|перенаправив запит|не повернув відповідь/i;
const formatConditionCount=(count:number)=>{const lastTwo=count%100,last=count%10;const noun=last===1&&lastTwo!==11?'умову':last>=2&&last<=4&&(lastTwo<12||lastTwo>14)?'умови':'умов';return`${count} ${noun}`};
const formatHistoryDate=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?'Дата невідома':new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'short'}).format(date)};
const examples=[
 {label:'Онлайн-курс',site:'Coursera',url:'https://www.coursera.org/about/terms'},
 {label:'Підписка',site:'Spotify Premium',url:'https://www.spotify.com/us/premium/'},
 {label:'Хмарна підписка',site:'iCloud+ · тарифи',url:'https://www.apple.com/icloud/'},
 {label:'Квиток на подію',site:'Eventbrite',url:'https://www.eventbrite.com/corporate/legal/legalterms/'},
];

export default function Home(){
  const[url,setUrl]=useState(''),[extensionPrefill,setExtensionPrefill]=useState(false),[report,setReport]=useState<Report|null>(null),[cancellationReport,setCancellationReport]=useState<Report|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[pay,setPay]=useState(false),[dashboard,setDashboard]=useState(false),[checkout,setCheckout]=useState<'one'|'pro'|null>(null),[checkoutBusy,setCheckoutBusy]=useState(false),[checkoutMessage,setCheckoutMessage]=useState(''),[paymentReference,setPaymentReference]=useState(''),[checkoutTestMode,setCheckoutTestMode]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[authMode,setAuthMode]=useState<'signup'|'login'>('signup'),[signup,setSignup]=useState(''),[user,setUser]=useState<User|null>(null),[access,setAccess]=useState<Access>({plan:'free',credits:0,used:0,limit:3}),[history,setHistory]=useState<HistoryItem[]>([]),[historyReady,setHistoryReady]=useState(false),[translations,setTranslations]=useState<Record<string,string>>({}),[translating,setTranslating]=useState<string|null>(null),[turnstileToken,setTurnstileToken]=useState(''),[turnstileReset,setTurnstileReset]=useState(0);
 const[mobileMenuOpen,setMobileMenuOpen]=useState(false),[loadingStep,setLoadingStep]=useState(0);
  const[translationErrors,setTranslationErrors]=useState<Record<string,string>>({});
  const[authFieldErrors,setAuthFieldErrors]=useState<{email?:string;password?:string;consent?:string;turnstile?:string;form?:string}>({});
  const[showPassword,setShowPassword]=useState(false);
  const scanInputRef=useRef<HTMLInputElement>(null);
 const authDialogRef=useAccessibleDialog<HTMLDivElement>(pay,()=>setPay(false));const dashboardDialogRef=useAccessibleDialog<HTMLDivElement>(dashboard,()=>setDashboard(false));const checkoutDialogRef=useAccessibleDialog<HTMLDivElement>(Boolean(checkout),()=>setCheckout(null));
  useBodyScrollLock(pay||dashboard||Boolean(checkout)||Boolean(cancellationReport));
 useEffect(()=>{const media=window.matchMedia('(max-width:600px)'),columns=()=>Array.from(document.querySelectorAll<HTMLDetailsElement>('.footerColumn'));const setDefaults=()=>columns().forEach((column,index)=>{column.open=!media.matches||index===0});setDefaults();media.addEventListener('change',setDefaults);return()=>media.removeEventListener('change',setDefaults)},[]);
 useEffect(()=>{if(!loading)return;const timer=window.setInterval(()=>setLoadingStep(step=>Math.min(step+1,2)),6500);return()=>window.clearInterval(timer)},[loading]);
 const[verificationNotice,setVerificationNotice]=useState('');const[signupLegalAccepted,setSignupLegalAccepted]=useState(false);const[checkoutTermsAccepted,setCheckoutTermsAccepted]=useState(false);const[checkoutPrivacyAccepted,setCheckoutPrivacyAccepted]=useState(false);const[checkoutRefundAccepted,setCheckoutRefundAccepted]=useState(false);const[checkoutState,setCheckoutState]=useState<'idle'|'redirecting'|'pending'|'success'|'error'>('idle');
 const deviceId=()=>{let id=localStorage.getItem('sift-device-id');if(!id){id=crypto.randomUUID();localStorage.setItem('sift-device-id',id)}return id};
 function openCheckout(plan:"one"|"pro"){if(user)void trackFunnelStage('paywall');setCheckoutTermsAccepted(false);setCheckoutPrivacyAccepted(false);setCheckoutRefundAccepted(false);setCheckoutMessage("");setCheckoutState('idle');setCheckoutTestMode(false);setCheckout(plan);void fetch('/api/billing/wayforpay/checkout',{cache:'no-store'}).then(response=>response.json()).then(config=>setCheckoutTestMode(Boolean(config.testMode))).catch(()=>{})}const loadHistory=()=>fetch(`/api/history?deviceId=${encodeURIComponent(deviceId())}`).then(r=>r.json()).then(x=>{setHistory((Array.isArray(x.items)?x.items:[]) as HistoryItem[]);if(x.access)setAccess(x.access);setHistoryReady(true)}).catch(()=>setHistoryReady(true));
 const loadAccount=()=>fetch(`/api/account?deviceId=${encodeURIComponent(deviceId())}`).then(r=>r.json()).then(x=>{if(x.user)setUser(x.user);if(x.access)setAccess(x.access);if(x.history)setHistory(x.history as HistoryItem[]);setHistoryReady(true)}).catch(()=>setHistoryReady(true));
 // Account bootstrap intentionally runs once; helpers use the stable device id stored in the browser.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{void trackFunnelVisit();fetch('/api/auth/me').then(r=>r.json()).then(x=>{setUser(x.user);if(x.user)loadAccount()}).catch(()=>{});loadHistory()},[]);
 useEffect(()=>{const params=new URLSearchParams(window.location.search),token=params.get('ref');if(token&&/^[A-Za-z0-9_-]{43}$/.test(token)){sessionStorage.setItem('sift-referral-token',token);params.delete('ref');const query=params.toString();window.history.replaceState({},'',`${window.location.pathname}${query?`?${query}`:''}${window.location.hash}`)}},[]);
 useEffect(()=>{const raw=new URLSearchParams(window.location.hash.slice(1)).get('sift-scan');if(!raw)return;window.history.replaceState({},'',`${window.location.pathname}${window.location.search}#top`);let target='';try{const candidate=new URL(raw);if(!['http:','https:'].includes(candidate.protocol)||candidate.username||candidate.password||raw.length>2048)throw new Error('invalid');candidate.search='';candidate.hash='';target=candidate.toString()}catch{const timer=window.setTimeout(()=>setError('Посилання з розширення Sift некоректне. Вставте публічне https:// посилання.'),0);return()=>window.clearTimeout(timer)}const timer=window.setTimeout(()=>{setUrl(target);setExtensionPrefill(true);document.querySelector('#top')?.scrollIntoView({behavior:'smooth',block:'start'})},0);return()=>window.clearTimeout(timer)},[]);
  useEffect(()=>{const q=new URLSearchParams(window.location.search);if(!q.has('login')&&!q.has('signup'))return;const next=q.get('next')||'';if(/^\/dashboard(?:\/|$)/.test(next)&&!next.startsWith('//')&&!next.includes('\\'))sessionStorage.setItem('sift-auth-next',next);window.history.replaceState({},'',window.location.pathname+window.location.hash);const timer=window.setTimeout(()=>{changeAuthMode(q.has('login')?'login':'signup');setPay(true)},0);return()=>window.clearTimeout(timer)},[]);
  useEffect(()=>{if(!pay||!user)return;const next=sessionStorage.getItem('sift-auth-next')||'';const safeNext=/^\/dashboard(?:\/|$)/.test(next)&&!next.startsWith('//')&&!next.includes('\\');if(safeNext)sessionStorage.removeItem('sift-auth-next');window.location.replace(safeNext?next:'/dashboard')},[pay,user]);
 useEffect(()=>{if(dashboard)location.assign('/dashboard')},[dashboard]);
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search),reference=params.get('payment');
  if(!reference)return;
  const fallbackPlan=params.get('plan')==='one'?'one':'pro';
  window.history.replaceState({},'',window.location.pathname+window.location.hash);
  let cancelled=false;
  const timer=window.setTimeout(()=>{
   setPaymentReference(reference);setCheckout(fallbackPlan);setCheckoutState('pending');setCheckoutMessage('Перевіряємо підтвердження WayForPay…');
   void(async()=>{
    for(let attempt=0;attempt<10&&!cancelled;attempt++){
     try{
      const response=await fetch(`/api/billing/wayforpay/status?reference=${encodeURIComponent(reference)}`),data=await response.json();
      if(!response.ok)throw new Error(data.error||'Не вдалося перевірити платіж');
      if(data.access)setAccess(data.access);
      setCheckout(data.plan==='one'?'one':'pro');setCheckoutTestMode(Boolean(data.testMode));
      if(data.status==='paid'){setCheckoutState('success');setCheckoutMessage('Оплату підтверджено WayForPay.');return}
      if(data.status==='declined'||data.status==='expired'){setCheckoutState('error');setCheckoutMessage('Платіж не пройшов. Спробуйте ще раз або перевірте спосіб оплати.');return}
      setCheckoutState('pending');setCheckoutMessage('WayForPay ще підтверджує платіж. Перевірка повториться автоматично.');
     }catch(error){if(attempt===9){setCheckoutState('error');setCheckoutMessage(error instanceof Error?error.message:'Не вдалося перевірити платіж');return}}
     await new Promise(resolve=>setTimeout(resolve,2000));
    }
    if(!cancelled){setCheckoutState('pending');setCheckoutMessage('Платіж ще обробляється. Перевірте статус кнопкою нижче.')}
   })();
  },0);
  return()=>{cancelled=true;window.clearTimeout(timer)};
 },[]);
  async function analyze(){const target=url.trim();let parsed:URL;try{parsed=new URL(target)}catch{setError('Вставте повне посилання, наприклад https://example.com/terms.');scanInputRef.current?.focus();return}if(!['http:','https:'].includes(parsed.protocol)){setError('Посилання має починатися з http:// або https://.');scanInputRef.current?.focus();return}setUrl(target);setExtensionPrefill(false);setLoadingStep(0);setTranslations({});setTranslationErrors({});setReport(null);setError('');setLoading(true);void trackFunnelStage('analyze');window.setTimeout(()=>document.querySelector('#report')?.scrollIntoView({behavior:'smooth',block:'start'}),80);try{const r=await fetch('/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:target,deviceId:deviceId(),analyticsSessionId:funnelSessionId()})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Помилка перевірки');setReport(data);if(data.access)setAccess(data.access);await loadHistory()}catch(e){setError(e instanceof Error?e.message:'Не вдалося перевірити URL');window.setTimeout(()=>document.querySelector('#scan-result-status')?.scrollIntoView({behavior:'smooth',block:'center'}),80)}finally{setLoading(false)}}
 async function authenticate(){
   const normalizedEmail=email.trim();
   const errors:{email?:string;password?:string;consent?:string;turnstile?:string;form?:string}={};
   if(!normalizedEmail)errors.email='Введіть email.';
   else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))errors.email='Введіть коректну email-адресу.';
   if(!password)errors.password='Введіть пароль.';
   else if(authMode==='signup'&&password.length<8)errors.password='Пароль має містити щонайменше 8 символів.';
   if(authMode==='signup'&&!turnstileToken)errors.turnstile='Підтвердіть антибот-перевірку.';
   if(authMode==='signup'&&!signupLegalAccepted)errors.consent='Потрібно прийняти Умови та підтвердити ознайомлення з Політикою приватності.';
   setAuthFieldErrors(errors);
   if(Object.keys(errors).length)return;
   setSignup('loading');
   try{
     if(authMode==='signup')await trackFunnelVisit();
     const r=await fetch(`/api/auth/${authMode}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:normalizedEmail,password,...(authMode==='signup'?{turnstileToken,legalConsent:{acceptTerms:signupLegalAccepted,acknowledgePrivacy:signupLegalAccepted},analyticsSessionId:funnelSessionId(),deviceId:deviceId(),referralToken:sessionStorage.getItem('sift-referral-token')||undefined}:{})})});
     const responseText=await r.text();
     let data:{user?:User;error?:string;verification?:{sent?:boolean}};
     try{data=JSON.parse(responseText) as typeof data}
     catch{throw new Error(`Сервер повернув неочікувану відповідь (HTTP ${r.status}). Оновіть сторінку й спробуйте ще раз.`)}
     if(!r.ok)throw new Error(data.error||'Не вдалося авторизуватися');
     if(!data.user)throw new Error('Сервер не повернув дані акаунта. Оновіть сторінку й спробуйте ще раз.');
     if(authMode==='signup')sessionStorage.removeItem('sift-referral-token');
     setUser(data.user);setPassword('');setSignup(authMode==='signup'?'done':'');setAuthFieldErrors({});
     setVerificationNotice(authMode==='signup'?(data.verification?.sent?`Лист надіслано на ${data.user.email}. Перевірте папку «Вхідні» та «Спам».`:'Лист поки не надіслано. Перевірте налаштування пошти сервера й спробуйте повторно.'):'');
     await loadAccount();
   }catch(e){
     const message=e instanceof Error?e.message:'Не вдалося з’єднатися із сервером. Спробуйте ще раз.';
     if(authMode==='signup'){setTurnstileToken('');setTurnstileReset(value=>value+1)}
     if(/email|адрес/i.test(message)&&!/неправильний email або пароль/i.test(message))setAuthFieldErrors({email:message});
     else if(/парол/i.test(message))setAuthFieldErrors({password:message});
     else if(/turnstile|антибот|перевірк/i.test(message))setAuthFieldErrors({turnstile:message});
     else setAuthFieldErrors({form:message});
     setSignup('');
   }
 }
 function changeAuthMode(mode:'login'|'signup'){
   setAuthMode(mode);setSignup('');setPassword('');setAuthFieldErrors({});setTurnstileToken('');setTurnstileReset(value=>value+1);setSignupLegalAccepted(false);setVerificationNotice('');setShowPassword(false);
 }
 async function resendVerification(){setSignup('loading');setVerificationNotice('');try{const r=await fetch('/api/auth/email-verification/resend',{method:'POST'}),data=await r.json();if(!r.ok)throw new Error(data.error||'Не вдалося надіслати лист');setVerificationNotice(data.message||'Лист підтвердження надіслано.');}catch(e){setVerificationNotice(e instanceof Error?e.message:'Не вдалося надіслати лист. Спробуйте пізніше.')}finally{setSignup('')}}
 async function logout(){
   setSignup('loading');
   try{
     const r=await fetch('/api/auth/logout',{method:'POST'});
     if(!r.ok)throw new Error('Не вдалося вийти. Перевірте з’єднання та спробуйте ще раз.');
     setUser(null);setAccess({plan:'free',credits:0,used:0,limit:3});setHistory([]);setPassword('');setAuthFieldErrors({});setSignup('');setPay(false);
   }catch(e){
     const message=e instanceof Error?e.message:'Не вдалося вийти. Спробуйте ще раз.';
     setAuthFieldErrors({form:message});setSignup('');
   }
 }
 async function startCheckout(){
  if(!checkout)return;
  if(!checkoutTermsAccepted||!checkoutPrivacyAccepted||!checkoutRefundAccepted){setCheckoutMessage('Підтвердьте три пункти згоди перед оплатою.');setCheckoutState('error');return}
  if(!user){setCheckoutMessage('Спочатку увійдіть або створіть акаунт, щоб прив’язати покупку.');setCheckout(null);changeAuthMode('login');setPay(true);return}
  setCheckoutBusy(true);setCheckoutState('redirecting');setCheckoutMessage('Готуємо захищене перенаправлення до WayForPay…');setPaymentReference('');
  try{
   await trackFunnelStage('paywall');
   const response=await fetch('/api/billing/wayforpay/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan:checkout,analyticsSessionId:funnelSessionId(),legalConsent:{acceptTerms:checkoutTermsAccepted,acknowledgePrivacy:checkoutPrivacyAccepted,acceptRefund:checkoutRefundAccepted,requestImmediatePerformance:checkoutTermsAccepted}})});
   const raw=await response.text();
   let data:{error?:string;action?:string;fields?:Record<string,unknown>;testMode?:boolean};
   try{data=JSON.parse(raw)}catch{if(raw.includes('Your worker restarted mid-request'))throw new Error('Локальний Worker перезапустився під час запиту. Спробуйте ще раз.');throw new Error(`Сервер оплати повернув неочікувану відповідь (${response.status}). Спробуйте ще раз трохи пізніше.`)}
   if(!response.ok)throw new Error(data.error||`Не вдалося створити платіж (${response.status}).`);
   if(!data.action||!data.fields)throw new Error('Сервер не повернув параметри платежу. Спробуйте ще раз.');
   setCheckoutTestMode(Boolean(data.testMode));
   const form=document.createElement('form');form.method='POST';form.action=data.action;form.acceptCharset='utf-8';
   for(const[key,value]of Object.entries(data.fields)){
    if(Array.isArray(value)){for(const item of value){const input=document.createElement('input');input.type='hidden';input.name=`${key}[]`;input.value=String(item);form.append(input)}}
    else if(value!==undefined&&value!==null){const input=document.createElement('input');input.type='hidden';input.name=key;input.value=String(value);form.append(input)}
   }
   document.body.append(form);form.submit();
  }catch(error){setCheckoutState('error');setCheckoutMessage(error instanceof Error?error.message:'Не вдалося підключитися до WayForPay')}
  finally{setCheckoutBusy(false)}
 }
 async function refreshPaymentStatus(){
  if(!paymentReference)return;
  setCheckoutBusy(true);setCheckoutState('pending');setCheckoutMessage('Перевіряємо актуальний статус у WayForPay…');
  try{
   const response=await fetch(`/api/billing/wayforpay/status?reference=${encodeURIComponent(paymentReference)}`),data=await response.json();
   if(!response.ok)throw new Error(data.error||'Не вдалося перевірити платіж');
   if(data.access)setAccess(data.access);
   setCheckoutTestMode(Boolean(data.testMode));
   if(data.status==='paid'){setCheckoutState('success');setCheckoutMessage('Оплату підтверджено WayForPay.')}
   else if(data.status==='declined'||data.status==='expired'){setCheckoutState('error');setCheckoutMessage('Платіж не пройшов. Перевірте спосіб оплати або спробуйте ще раз.')}
   else{setCheckoutState('pending');setCheckoutMessage('Платіж ще очікує підтвердження WayForPay.')}
  }catch(error){setCheckoutState('error');setCheckoutMessage(error instanceof Error?error.message:'Не вдалося перевірити платіж')}
  finally{setCheckoutBusy(false)}
 } async function translateFinding(i:number,targetLanguage:TranslationLanguage){if(!report?.id){setError('Збережений звіт не знайдено. Повторіть перевірку сторінки.');return}const translationId=`${targetLanguage}:${i}`;if(translations[translationId])return;setTranslating(translationId);setTranslationErrors(x=>({...x,[translationId]:''}));try{const r=await fetch('/api/translate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scanId:report.id,findingIndex:i,targetLanguage})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Не вдалося перекласти фрагмент');if(typeof data.translation!=='string'||!data.translation.trim())throw new Error('Переклад порожній. Спробуйте ще раз.');setTranslations(x=>({...x,[translationId]:data.translation}))}catch(e){setTranslationErrors(x=>({...x,[translationId]:e instanceof Error?e.message:'AI-переклад тимчасово недоступний. Оригінальний доказ залишився доступним.'}))}finally{setTranslating(null)}}
  function openCancellationKit(target:Report){setCancellationReport(target);if(user&&target.id)void fetch('/api/achievements/cancellation-kit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scanId:target.id})}).catch(()=>{})}
 function openReport(x:Report){setReport(x);setDashboard(false);setTranslations({});setTranslationErrors({});setTimeout(()=>document.querySelector('#report')?.scrollIntoView({behavior:'smooth',block:'start'}),100)}
 return <main>
  <nav className="nav wrap" aria-label="Головна навігація"><a className="logo" href="#top" onClick={()=>setMobileMenuOpen(false)}><span><ScanSearch size={18}/></span>SIFT<sup>®</sup></a><div id="primary-navigation" className={`navlinks${mobileMenuOpen?' isOpen':''}`}><a href="#how" onClick={()=>setMobileMenuOpen(false)}>Як працює</a><a href="#usecases" onClick={()=>setMobileMenuOpen(false)}>Що перевіряє</a><a href="#pricing" onClick={()=>setMobileMenuOpen(false)}>Ціни</a><Link href="/domains" onClick={()=>setMobileMenuOpen(false)}>Індекс доменів</Link><a href="/legal" target="_top" onClick={()=>setMobileMenuOpen(false)}>Документи</a></div><div className="navright"><a className="navPolicyLink" href="/legal" target="_top">Документи</a>{user?<><span className="planPill">{access.plan==='pro'?'PRO':access.plan==='one'?'ONE SIFT':'FREE'}</span><span className="userEmail">{user.email}</span></>:<button className="ghost" onClick={()=>{setMobileMenuOpen(false);changeAuthMode('login');setPay(true)}}>Увійти</button>}<button className="dark" onClick={()=>user?location.assign('/dashboard'):(setMobileMenuOpen(false),changeAuthMode('signup'),setPay(true))}>{user?'Dashboard':'Реєстрація'} <ArrowRight size={14}/></button><button className="navMenuToggle" type="button" aria-label={mobileMenuOpen?'Закрити меню':'Відкрити меню'} aria-expanded={mobileMenuOpen} aria-controls="primary-navigation" onClick={()=>setMobileMenuOpen(open=>!open)}>{mobileMenuOpen?<X size={19}/>:<Menu size={19}/>}</button></div></nav>

  <section className="hero" id="top"><div className="heroGlow"/><motion.div className="heroBadge" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}><Sparkles size={13}/> ПЕРЕВІРКА ПЕРЕД ПОКУПКОЮ</motion.div><motion.h1 initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:.1}}>Не натискайте<br/><span>«Оплатити»</span> навмання.</motion.h1><motion.p initial={{opacity:0}} animate={{opacity:1}} transition={{delay:.2}}>Sift читає дрібний шрифт до покупки — знаходить приховані платежі, автопродовження, пастки скасування та дедлайни повернення.</motion.p>
   <motion.div className="scanner" initial={{opacity:0,y:25}} animate={{opacity:1,y:0}} transition={{delay:.3}}>{extensionPrefill&&<div className="extensionPrefill" role="status"><ShieldCheck size={15}/><span><b>З РОЗШИРЕННЯ</b> Посилання підставлено. Натисніть «Перевірити», щоб почати аналіз.</span><button type="button" aria-label="Закрити повідомлення" onClick={()=>setExtensionPrefill(false)}><X size={14}/></button></div>}<form className={`inputrow${extensionPrefill?' extensionReady':''}`} onSubmit={e=>{e.preventDefault();void analyze()}}><Link2 size={20} aria-hidden="true"/><input ref={scanInputRef} type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Посилання для перевірки" aria-describedby="scan-help" value={url} onChange={e=>{setUrl(e.target.value);setExtensionPrefill(false);if(error)setError('')}} placeholder="Вставте посилання на умови чи оплату"/><button type="submit" disabled={loading||!url.trim()}>{loading?<span className="spin" aria-label="Перевіряємо"/>:<><Search size={17} className="scanActionIcon" aria-hidden="true"/><ArrowRight size={17} className="scanActionArrow" aria-hidden="true"/> Перевірити</>}</button></form><p id="scan-help" className="scanHelp">Перший звіт зазвичай займає до 30 секунд · вхід не потрібен.</p><div className="quick"><div className="quickHeading"><b>Спробуйте на прикладах</b><span>Посилання підставиться — аналіз запустите ви</span></div><div className="quickExamples">{examples.map(e=><button className="exampleButton" type="button" key={e.url} aria-pressed={url===e.url} onClick={()=>{setUrl(e.url);setExtensionPrefill(false);setError('');scanInputRef.current?.focus({preventScroll:true})}}><span><b>{e.site==='iCloud+ · тарифи'?'iCloud+':e.site}</b><small>{e.label}</small></span><ArrowRight size={15} aria-hidden="true"/></button>)}</div><p className="quickTip"><ShieldCheck size={13}/> Працюємо з публічними сторінками. Якщо сайт закритий для автоматичного читання чи потребує JavaScript, спробуйте відкрити сторінку умов або вставте її текст.</p></div>{error&&<div id="scan-result-status" className={`scanError${unavailablePageError.test(error)?' availabilityError':''}`} role={unavailablePageError.test(error)?'status':'alert'}><div className="availabilityIcon" aria-hidden="true"><FileSearch size={18}/></div><div><b>{unavailablePageError.test(error)?'Не вдалося створити звіт':error}</b>{unavailablePageError.test(error)&&<span>{error} Це не звіт і Sift не робить висновків про умови цієї сторінки. Спробуйте відкрити доступні публічні умови або тариф у браузері.</span>}</div></div>}</motion.div>
   <a href="/compare" className="heroCompareLink">Порівняти дві пропозиції <ArrowRight size={14}/></a><div className="privacy"><ShieldCheck size={14}/><span>Приватний аналіз</span><i/><span>Не читаємо платіжні дані</span><i/><span>Перший Sift безкоштовний</span></div>
   {report&&<><div className="float f1"><span className="icon red"><BellRing size={16}/></span><div><small>ОСТАННЯ ПЕРЕВІРКА</small><b>{report.findings[0]?.title||'Явних пасток немає'}</b></div><strong>{report.score}/100</strong></div><div className="float f2"><span className="icon green"><Check size={16}/></span><div><small>ПЕРЕВІРЕНО</small><b>{report.host}</b></div><strong>{report.findings.length} умов</strong></div></>}
  </section>

  <section className="scenarioTicker" aria-label="Сценарії, які можна перевірити"><div className="scenarioTickerViewport"><div className="scenarioTickerTrack"><div className="scenarioTickerGroup"><span className="scenarioTickerItem"><b>КУРСИ</b><span>пробний період</span></span><span className="scenarioTickerItem"><b>ПОДОРОЖІ</b><span>умови повернення</span></span><span className="scenarioTickerItem"><b>ПРОГРАМНЕ ЗАБЕЗПЕЧЕННЯ</b><span>наступне списання</span></span><span className="scenarioTickerItem"><b>ОРЕНДА</b><span>депозит і штрафи</span></span><span className="scenarioTickerItem"><b>ПОДІЇ</b><span>квитки й комісії</span></span></div><div className="scenarioTickerGroup" aria-hidden="true"><span className="scenarioTickerItem"><b>КУРСИ</b><span>пробний період</span></span><span className="scenarioTickerItem"><b>ПОДОРОЖІ</b><span>умови повернення</span></span><span className="scenarioTickerItem"><b>ПРОГРАМНЕ ЗАБЕЗПЕЧЕННЯ</b><span>наступне списання</span></span><span className="scenarioTickerItem"><b>ОРЕНДА</b><span>депозит і штрафи</span></span><span className="scenarioTickerItem"><b>ПОДІЇ</b><span>квитки й комісії</span></span></div></div></div></section>

  <AnimatePresence>
   {(loading||report)&&<motion.section id="report" className="report wrap" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
    {loading?<>
     <div className="reportTop"><div><small>ЗВІТ ПРО ПОКУПКУ</small><h2>Sift читає реальну сторінку…</h2><p>Аналізуємо доступний текст сторінки</p></div></div>
     <div className="loadingStages" aria-label="Етапи перевірки" aria-live="polite">{['Завантажуємо доступний текст сторінки','Знаходимо ціну й автопродовження','Перевіряємо повернення та ризикові умови'].map((stage,index)=><div className={index<loadingStep?'complete':index===loadingStep?'active':''} key={stage}><span>{index<loadingStep?'✓':`0${index+1}`}</span><b>{stage}</b></div>)}</div>
    </>:report&&<>
     <div className="reportTop"><div><small>ЗВІТ ПРО ПОКУПКУ</small><h2>{report.title}</h2><p><a href={report.url} target="_blank" rel="noreferrer">{report.host} ↗</a> · проаналізовано {report.wordCount} слів</p></div></div>
     <div className="reportSummary">
      <div className="clarityScoreCard"><div className="clarityRing" role="meter" aria-label={`Clarity Score: ${report.score} зі 100`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={report.score} style={{background:`conic-gradient(#b9f353 ${Math.max(0,Math.min(100,report.score))}%, #3c433a 0)`}}><div><b>{report.score}</b><small>/100</small></div></div><div className="clarityScoreCaption"><small>CLARITY SCORE</small><span>Повнота знайдених умов</span></div></div>
       <div className={`verdict ${report.decision||'unknown'}`}><div className="verdictCopy"><span className="verdictIcon" aria-hidden="true"><Zap size={20}/></span><span className="verdictText"><span className="verdictHeading"><small>ВЕРДИКТ SIFT</small><strong className={`decisionTag ${report.decision||'unknown'}`}>{report.decision?({buy:'Купувати',wait:'Почекати',close:'Закрити вкладку'} as const)[report.decision]:'Не визначено'}</strong></span><p>{report.verdict}</p></span></div></div>
     </div>
     <p className="reportScoreNote"><b>Score — повнота даних, не чесність компанії.</b> Перевірте цитати на першоджерелі: якщо умову не знайдено, це не означає, що її немає.</p>
      {report.prices.length>0&&<div className="pricePanel"><header><CircleDollarSign/><span><small>ЦІНИ З КОНТЕКСТОМ</small><b>{report.prices.length} знайдених сум</b></span></header><div className="priceDetailsGrid">{report.prices.map((price,index)=>{const detail=report.priceDetails?.[index];const cadence=detail?.cadence?({monthly:'за місяць',yearly:'за рік',weekly:'за тиждень',quarterly:'за квартал','half-yearly':'за пів року'} as const)[detail.cadence]:'Період не визначено';const annual=detail?.annualAmount!==null&&detail?.annualAmount!==undefined&&detail.currency?new Intl.NumberFormat('uk-UA',{style:'currency',currency:detail.currency}).format(detail.annualAmount):null;const firstYear=detail?.firstYearAmount!==null&&detail?.firstYearAmount!==undefined&&detail.currency?new Intl.NumberFormat('uk-UA',{style:'currency',currency:detail.currency}).format(detail.firstYearAmount):null;return <article key={`${price}-${index}`}><b>{price}</b><span>{cadence}</span>{detail?.introMonths? <small>Після {detail.introMonths} безкоштовних місяців</small>:null}{annual&&detail?.cadence&&detail.cadence!=='yearly'&&<small>Еквівалент за 12 місяців за цією ставкою: {annual}</small>}{firstYear&&detail?.introMonths? <small>Перші 12 місяців з урахуванням пробного періоду: {firstYear}</small>:null}</article>})}</div></div>}
     <ReportEvidence report={report} translations={translations} translatingKey={translating} translationKey={(index,language)=>`${language}:${index}`} onTranslate={(index,language)=>void translateFinding(index,language)} translationErrors={translationErrors} onUnlockTranslation={()=>openCheckout('one')} translationLabel={(index,language)=>{const key=`${language}:${index}`;if(translations[key])return 'Переклад готовий';if(translating===key)return 'Перекладаємо…';if(access.plan==='free')return 'Переклад у платному тарифі';if(access.plan==='one'&&report.translationPlan!=='one')return 'Перейти на Pro';return 'Показати переклад'}}/>
      {(report.lockedCount||report.findings.some(finding=>finding.evidence==='Повний доказ доступний у One Sift або Pro'))? <div className="lockedReport" aria-label={report.lockedCount?`У безкоштовному плані приховано ще ${formatConditionCount(report.lockedCount)}`:'Докази приховані у безкоштовному плані'}><div className="lockedPreview" aria-hidden="true"><i/><i/><i/></div><div className="lockedCover"><LockKeyhole/><span><b>{report.lockedCount?`Ще ${formatConditionCount(report.lockedCount)} у повному звіті`:'Повні докази приховані у Free'}</b><small>Першоджерела й переклад доступні в One Sift або Pro.</small></span><button type="button" onClick={()=>openCheckout('one')}>Відкрити звіт <ArrowRight size={14}/></button></div></div>:null}
     <div className="reportActions"><button type="button" className="saveReportButton" onClick={()=>user?location.assign('/dashboard'):(changeAuthMode('signup'),setPay(true))}><BookmarkPlus size={17}/>{user?'Зберегти':'Зберегти у профіль'}<ArrowRight size={15}/></button><button type="button" className="cancelReportButton" onClick={()=>openCancellationKit(report)}><Mail size={17}/>Підготувати лист про скасування<ArrowRight size={15}/></button></div>
    </>}
   </motion.section>}
  </AnimatePresence>

  <section className="insight wrap" aria-labelledby="why-title"><div className="eyebrow">WHY SIFT</div><div className="insightGrid"><h2 id="why-title">Checkout показує ціну.<br/><em>Sift покаже наступне списання.</em></h2><div><p>Пробний період часто закінчується непомітно: перше платне списання може бути автоматичним, а вікно повернення — коротким.</p><p>Sift шукає у відкритих умовах ціну, дату продовження й правила повернення, щоб ви бачили наслідки <b>до натискання «Оплатити».</b></p></div></div><div className={`bigstat ${history.length?'hasDeviceStats':'isEmpty'}`} aria-live="polite">{history.length?<><div className="deviceStatsIntro"><span>ВАШІ РЕЗУЛЬТАТИ НА ЦЬОМУ ПРИСТРОЇ</span><p>Показники з реальних збережених перевірок. Без загальних лічильників.</p></div><div className="deviceStats"><article><strong>{history.length}</strong><span>звітів</span></article><article><strong>{Math.round(history.reduce((total,item)=>total+item.result.score,0)/history.length)}<small>/100</small></strong><span>середня повнота</span></article><article><strong>{history.reduce((total,item)=>total+item.result.findings.length+(item.result.lockedCount||0),0)}</strong><span>знайдених умов</span></article></div></>:<div className="historyPrompt"><span>{historyReady?'ВАША ІСТОРІЯ':'ЗАВАНТАЖУЄМО ІСТОРІЮ'}</span><b>{historyReady?'Перевірте першу сторінку':'Зачекайте мить…'}</b><small>{historyReady?'Перші показники з’являться тут після вашого аналізу — до того лічильники порожні.':'Завантажуємо реальні результати з цього пристрою.'}</small><button type="button" onClick={()=>document.querySelector<HTMLInputElement>('.inputrow input')?.focus()}>Почати перевірку <ArrowRight size={14}/></button></div>}</div></section>

  <section className="how" id="how"><div className="wrap"><div className="sectiontitle"><span>01 — HOW IT WORKS</span><h2>Шістдесят секунд<br/>до впевненого рішення.</h2></div><div className="steps"><article><div><Link2 size={23}/><b>01</b></div><h3>Дайте Sift публічне посилання</h3><p>Сторінка тарифу, умови сервісу або checkout, доступний без входу в акаунт.</p><span>PASTE A PUBLIC URL</span></article><article><div><FileSearch size={23}/><b>02</b></div><h3>Отримайте фактичні умови</h3><p>Ціна, продовження, повернення, скасування, штрафи та фрагменти першоджерела.</p><span>EVIDENCE, NOT GUESSES</span></article><article><div><ShieldCheck size={23}/><b>03</b></div><h3>Збережіть рішення у профілі</h3><p>Порівнюйте ризики, відкривайте повний звіт і повертайтеся до нього з Dashboard.</p><span>DECIDE WITH CLARITY</span></article></div></div></section>

  <section className="dashboard wrap" id="usecases"><div className="dashcopy"><span>02 — YOUR REAL HISTORY</span><h2>Ваші перевірки.<br/>Збережені на пристрої.</h2><p>Показуємо до п’яти останніх звітів з реальною оцінкою, доменом і датою аналізу.</p><ul><li><Check size={15}/> Фактичні URL і назви сторінок</li><li><Check size={15}/> Score з кожного звіту</li><li><Check size={15}/> Дата й домен джерела</li></ul><button type="button" onClick={()=>document.querySelector<HTMLInputElement>('.inputrow input')?.focus()}>Створити звіт <ArrowRight size={15}/></button></div><div className="dashui"><header><div><span className="miniLogo"><ScanSearch size={14}/></span><b>Історія пристрою</b></div><button type="button" onClick={()=>document.querySelector<HTMLInputElement>('.inputrow input')?.focus()}>+ Нова перевірка</button></header>{history.length?<div className="saved"><span>ЗБЕРЕЖЕНО НА ЦЬОМУ ПРИСТРОЇ</span><b>{history.length}</b><small>{history.length===1?'звіт':history.length<5?'звіти':'звітів'} · до 20 останніх</small></div>:<div className="saved savedEmpty"><span>ПЕРСОНАЛЬНА ІСТОРІЯ</span><b>{historyReady?'Ще немає перевірок':'Завантажуємо…'}</b><small>Вхід не потрібен</small></div>}<div className="purchases"><header><span>ОСТАННІ ПЕРЕВІРКИ</span><span>{history.length?`${Math.min(history.length,5)} З ${history.length}`:historyReady?'ПОКИ ПОРОЖНЬО':'ЗАВАНТАЖЕННЯ…'}</span></header>{history.length?history.slice(0,5).map((item,i)=>{const x=item.result;const scoreTone=x.score<55?'low':x.score<80?'mid':'high';const checkedDate=formatHistoryDate(item.createdAt);return <button type="button" className="purchaseRow" key={item.id||i} aria-label={`Відкрити ${x.host}, повнота ${x.score} зі 100, ${checkedDate}`} onClick={()=>openReport(x)}><span className={`purchaseScore ${scoreTone}`} style={{background:`conic-gradient(${x.score<55?'#bb493d':x.score<80?'#a86b13':'#4f8120'} ${Math.max(0,Math.min(100,x.score))}%,#e7ebe3 0)`}}><b>{x.score}</b></span><span className="purchaseInfo"><b title={x.title}>{x.title}</b><span className="purchaseMeta"><small className="purchaseHost">{x.host}</small><small className="purchaseDate">{checkedDate}</small></span></span><ChevronRight size={15}/></button>}):<div className="emptyHistory">{historyReady?'Перевірте перше посилання — звіт і його дата з’являться тут.':'Завантажуємо збережені перевірки…'}</div>}</div></div></section>

  <section className="pricing" id="pricing"><div className="wrap"><div className="sectiontitle center"><span>03 — PRICING</span><h2>Платіть лише за ясність,<br/>яка потрібна перед покупкою.</h2></div><div className="plans three"><article className="freePlan"><header className="planCardHeader"><span>SIFT FREE</span></header><h3>$0</h3><div className="planPriceApprox">Безкоштовно</div><p>Почніть із короткої перевірки перед оплатою.</p><ul><li><Check/>3 перевірки на місяць</li><li><Check/>Clarity Score і вердикт</li><li><X/>Лише 2 умови з доказами</li><li><X/>Переклад доступний у платному плані</li></ul><button onClick={()=>user?setDashboard(true):(changeAuthMode('signup'),setPay(true))}>{user?'Відкрити Dashboard':'Почати безкоштовно'}</button></article><article className="onePlan"><header className="planCardHeader"><span>ONE SIFT</span></header><h3>$1.49</h3><div className="planPriceApprox">одноразово · за один повний звіт</div><p>Для однієї важливої покупки.</p><ul><li><Check/>Один повний звіт</li><li><Check/>Усі знайдені докази</li><li><Check/>AI-переклад українською</li><li><Check/>Збереження у вашій історії</li></ul><button onClick={()=>{setCheckoutMessage('');openCheckout('one')}}>Купити · $1.49</button></article><article className="pro"><header className="planCardHeader"><span>SIFT PRO</span><div className="popular">ПОВНИЙ ДОСТУП</div></header><h3>$6.90<small>/ місяць</small></h3><div className="planPriceApprox">щомісячно · скасуйте будь-коли</div><p>Усі перевірки, докази й переклади в одному тарифі. Скасуйте будь-коли в Dashboard.</p><ul><li><Check/>Необмежені перевірки</li><li><Check/>AI-переклад кожного доказу</li><li><Check/>Повна історія звітів</li><li><Check/>Доступ з усіх ваших пристроїв</li></ul><button onClick={()=>{setCheckoutMessage('');openCheckout('pro')}}>Підписатися · $6.90 / місяць</button></article></div><p className="priceNote">Ціни вказано в USD. WayForPay покаже доступну валюту й остаточну суму перед підтвердженням.</p></div></section>

  <section className="cta"><div className="wrap"><div className="ctaCopy"><span><ShieldCheck size={16}/> ПЕРЕД ТИМ, ЯК ПЛАТИТИ</span><h2>Одна перевірка.<br/><em>Чотири чіткі відповіді.</em></h2><p>Sift не вирішує за вас. Він показує саме те, що потрібно знати до натискання кнопки оплати.</p><button onClick={()=>document.querySelector<HTMLInputElement>('.inputrow input')?.focus()}>Перевірити посилання <ArrowRight/></button></div><div className="ctaChecklist"><article><span>01</span><div><b>Скільки коштуватиме насправді?</b><p>Разом із податками, комісіями та наступними списаннями.</p></div><CircleDollarSign/></article><article><span>02</span><div><b>Коли спишуть гроші знову?</b><p>Точна умова продовження і тривалість платного плану.</p></div><Clock3/></article><article><span>03</span><div><b>Чи можна повернути оплату?</b><p>Вікно повернення, винятки та останній безпечний день.</p></div><BadgeCheck/></article><article><span>04</span><div><b>Як реально скасувати?</b><p>Онлайн, листом, дзвінком — і які обмеження встановлено.</p></div><X/></article></div></div></section>
  <footer className="siteFooter"><div className="footerTop wrap"><div className="footerBrand"><a className="logo" href="#top" aria-label="Sift — на початок"><span><ScanSearch size={18}/></span>SIFT<sup>®</sup></a><p>Зрозумілі умови покупки<br/>до того, як ви заплатите.</p></div><button type="button" className="footerScanButton" onClick={()=>document.querySelector<HTMLInputElement>('.inputrow input')?.focus()}>Перевірити посилання <ArrowRight size={16}/></button></div><nav className="footerMain wrap" aria-label="Навігація внизу сторінки"><details className="footerColumn" open><summary>ПРОДУКТ <ChevronRight size={15}/></summary><div className="footerColumnLinks"><a href="#how">Як працює</a><a href="#pricing">Тарифи</a><a href="#top">Перевірити умови</a></div></details><details className="footerColumn" open><summary>DASHBOARD <ChevronRight size={15}/></summary><div className="footerColumnLinks"><Link href="/dashboard">Мої звіти</Link><a href="#usecases">Історія пристрою</a><Link href="/compare">Порівняти пропозиції</Link></div></details><details className="footerColumn" open><summary>МОЖЛИВОСТІ <ChevronRight size={15}/></summary><div className="footerColumnLinks"><a href="#top">Аналіз умов покупки</a><a href="#top">Переклад доказів</a><Link href="/api-docs">Публічний API</Link><Link href="/dashboard/integrations">API та Telegram інтеграції</Link></div></details><details className="footerColumn" open><summary>ПУБЛІЧНИЙ ІНДЕКС <ChevronRight size={15}/></summary><div className="footerColumnLinks"><Link href="/domains">Індекс доменів</Link><Link href="/domains/methodology">Методологія</Link><Link href="/domains/respond">Відповідь власника сайту</Link></div></details><details className="footerColumn" open><summary>ДОКУМЕНТИ Й ДОПОМОГА <ChevronRight size={15}/></summary><div className="footerColumnLinks"><Link href="/privacy">Приватність</Link><Link href="/terms">Умови користування</Link><Link href="/refund">Повернення</Link><a href="mailto:support@sift.app">Підтримка · support@sift.app</a></div></details></nav><div className="footerBottom wrap"><span>© 2026 Sift · Умови покупки — зрозуміло до оплати.</span><AnalyticsSettingsButton/><a className="floatingTopButton" href="#top" aria-label="Повернутися на початок сторінки"><span><ArrowUp size={16}/></span><b>Нагору</b></a></div></footer>

  <AnimatePresence>{dashboard&&<motion.div className="overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={()=>setDashboard(false)}><motion.div className="dashboardModal" role="dialog" aria-modal="true" aria-labelledby="dashboard-modal-title" tabIndex={-1} ref={dashboardDialogRef} initial={{scale:.96,y:20}} animate={{scale:1,y:0}} exit={{scale:.96}} onMouseDown={e=>e.stopPropagation()}><header><div><span className="modalIcon"><ScanSearch/></span><div><small>MY SIFT DASHBOARD</small><h2 id="dashboard-modal-title">{user?.email}</h2></div></div><button className="close" aria-label="Закрити dashboard" onClick={()=>setDashboard(false)}><X/></button></header><div className="accountStats"><article><small>ТАРИФ</small><b>{access.plan==='pro'?'Sift Pro':access.plan==='one'?'One Sift':'Free'}</b><span>{access.testMode?'TEST MODE':'ACTIVE'}</span></article><article><small>ВИКОРИСТАНО</small><b>{access.used} <em>/ {access.limit===999?'∞':access.limit}</em></b><span>Цього місяця</span></article><article><small>ІСТОРІЯ</small><b>{history.length}</b><span>Збережених звітів</span></article></div>{access.plan==='free'&&<div className="upgradeBanner"><LockKeyhole/><div><b>Free показує лише базовий результат</b><p>Відкрийте переклад, докази та повні звіти.</p></div><button onClick={()=>{setDashboard(false);openCheckout('pro')}}>Спробувати Pro</button></div>}<section className="accountHistory"><header><div><small>SCAN HISTORY</small><h3>Ваші реальні перевірки</h3></div><button onClick={()=>{setDashboard(false);document.querySelector<HTMLInputElement>('.inputrow input')?.focus()}}>+ Нова перевірка</button></header>{history.length?history.map((item,i)=>{const x=item.result;return <button className="historyRow" key={item.id||i} onClick={()=>openReport(x)}><span className={`historyScore ${x.score<55?'low':x.score<80?'mid':'high'}`}>{x.score}</span><div><b>{x.title}</b><small>{x.host} · {formatHistoryDate(item.createdAt)}</small></div><strong>{x.prices?.[0]||'Без ціни'}</strong><ChevronRight/></button>}):<div className="historyEmpty"><FileSearch/><b>Історія порожня</b><p>Виконайте першу перевірку — звіт з’явиться тут.</p></div>}</section><footer><button onClick={logout}>Вийти з акаунта</button>{access.expiresAt&&<span>Тестовий доступ до {new Date(access.expiresAt).toLocaleDateString('uk-UA')}</span>}</footer></motion.div></motion.div>}</AnimatePresence>

  <AnimatePresence>
   {checkout&&<motion.div className="overlay checkoutOverlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={()=>setCheckout(null)}>
    <motion.div className="checkoutModal" role="dialog" aria-modal="true" aria-labelledby="checkout-modal-title" tabIndex={-1} ref={checkoutDialogRef} initial={{scale:.96,y:14}} animate={{scale:1,y:0}} exit={{scale:.97,y:8}} onMouseDown={event=>event.stopPropagation()}>
     <button className="close" type="button" onClick={()=>setCheckout(null)} aria-label="Закрити"><X/></button>
     <span className={`checkoutBadge${checkoutTestMode?' isTest':''}`}>{checkoutTestMode?'ТЕСТОВА ОПЛАТА':'ЗАХИЩЕНА ОПЛАТА · WAYFORPAY'}</span>
     <small className="checkoutEyebrow">{checkout==='pro'?'ЩОМІСЯЧНА ПІДПИСКА':'РАЗОВА ПОКУПКА'}</small>
     <h2 id="checkout-modal-title">{checkout==='pro'?'Sift Pro':'One Sift'}</h2>
     <div className="checkoutPrice"><strong>{checkout==='pro'?'$6.90':'$1.49'}</strong><span>{checkout==='pro'?'/ місяць':'USD'}</span></div>
     <p className="checkoutCadence">{checkout==='pro'?'Автопродовження щомісяця до скасування':'Разова оплата · один повний звіт'}</p>
     <p className="checkoutDescription">{checkout==='pro'?'Необмежені перевірки, усі докази та переклади. Скасуйте підписку будь-коли в Dashboard.':'Повний звіт із доказами й перекладом для однієї важливої покупки.'} Тариф відкриється після підтвердження платежу.</p>
     {checkoutState!=='idle'&&<div className={`checkoutStatus ${checkoutState}`} role={checkoutState==='error'?'alert':'status'} aria-live="polite">
      <span className="checkoutStatusIcon" aria-hidden="true">{checkoutState==='redirecting'?<span className="checkoutSpinner"/>:checkoutState==='success'?<Check size={18}/>:checkoutState==='error'?<CircleAlert size={18}/>:<Clock3 size={18}/>}</span>
      <span><b>{checkoutState==='redirecting'?'Переходимо до WayForPay':checkoutState==='pending'?'Очікуємо підтвердження':checkoutState==='success'?'Оплату підтверджено': 'Не вдалося завершити оплату'}</b><small>{checkoutMessage}</small>{checkoutState==='success'&&<small className="checkoutUnlocked">{checkout==='pro'?'Відкрито Sift Pro: необмежені перевірки, повні докази й переклади.':'Відкрито один повний звіт One Sift.'}</small>}</span>
     </div>}
     {(checkoutState==='idle'||checkoutState==='error')&&<div className="checkoutLegalChecks" aria-label="Обов’язкові згоди">
      <label className="legalCheckbox"><input type="checkbox" checked={checkoutTermsAccepted} onChange={event=>setCheckoutTermsAccepted(event.target.checked)}/><span>Приймаю <a href="/terms" target="_blank" rel="noreferrer">Умови користування</a> та прошу почати надання послуги одразу після оплати.</span></label>
      <label className="legalCheckbox"><input type="checkbox" checked={checkoutPrivacyAccepted} onChange={event=>setCheckoutPrivacyAccepted(event.target.checked)}/><span>Ознайомився(-лася) з <a href="/privacy" target="_blank" rel="noreferrer">Політикою приватності</a>.</span></label>
      <label className="legalCheckbox"><input type="checkbox" checked={checkoutRefundAccepted} onChange={event=>setCheckoutRefundAccepted(event.target.checked)}/><span>Погоджуюся з <a href="/refund" target="_blank" rel="noreferrer">Політикою повернення</a> та умовами для цифрової послуги.</span></label>
     </div>}
     {(checkoutState==='idle'||checkoutState==='error'||checkoutState==='redirecting')&&<button className="confirmCheckout" type="button" disabled={checkoutBusy||!checkoutTermsAccepted||!checkoutPrivacyAccepted||!checkoutRefundAccepted} onClick={()=>void startCheckout()}>{checkoutState==='redirecting'?<><span className="checkoutSpinner"/>Переходимо до WayForPay…</>:checkoutState==='error'?'Спробувати ще раз':user?'Перейти до WayForPay':'Увійти для продовження'}{checkoutState!=='redirecting'&&<ArrowRight size={16}/>}</button>}
     {checkoutState==='pending'&&<button className="confirmCheckout" type="button" disabled={checkoutBusy} onClick={()=>void refreshPaymentStatus()}>{checkoutBusy?<><span className="checkoutSpinner"/>Перевіряємо…</>:'Перевірити статус платежу'}{!checkoutBusy&&<ArrowRight size={16}/>}</button>}
     {checkoutState==='success'&&<button className="confirmCheckout checkoutSuccessAction" type="button" onClick={()=>location.assign('/dashboard')}>Відкрити Dashboard <ArrowRight size={16}/></button>}
     {checkoutState==='error'&&<button className="checkoutBackAction" type="button" onClick={()=>setCheckout(null)}>Закрити вікно</button>}
     <div className="checkoutFootnote"><LockKeyhole size={14}/><span>Дані картки вводяться у WayForPay. Sift не отримує й не зберігає їх.</span></div>
    </motion.div>
   </motion.div>}
  </AnimatePresence>

  <AnimatePresence>
    {pay&&!user&&<motion.div className="overlay authOverlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={()=>setPay(false)}>
    <motion.div className="modal authModal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" tabIndex={-1} ref={authDialogRef} initial={{scale:.96,y:14}} animate={{scale:1,y:0}} exit={{scale:.97,y:8}} onMouseDown={event=>event.stopPropagation()}>
     <button className="close" onClick={()=>setPay(false)} aria-label="Закрити"><X/></button>
     {user?(
      <section className="authAccountCard">
       <span className="modalIcon"><BadgeCheck/></span>
       <small className="authEyebrow">YOUR SIFT ACCOUNT</small>
       <h2 id="auth-modal-title">Ваш акаунт Sift</h2>
       <div className="authIdentity"><Mail/><span><small>Email</small><b>{user.email}</b></span><strong className={user.emailVerified?'verified':'unverified'}>{user.emailVerified?'Підтверджено':'Не підтверджено'}</strong></div>
       <p>Ваші звіти зберігаються в персональній історії та синхронізуються між пристроями.</p>
       <div className="authPlanCard"><small>ВАШ ПЛАН</small><b>{access.plan==='pro'?'Sift Pro':access.plan==='one'?'One Sift':'Sift Free'}</b><span>{access.plan==='pro'?'Повний доступ до можливостей Sift':access.plan==='one'?'Один повний звіт':'Базові перевірки перед оплатою'}</span></div>
       {!user.emailVerified&&<EmailVerificationNotice message={verificationNotice} onResend={()=>void resendVerification()} busy={signup==='loading'}/>}
       {authFieldErrors.form&&<div className="authFormError" role="alert"><CircleAlert size={16}/><span>{authFieldErrors.form}</span></div>}
       <button className="accountLogout" onClick={()=>void logout()} disabled={signup==='loading'}>{signup==='loading'?'Зачекайте…':'Вийти з акаунта'}</button>
      </section>
     ):(
      <>
       <span className="modalIcon"><LockKeyhole/></span>
       <small className="authEyebrow">SIFT ACCOUNT</small>
       <h2 id="auth-modal-title">{authMode==='signup'?'Створіть акаунт Sift':'Вітаємо у Sift'}</h2>
       <p className="authLead">{authMode==='signup'?'Зберігайте перевірки та відкривайте історію з будь-якого пристрою.':'Увійдіть, щоб продовжити до своєї історії перевірок.'}</p>
       <div className="authSegment" role="group" aria-label="Виберіть вхід або реєстрацію">
        <button type="button" aria-pressed={authMode==='login'} className={authMode==='login'?'active':''} onClick={()=>changeAuthMode('login')}>Увійти</button>
        <button type="button" aria-pressed={authMode==='signup'} className={authMode==='signup'?'active':''} onClick={()=>changeAuthMode('signup')}>Реєстрація</button>
       </div>
       <form className="authForm" noValidate onSubmit={event=>{event.preventDefault();void authenticate()}}>
        <label htmlFor="auth-email">Email</label>
        <input id="auth-email" className="authInput" value={email} onChange={event=>{setEmail(event.target.value);setAuthFieldErrors(current=>({...current,email:undefined,form:undefined}))}} type="email" autoComplete="email" inputMode="email" maxLength={254} aria-required="true" aria-invalid={Boolean(authFieldErrors.email)} aria-describedby={authFieldErrors.email?'auth-email-error':undefined} placeholder="you@email.com"/>
        {authFieldErrors.email&&<small id="auth-email-error" className="authFieldError" role="alert"><CircleAlert size={15}/>{authFieldErrors.email}</small>}
        <label htmlFor="auth-password">Пароль</label>
        <div className="authPasswordField">
         <input id="auth-password" className="authInput" value={password} onChange={event=>{setPassword(event.target.value);setAuthFieldErrors(current=>({...current,password:undefined,form:undefined}))}} type={showPassword?'text':'password'} autoComplete={authMode==='signup'?'new-password':'current-password'} minLength={authMode==='signup'?8:1} maxLength={1024} aria-required="true" aria-invalid={Boolean(authFieldErrors.password)} aria-describedby={authFieldErrors.password?'auth-password-error':authMode==='signup'?'auth-password-hint':undefined} placeholder="Введіть пароль"/>
         <button type="button" className="authPasswordToggle" aria-label={showPassword?'Приховати пароль':'Показати пароль'} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button>
        </div>
        {authMode==='signup'&&<small id="auth-password-hint" className="authHint">Мінімум 8 символів</small>}
        {authFieldErrors.password&&<small id="auth-password-error" className="authFieldError" role="alert"><CircleAlert size={15}/>{authFieldErrors.password}</small>}
        {authMode==='signup'&&<div className="authChallengeRow"><TurnstileWidget action="signup" onToken={token=>{setTurnstileToken(token);if(token)setAuthFieldErrors(current=>({...current,turnstile:undefined}))}} resetVersion={turnstileReset}/></div>}
        {authFieldErrors.turnstile&&<small className="authFieldError" role="alert"><CircleAlert size={15}/>{authFieldErrors.turnstile}</small>}
        {authMode==='signup'&&<label className="legalCheckbox signupLegalCheckbox"><input type="checkbox" aria-describedby={authFieldErrors.consent?'auth-consent-error':undefined} checked={signupLegalAccepted} onChange={event=>{setSignupLegalAccepted(event.target.checked);if(event.target.checked)setAuthFieldErrors(current=>({...current,consent:undefined}))}}/><span>Погоджуюся з <a href="/terms" target="_blank" rel="noreferrer">Умовами користування</a> та <a href="/privacy" target="_blank" rel="noreferrer">Політикою приватності</a>.</span></label>}
        {authFieldErrors.consent&&<small id="auth-consent-error" className="authFieldError" role="alert"><CircleAlert size={15}/>{authFieldErrors.consent}</small>}
        {authFieldErrors.form&&<div className="authFormError" role="alert"><CircleAlert size={16}/><span>{authFieldErrors.form}</span></div>}
        <button className="authSubmit" type="submit" disabled={signup==='loading'}>{signup==='loading'?'Зачекайте…':authMode==='signup'?'Створити акаунт':'Увійти'} <ArrowRight size={15}/></button>
       </form>
       {authMode==='login'&&<a className="forgotPasswordLink" href="/forgot-password">Забули пароль?</a>}
       <footer className="authSecurity"><ShieldCheck size={14}/><span>Паролі захищені PBKDF2-хешуванням; сесія недоступна JavaScript.</span></footer>
      </>
     )}
    </motion.div>
   </motion.div>}
  </AnimatePresence>
 {cancellationReport&&<CancellationKitDialog report={cancellationReport} onClose={()=>setCancellationReport(null)}/>}
  </main>
}
