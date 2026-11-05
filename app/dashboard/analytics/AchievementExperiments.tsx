'use client';

import { useEffect, useState } from 'react';
import { BarChart3, CircleHelp, Eye, EyeOff, RefreshCw, ShieldCheck } from 'lucide-react';
import { analyticsComparisonStatus } from '../../../lib/analytics-statistics.js';

type Metric = { eligible: number; returned?: number; converted?: number; rate: number | null; interval95: { low: number; high: number } | null; mature: boolean; minimumSample: number };
type Group = {
  variant: 'progress' | 'control'; assigned: number; earnedAfterAssignment: number; earnedRate: number | null; earnedInterval95: { low: number; high: number } | null; earnedMature: boolean;
  d7: Metric; d30: Metric; pro30: Metric;
};
type Comparison = { metric: 'earned' | 'd7' | 'd30' | 'pro30'; intervalsOverlap: boolean; hasIntervals: boolean };
type Summary = {
  experiment: { key: string; enabled: boolean; startedAt: string | null; daysRunning: number; reportDueAt: string | null; minimumArmSize: number; reportReady: boolean; updatedAt: string; maturity: { mature: boolean; observations: number; minimumObservations: number; observedDays: number; minimumDays: number } };
  badgeDistribution: { totalUsers: number; usersWithAnyBadge: number; usersWithAnyBadgeRate: number | null; maturity: { mature: boolean; observations: number; minimumObservations: number }; badges: Array<{ key: string; title: string; users: number; rate: number | null; mature: boolean; observations: number; minimumObservations: number }> };
  groups: Group[];
  comparisons: Comparison[];
  generatedAt: string;
};
type MetricKey = 'earned' | 'd7' | 'd30' | 'pro30';

const formatRate = (value: number | null) => value === null ? '—' : `${new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 }).format(value)}%`;
const formatInterval = (value: Metric['interval95']) => value ? `${formatRate(value.low)}–${formatRate(value.high)}` : 'поки немає інтервалу';
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value)) : 'ще не запускали';
const metricTitles: Record<MetricKey, string> = { earned: 'Отримали бейдж після призначення', d7: 'D7 повернення', d30: 'D30 повернення', pro30: 'Оплата Pro за 30 днів' };

function MaturityTag({ mature, sample, minimum }: { mature: boolean; sample: number; minimum: number }) {
  return <span className={`analyticsMaturityTag ${mature ? 'isMature' : 'isImmature'}`}>{mature ? 'Зріла вибірка' : `Мала вибірка · ${sample}/${minimum}`}</span>;
}

function WilsonCell({ rate, interval, numerator, denominator, mature }: { rate: number | null; interval: Metric['interval95']; numerator: number; denominator: number; mature: boolean }) {
  const lower = interval?.low ?? 0;
  const width = interval ? Math.max(1, interval.high - interval.low) : 0;
  return <div className="analyticsWilsonCell">
    <div className="analyticsWilsonValue"><b>{formatRate(rate)}</b><span>{numerator}/{denominator}</span></div>
    <div className={`analyticsWilsonTrack${interval ? '' : ' isEmpty'}`} role="img" aria-label={interval ? `95% інтервал Вілсона ${formatInterval(interval)}` : 'Інтервал ще не обчислено'}>
      {interval && <><i style={{ left: `${lower}%`, width: `${width}%` }} /><b style={{ left: `${rate ?? 0}%` }} /></>}
    </div>
    <small>95% ДІ {formatInterval(interval)}</small>
    <MaturityTag mature={mature} sample={denominator} minimum={50} />
  </div>;
}

export default function AchievementExperiments() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/analytics/achievements', { cache: 'no-store' });
      const body = await response.json() as Summary & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Аналітика досягнень недоступна.');
      setData(body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося завантажити метрики.'); }
    finally { setBusy(false); }
  }

  async function toggleExperiment() {
    if (!data) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/analytics/achievements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !data.experiment.enabled }) });
      const body = await response.json() as Summary & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Не вдалося змінити стан експерименту.');
      setData(body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося змінити стан експерименту.'); }
    finally { setSaving(false); }
  }

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);

  const progress = data?.groups.find(group => group.variant === 'progress');
  const control = data?.groups.find(group => group.variant === 'control');
  const getComparison = (metric: MetricKey) => data?.comparisons.find(item => item.metric === metric);
  const comparisonText = (metric: MetricKey) => {
    const comparison = getComparison(metric);
    const metricsMature = metric === 'earned' ? Boolean(progress?.earnedMature && control?.earnedMature) : Boolean(progress?.[metric].mature && control?.[metric].mature);
    const status = analyticsComparisonStatus({
      intervalsOverlap: comparison?.intervalsOverlap,
      hasIntervals: comparison?.hasIntervals,
      reportReady: data?.experiment.reportReady,
      metricsMature,
    });
    if (status === 'unproven') return 'Ефект не доведений';
    if (status === 'immature') return 'Дані ще не дозріли';
    if (status === 'insufficient') return 'Недостатньо даних для порівняння';
    return 'Інтервали не перекриваються. Різниця лишається спостережною, не доказом причинності.';
  };

  return <section className="achievementAnalytics" aria-labelledby="achievement-analytics-title">
    <header className="achievementAnalyticsHead"><div><small>PRODUCT ANALYTICS · BADGES</small><h2 id="achievement-analytics-title">Досягнення у цифрах</h2><p>Агреговані метрики акаунтів і добровільного A/B-тесту прогресу до нагород.</p></div><button type="button" className="funnelRefresh" onClick={() => void load()} disabled={busy || saving}><RefreshCw className={busy ? 'funnelSpin' : ''} />Оновити</button></header>
    {error && <p className="achievementAnalyticsError" role="alert">{error}</p>}
    {data && <>
      <div className="achievementAnalyticsOverview">
        <article><small>АКАУНТІВ</small><b>{data.badgeDistribution.totalUsers}</b><span>У загальній базі</span><MaturityTag mature={data.badgeDistribution.maturity.mature} sample={data.badgeDistribution.maturity.observations} minimum={data.badgeDistribution.maturity.minimumObservations} /></article>
        <article><small>МІНІМУМ 1 БЕЙДЖ</small><b>{formatRate(data.badgeDistribution.usersWithAnyBadgeRate)}</b><span>{data.badgeDistribution.usersWithAnyBadge} із {data.badgeDistribution.totalUsers} акаунтів</span><MaturityTag mature={data.badgeDistribution.maturity.mature} sample={data.badgeDistribution.maturity.observations} minimum={data.badgeDistribution.maturity.minimumObservations} /></article>
        <article><small>БЕЙДЖІВ У КАТАЛОЗІ</small><b>{data.badgeDistribution.badges.length}</b><span>Поточний каталог</span><MaturityTag mature={data.badgeDistribution.maturity.mature} sample={data.badgeDistribution.maturity.observations} minimum={data.badgeDistribution.maturity.minimumObservations} /></article>
      </div>

      <div className="achievementDistribution" aria-label="Розподіл бейджів">
        <div className="achievementAnalyticsSectionTitle"><div><BarChart3 aria-hidden="true" /><h3>Розподіл бейджів</h3></div><span>Частка від усіх акаунтів</span></div>
        <div className="achievementDistributionGrid">{data.badgeDistribution.badges.map(badge => <article key={badge.key}><span>{badge.title}</span><b>{badge.users}</b><small>{formatRate(badge.rate)}</small><MaturityTag mature={badge.mature} sample={badge.observations} minimum={badge.minimumObservations} /></article>)}</div>
      </div>

      <div className="achievementExperimentCard">
        <div className="achievementExperimentIntro"><div><div className="achievementAnalyticsSectionTitle"><div><Eye aria-hidden="true" /><h3>Чи показувати прогрес до бейджа?</h3></div><span className={`experimentState ${data.experiment.enabled ? 'isActive' : ''}`}>{data.experiment.enabled ? 'Тест активний' : 'Тест призупинено'}</span></div><p>Варіант A показує шкалу й поточний прогрес. Варіант B приховує їх. Розподіл 50/50, призначення закріплюється за акаунтом.</p><small>Початок: {dateLabel(data.experiment.startedAt)} · оцінка після 14 днів</small></div><button type="button" className={data.experiment.enabled ? 'experimentToggle isOn' : 'experimentToggle'} onClick={() => void toggleExperiment()} disabled={saving || busy}>{data.experiment.enabled ? <><EyeOff aria-hidden="true" />Зупинити тест</> : <><Eye aria-hidden="true" />Увімкнути тест</>}</button></div>
        <div className={`experimentReadiness ${data.experiment.reportReady ? 'isReady' : 'isImmature'}`} role="status"><CircleHelp aria-hidden="true" /><span>{data.experiment.reportReady ? 'Вибірка дозріла для попереднього перегляду: є 14+ днів і щонайменше 50 призначень у кожній групі. Перекриття інтервалів означає: ефект не доведений.' : `Дані ще не дозріли. Потрібно 14 днів і 50 спостережень у кожній групі. Зараз: день ${data.experiment.daysRunning}/14 · призначено A ${progress?.assigned || 0}/50, B ${control?.assigned || 0}/50. Не робіть висновок про ефект.`}</span></div>
        <div className="achievementExperimentTableWrap"><table className="achievementExperimentTable"><caption className="analyticsSrOnly">Порівняння A/B-груп та інтервали Вілсона</caption><thead><tr><th scope="col">Показник</th><th scope="col">Група A · прогрес видно {progress && <small>n={progress.assigned}</small>}</th><th scope="col">Група B · прогрес приховано {control && <small>n={control.assigned}</small>}</th><th scope="col">Різниця</th></tr></thead><tbody>
          <tr><th scope="row">Призначено до групи</th><td data-label="Група A">{progress?.assigned || 0} акаунтів <MaturityTag mature={Boolean(data.experiment.maturity.mature && (progress?.assigned || 0) >= 50)} sample={progress?.assigned || 0} minimum={50} /></td><td data-label="Група B">{control?.assigned || 0} акаунтів <MaturityTag mature={Boolean(data.experiment.maturity.mature && (control?.assigned || 0) >= 50)} sample={control?.assigned || 0} minimum={50} /></td><td data-label="Різниця">Розподіл 50/50</td></tr>
          {(['earned', 'd7', 'd30', 'pro30'] as const).map(metricKey => {
            if (metricKey === 'earned') return <tr key={metricKey}><th scope="row">{metricTitles.earned}</th><td data-label="Група A"><WilsonCell rate={progress?.earnedRate ?? null} interval={progress?.earnedInterval95 ?? null} numerator={progress?.earnedAfterAssignment || 0} denominator={progress?.assigned || 0} mature={Boolean(data.experiment.maturity.mature && progress?.earnedMature)} /></td><td data-label="Група B"><WilsonCell rate={control?.earnedRate ?? null} interval={control?.earnedInterval95 ?? null} numerator={control?.earnedAfterAssignment || 0} denominator={control?.assigned || 0} mature={Boolean(data.experiment.maturity.mature && control?.earnedMature)} /></td><td data-label="Різниця"><span className={`experimentEffectLabel ${comparisonText(metricKey) === 'Ефект не доведений' ? 'isUnproven' : ''}`}>{comparisonText(metricKey)}</span></td></tr>;
            const a = progress?.[metricKey]; const b = control?.[metricKey];
            return <tr key={metricKey}><th scope="row">{metricTitles[metricKey]}</th><td data-label="Група A"><WilsonCell rate={a?.rate ?? null} interval={a?.interval95 ?? null} numerator={a?.returned ?? a?.converted ?? 0} denominator={a?.eligible || 0} mature={Boolean(data.experiment.maturity.mature && a?.mature)} /></td><td data-label="Група B"><WilsonCell rate={b?.rate ?? null} interval={b?.interval95 ?? null} numerator={b?.returned ?? b?.converted ?? 0} denominator={b?.eligible || 0} mature={Boolean(data.experiment.maturity.mature && b?.mature)} /></td><td data-label="Різниця"><span className={`experimentEffectLabel ${comparisonText(metricKey) === 'Ефект не доведений' ? 'isUnproven' : ''}`}>{comparisonText(metricKey)}</span></td></tr>;
          })}
        </tbody></table></div>
        <footer><ShieldCheck aria-hidden="true" /><span>Інтервал Вілсона показує невизначеність оцінки частки. Перекриття 95% інтервалів позначено «Ефект не доведений». Навіть без перекриття це спостереження, а не доказ причинності. Показники дозрівають окремо: D7, D30 і оплата рахуються лише для когорт, які вже досягли відповідного віку.</span></footer>
      </div>
      <p className="achievementAnalyticsUpdated">Оновлено {new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generatedAt))}</p>
    </>}
  </section>;
}
