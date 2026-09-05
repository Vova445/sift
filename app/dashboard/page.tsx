'use client';

import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,ArrowRight,BadgeCheck,CalendarClock,Check,CircleDollarSign,ExternalLink,FileSearch,LockKeyhole,LogOut,ScanSearch,ShieldCheck,Sparkles,X} from 'lucide-react';
import './dashboard.css';
import './dashboard-header.css';

type Finding={title:string;summary:string;evidence:string;severity:'good'|'medium'|'high'};
type Report={id:string;url:string;host:string;title:string;score:number;prices:string[];findings:Finding[];wordCount:number;verdict:string;lockedCount?:number};
type Access={plan:'free'|'one'|'pro';credits:number;used:number;limit:number;testMode?:boolean;expiresAt?:string};
type Account={user:{id:string;email:string};access:Access;history:{id:string;createdAt:string;result:Report}[]};

const planName=(plan:Access['plan'])=>plan==='pro'?'Sift Pro':plan==='one'?'One Sift':'Sift Free';

export default function DashboardPage(){
 const[data,setData]=useState<Account|null>(null),[error,setError]=useState(''),[selected,setSelected]=useState<Report|null>(null),[filter,setFilter]=useState('');
 useEffect(()=>{const deviceId=localStorage.getItem('sift-device-id')||'';fetch(`/api/account?deviceId=${encodeURIComponent(deviceId)}`).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error);setData(body)}).catch(e=>setError(e.message||'Не вдалося завантажити профіль'))},[]);
 const history=useMemo(()=>data?.history.filter(x=>`${x.result.title} ${x.result.host}`.toLowerCase().includes(filter.toLowerCase()))||[],[data,filter]);
 async function logout(){await fetch('/api/auth/logout',{method:'POST'});location.assign('/')}
 if(error)return <main className="dashPage"><section className="dashGate"><LockKeyhole/><h1>Увійдіть у Sift</h1><p>{error}</p><a href="/">Повернутися та увійти <ArrowRight/></a></section></main>;
 if(!data)return <main className="dashPage"><section className="dashGate"><span className="spin darkSpin"/><p>Завантажуємо ваші реальні дані…</p></section></main>;
 const a=data.access,total=data.history.length,avg=total?Math.round(data.history.reduce((n,x)=>n+x.result.score,0)/total):0,risks=data.history.reduce((n,x)=>n+x.result.findings.length,0);
 return <main className="dashPage">
  <aside className="dashSide"><a className="dashLogo" href="/"><span><ScanSearch/></span>SIFT</a><nav><a className="active" href="/dashboard"><FileSearch/>Огляд</a><a href="/#top"><ScanSearch/>Нова перевірка</a><a href="/#pricing"><Sparkles/>Тарифи</a></nav><div className="dashSidePlan"><small>ПОТОЧНИЙ ПЛАН</small><b>{planName(a.plan)}</b><span>{a.plan==='pro'?'Необмежені перевірки':a.plan==='one'?`${a.credits} повний звіт доступний`:`${Math.max(0,3-a.used)} безкоштовні перевірки`}</span>{a.plan!=='pro'&&<a href="/#pricing">Покращити план <ArrowRight/></a>}</div><button onClick={logout}><LogOut/>Вийти</button></aside>
  <div className="dashContent"><div className="dashTopbar"><a href="/"><ArrowLeft/>Повернутися на головну</a><div><span className={`topPlan ${a.plan}`}>{planName(a.plan)}</span><button onClick={logout}><LogOut/>Вийти</button></div></div><header className="dashHeader"><div><small>MY SIFT</small><h1>Покупки без неприємних сюрпризів.</h1><p>{data.user.email}</p></div><a href="/#top"><ScanSearch/>Нова перевірка</a></header>
   <section className="dashStats"><article><span><FileSearch/></span><div><small>ЗВІТІВ</small><b>{total}</b><p>Збережено в акаунті</p></div></article><article><span><ShieldCheck/></span><div><small>СЕРЕДНЯ ЯСНІСТЬ</small><b>{avg}<em>/100</em></b><p>За всіма перевірками</p></div></article><article><span><BadgeCheck/></span><div><small>УМОВ ЗНАЙДЕНО</small><b>{risks}</b><p>Ціни, renewal і refund</p></div></article></section>
   {a.plan==='free'&&<section className="dashUpgrade"><div><LockKeyhole/><span><small>FREE PLAN</small><b>Повні докази та переклад зараз заблоковані</b><p>One Sift відкриває один важливий звіт, Pro — усю історію та необмежені перевірки.</p></span></div><a href="/#pricing">Порівняти плани <ArrowRight/></a></section>}
   <section className="dashHistory"><header><div><small>SCAN LIBRARY</small><h2>Історія перевірок</h2></div><input aria-label="Пошук в історії" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Пошук за сайтом…"/></header>
    {history.length?<div className="dashTable">{history.map(x=><button key={x.id} onClick={()=>setSelected(x.result)}><span className={`dashScore s${x.result.score<55?'Low':x.result.score<80?'Mid':'High'}`}>{x.result.score}</span><span><b>{x.result.title}</b><small>{x.result.host} · {new Date(x.createdAt).toLocaleDateString('uk-UA')}</small></span><span className="dashPrice">{x.result.prices?.[0]||'Ціну не знайдено'}</span><span>{x.result.findings.length} умов</span><ArrowRight/></button>)}</div>:<div className="dashEmpty"><FileSearch/><b>{filter?'Нічого не знайдено':'Ще немає перевірок'}</b><p>{filter?'Змініть запит.':'Додайте URL — перший звіт автоматично збережеться тут.'}</p><a href="/#top">Створити перший звіт</a></div>}
   </section>
   <section className="dashValue"><article><CalendarClock/><b>Пам’ятайте про дедлайни</b><p>У звітах зберігаються умови повернення та скасування — відкрийте їх перед завершенням trial.</p></article><article><CircleDollarSign/><b>Порівнюйте реальну ціну</b><p>Перевіряйте не лише перший платіж, а й наступні списання та автопродовження.</p></article><article><Check/><b>Приймайте рішення з доказами</b><p>Кожен висновок прив’язаний до фактичного фрагмента сторінки продавця.</p></article></section>
  </div>
  {selected&&<div className="reportDrawer" onMouseDown={()=>setSelected(null)}><section onMouseDown={e=>e.stopPropagation()}><header><div><small>SAVED REPORT</small><h2>{selected.title}</h2><a href={selected.url} target="_blank" rel="noreferrer">{selected.host}<ExternalLink/></a></div><button onClick={()=>setSelected(null)}><X/></button></header><div className="drawerScore"><b>{selected.score}<small>/100</small></b><span><small>ВЕРДИКТ</small><strong>{selected.verdict}</strong></span></div>{selected.prices?.length>0&&<div className="drawerPrices"><small>ЗНАЙДЕНІ ЦІНИ</small><div>{selected.prices.map((p,i)=><b key={i}>{p}</b>)}</div></div>}<div className="drawerFindings">{selected.findings.map((f,i)=><article key={i}><span className={f.severity}/><div><small>{f.title}</small><h3>{f.summary}</h3><p>{f.evidence}</p></div></article>)}</div>{selected.lockedCount?<div className="drawerLocked"><LockKeyhole/>Ще {selected.lockedCount} умов приховано вашим планом.</div>:null}</section></div>}
 </main>
}
