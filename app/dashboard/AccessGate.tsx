'use client';

import {useEffect,useSyncExternalStore,type MouseEvent as ReactMouseEvent} from 'react';
import Link from '../NativeLink';
import {ArrowRight,Check,LockKeyhole,ShieldCheck,UnlockKeyhole} from 'lucide-react';
import './access-gate.css';

export type AccessGateVariant='dashboard'|'integrations'|'space'|'restricted'|'pro';
type GateCopy={eyebrow:string;title:string;accent:string;description:string;benefits:string[];cardEyebrow:string;cardTitle:string;cardDescription:string;trust:string;restricted?:boolean;pro?:boolean};

const copy:Record<AccessGateVariant,GateCopy>={
  dashboard:{eyebrow:'YOUR PURCHASE COMMAND CENTER',title:'Поверніться до',accent:'своїх перевірок.',description:'Умови, рішення та важливі дати залишаються під рукою на кожному пристрої.',benefits:['Збережені звіти','Pro-планувальник','AI-переклад'],cardEyebrow:'SECURE ACCOUNT ACCESS',cardTitle:'Ваша історія чекає.',cardDescription:'Увійдіть, щоб побачити свої перевірки й продовжити з того місця, де зупинилися.',trust:'Захищена HttpOnly-сесія · без банківських даних'},
  integrations:{eyebrow:'SIFT CONNECTED TOOLS',title:'Підключіть Sift до',accent:'Telegram і API.',description:'Отримуйте звіти у звичному робочому процесі та керуйте доступом до своїх інтеграцій.',benefits:['Telegram-бот','API-ключі','Ліміти й контроль'],cardEyebrow:'SECURE ACCOUNT ACCESS',cardTitle:'Керуйте інтеграціями.',cardDescription:'Увійдіть у Sift, щоб підключити Telegram і створювати API-ключі.',trust:'Ключі захищені хешуванням · секрет показується один раз'},
  space:{eyebrow:'SHARED SIFT SPACE',title:'Керуйте підписками',accent:'разом.',description:'Плануйте спільні списання, розподіляйте відповідальність і тримайте домовленості в одному місці.',benefits:['Спільний календар','Watchlist','Запрошення'],cardEyebrow:'SECURE ACCOUNT ACCESS',cardTitle:'Відкрийте свій простір.',cardDescription:'Увійдіть, щоб переглянути спільний календар, список сервісів і запрошення.',trust:'Особисті звіти не відкриваються іншим учасникам'},
  restricted:{eyebrow:'PRIVATE SIFT AREA',title:'Закрита зона',accent:'лише для команди.',description:'Цей розділ містить інструменти підтримки, модерації або аналітики Sift.',benefits:['Доступ за allowlist','Захищені дані','Дії журналюються'],cardEyebrow:'RESTRICTED ACCESS',cardTitle:'Доступ за списком.',cardDescription:'Розділ доступний лише адміністраторам, яким надано доступ через allowlist.',trust:'Доступ перевіряється сервером для кожної дії',restricted:true},
  pro:{eyebrow:'SIFT PRO WORKSPACE',title:'Плануйте наперед',accent:'із повною ясністю.',description:'Тримайте дедлайни, зміни умов та важливі рішення в одному місці.',benefits:['Planner і календар','Щотижневий ToS diff','Email-нагадування'],cardEyebrow:'SIFT PRO',cardTitle:'Відкрийте повний доступ.',cardDescription:'Planner, календар і моніторинг змін умов доступні у Sift Pro.',trust:'Скасуйте будь-коли у Dashboard',pro:true},
};

const paths:Record<AccessGateVariant,string>={dashboard:'/dashboard',integrations:'/dashboard/integrations',space:'/dashboard/space',restricted:'/',pro:'/dashboard#planner'};
const subscribeToLocation=(callback:()=>void)=>{window.addEventListener('popstate',callback);window.addEventListener('hashchange',callback);return()=>{window.removeEventListener('popstate',callback);window.removeEventListener('hashchange',callback)}};
const getCurrentPath=()=>`${window.location.pathname}${window.location.search}`;

export default function AccessGate({variant,compact=false}:{variant:AccessGateVariant;compact?:boolean}){
  const currentPath=useSyncExternalStore(subscribeToLocation,getCurrentPath,()=>paths[variant]);
  const spaceInvite=variant==='space'&&new URLSearchParams(currentPath.split('?')[1]||'').has('invite');
  const content=variant==='space'&&spaceInvite?{...copy.space,title:'Вас запросили до',accent:'спільного простору.',cardTitle:'Прийміть запрошення.',cardDescription:'Увійдіть або створіть акаунт, щоб перейти до спільного простору.'}:copy[variant];
  useEffect(()=>{
    if(variant==='space'){
      sessionStorage.setItem('sift-auth-next',currentPath);
    }
  },[variant,currentPath]);
  const returnPath=variant==='space'?currentPath:paths[variant];
  const loginHref=`/?login=1&next=${encodeURIComponent(returnPath)}`;
  const signupHref=`/?signup=1&next=${encodeURIComponent(returnPath)}`;
  const continueAuth=(mode:'login'|'signup')=>(event:ReactMouseEvent<HTMLAnchorElement>)=>{if(variant!=='space')return;event.preventDefault();const path=`${window.location.pathname}${window.location.search}`;sessionStorage.setItem('sift-auth-next',path);window.location.assign(`/?${mode}=1&next=${encodeURIComponent(path)}`)};
  return <main id={compact?'planner':undefined} className={`accessGateRoot${compact?' isCompact':''}${content.restricted?' isRestricted':''}${content.pro?' isPro':''}`}>
    <section className="accessGateHero"><div className="accessGateHeroInner">
      <Link className="accessGateBrand" href="/" aria-label="Sift — на головну"><span>S</span><b>SIFT</b><small>KNOW BEFORE YOU PAY</small></Link>
      <div className="accessGateCopy"><small className="accessGateEyebrow">{content.eyebrow}</small><h1>{content.title}<br/><em>{content.accent}</em></h1><p>{content.description}</p><div className="accessGatePills">{content.benefits.map(item=><span key={item}><Check aria-hidden="true"/>{item}</span>)}</div></div>
    </div></section>
    <section className="accessGateCard" aria-labelledby="access-gate-title">
      <span className="accessGateLock" aria-hidden="true"><LockKeyhole className="accessGateLockClosed"/><UnlockKeyhole className="accessGateLockOpen"/></span>
      <small className="accessGateCardEyebrow">{content.cardEyebrow}</small><h2 id="access-gate-title">{content.cardTitle}</h2><p>{content.cardDescription}</p>
      {content.restricted?<Link className="accessGatePrimary" href="/">На головну <ArrowRight aria-hidden="true"/></Link>:content.pro?<><Link className="accessGatePrimary" href="/#pricing">Відкрити Pro <ArrowRight aria-hidden="true"/></Link><Link className="accessGateSecondary" href="/#pricing">Порівняти тарифи</Link></>:<><Link className="accessGatePrimary" href={loginHref} onClick={continueAuth('login')}>{variant==='space'?'Увійти до простору':'Увійти до Sift'} <ArrowRight aria-hidden="true"/></Link><Link className="accessGateSecondary" href={signupHref} onClick={continueAuth('signup')}>Створити безкоштовний акаунт</Link></>}
      <footer className="accessGateTrust"><ShieldCheck aria-hidden="true"/><span>{content.trust}</span></footer>
    </section>
    {!compact&&<section className="accessGateTeaser" aria-label="Приклад інтерфейсу Sift"><div className="accessGateTeaserHead"><span>ПРИКЛАД ІНТЕРФЕЙСУ</span><small>Дані прикладу, не з вашого акаунта</small></div><div className="accessGateStats"><article><small>ЗВІТИ</small><b>—</b></article><article><small>СЕРЕДНІЙ SCORE</small><b>—<em>/100</em></b></article></div><div className="accessGateRows"><div><i/><span><b>Звіт про підписку</b><small>Домен · дата перевірки</small></span><em>—</em></div><div><i/><span><b>Перевірка умов</b><small>Домен · дата перевірки</small></span><em>—</em></div><div><i/><span><b>Історія покупок</b><small>Домен · дата перевірки</small></span><em>—</em></div></div></section>}
  </main>;
}
