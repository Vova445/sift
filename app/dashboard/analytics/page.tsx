'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, CreditCard, LockKeyhole, RefreshCw, ScanSearch, ShieldCheck, UserRoundPlus, Users } from 'lucide-react';
import AchievementExperiments from './AchievementExperiments';
import './analytics.css';
import AccessGate from '../AccessGate';

type Funnel = { visit: number; analyze: number; signup: number; paywall: number; pay: number };
type Maturity = { mature: boolean; observations: number; minimumObservations: number; observedDays: number; minimumDays: number };
type AnalyticsData = { funnel?: Partial<Funnel>; metrics?: Partial<Record<keyof Funnel, Maturity>>; maturity?: Maturity; periodDays?: number; generatedAt?: string };
const steps: { key: keyof Funnel; label: string; hint: string; Icon: typeof Users }[] = [
  { key: 'visit', label: 'Візит', hint: 'Сесія згоди на вимірювання', Icon: Users },
  { key: 'analyze', label: 'Аналіз', hint: 'Успішно отримали звіт', Icon: ScanSearch },
  { key: 'signup', label: 'Реєстрація', hint: 'Акаунт створено', Icon: UserRoundPlus },
  { key: 'paywall', label: 'Checkout', hint: 'Почали оформлення оплати', Icon: CalendarDays },
  { key: 'pay', label: 'Оплата', hint: 'Платіж підтверджено', Icon: CreditCard },
];

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/analytics/funnel', { cache: 'no-store' });
      const body = await response.json() as AnalyticsData & { error?: string };
      if (!response.ok) {
        setAccessDenied(response.status === 401 || response.status === 403);
        throw new Error(body.error || 'Аналітика недоступна.');
      }
      setAccessDenied(false);
      setData(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося завантажити воронку.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const funnel = data?.funnel;
  const largest = Math.max(typeof funnel?.visit==='number'?funnel.visit:0, 1);
  const conversions = useMemo(() => steps.map((step, index) => ({
    key: step.key,
    percent: index === 0 ? 100 : funnel && typeof funnel[steps[index - 1]!.key]==='number' && funnel[steps[index - 1]!.key]! > 0 && typeof funnel[step.key]==='number' ? Math.round(funnel[step.key]! / funnel[steps[index - 1]!.key]! * 100) : null,
  })), [funnel]);

  if(accessDenied)return <AccessGate variant="restricted"/>;

  return <main className="funnelPage"><div className="funnelShell">
    <header className="funnelTop"><a href="/dashboard"><ArrowLeft />До Dashboard</a><span><ShieldCheck />ПРИВАТНА ВОРОНКА</span></header>
    <section className="funnelIntro"><div><small>PRODUCT ANALYTICS · {data?.periodDays || 30} ДНІВ</small><h1>Шлях від візиту<br /><em>до оплати.</em></h1><p>Лише агреговані етапи від користувачів, які дали згоду. Без email, URL сторінок і рекламних трекерів.</p></div><button className="funnelRefresh" onClick={() => void load()} disabled={busy}><RefreshCw className={busy ? 'funnelSpin' : ''} />Оновити</button></section>
    {error ? <section className={`funnelEmpty ${accessDenied ? 'isDenied' : ''}`} role="alert">{accessDenied ? <LockKeyhole /> : <ShieldCheck />}<b>{accessDenied ? 'Доступ до аналітики обмежений' : error}</b><p>{accessDenied ? 'Цей розділ доступний лише адміністраторам.' : 'Перевірте налаштування сервера й повторіть спробу.'}</p>{accessDenied ? <a href="/dashboard">До Dashboard <ArrowRight /></a> : <button onClick={() => void load()}>Спробувати знову <ArrowRight /></button>}</section> : <>
      {data && data.maturity && !data.maturity.mature && <aside className="funnelMaturityNotice" role="status"><CalendarDays /><div><b>Дані ще не дозріли</b><span>Потрібно щонайменше 14 днів і 50 згоджених сесій. Зараз: {data.maturity.observedDays}/{data.maturity.minimumDays} днів · {data.maturity.observations}/{data.maturity.minimumObservations} сесій. До порогу показники попередні.</span></div></aside>}
      <section className="funnelSteps" aria-label="Конверсійна воронка">{steps.map((step, index) => {
        const value = funnel?.[step.key];
        const Icon = step.Icon;
        const maturity = data?.metrics?.[step.key];
        const previous = index > 0 && funnel ? funnel[steps[index - 1]!.key] : undefined;
        const lost = typeof previous==='number'&&typeof value==='number'?Math.max(0,previous-value):null;
        return <article className="funnelStep" key={step.key}>
          <div className="funnelStepHead"><span className="funnelStepIcon"><Icon /></span><small>0{index + 1}</small></div>
          <div className="funnelStepValue">{busy||typeof value!=='number'?'—':value}</div><b>{step.label}</b><p>{step.hint}</p>
          <div className="funnelBarTrack"><span style={{ width: `${typeof value==='number'?Math.max(value ? 8 : 0, Math.round(value / largest * 100)):0}%` }} /></div>
          <div className="funnelStepFoot"><span>{index ? conversions[index]?.percent===null?'—':`${conversions[index]?.percent}% з попереднього` : typeof funnel?.visit==='number'?'100% базових сесій':'—'}{index > 0&&lost!==null ? ` · −${lost}` : ''}</span></div>
          {maturity && <span className={`funnelMetricMaturity ${maturity.mature ? 'isMature' : 'isImmature'}`}>{maturity.mature ? 'Вибірка дозріла' : `Попередньо · n=${maturity.observations}`}</span>}
        </article>;
      })}</section>
    </>}
    <AchievementExperiments />
    <footer className="funnelFoot"><span><ShieldCheck />Псевдонімізовані сесії · автоматичне видалення через 90 днів</span>{data?.generatedAt&&<span>Оновлено {new Date(data.generatedAt).toLocaleString('uk-UA')}</span>}</footer>
  </div></main>;
}
