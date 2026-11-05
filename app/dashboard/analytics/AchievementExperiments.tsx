'use client';

import { useEffect, useState } from 'react';
import { BarChart3, CircleHelp, Eye, EyeOff, RefreshCw, ShieldCheck } from 'lucide-react';

type Metric = { eligible: number; returned?: number; converted?: number; rate: number | null; interval95: { low: number; high: number } | null };
type Group = {
  variant: 'progress' | 'control'; assigned: number; earnedAfterAssignment: number; earnedRate: number | null;
  d7: Metric; d30: Metric; pro30: Metric;
};
type Summary = {
  experiment: { key: string; enabled: boolean; startedAt: string | null; daysRunning: number; reportDueAt: string | null; minimumArmSize: number; reportReady: boolean; updatedAt: string };
  badgeDistribution: { totalUsers: number; usersWithAnyBadge: number; usersWithAnyBadgeRate: number | null; badges: Array<{ key: string; title: string; users: number; rate: number | null }> };
  groups: Group[];
  generatedAt: string;
};

const formatRate = (value: number | null) => value === null ? '—' : `${new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 }).format(value)}%`;
const formatInterval = (value: Metric['interval95']) => value ? `95% ДІ ${formatRate(value.low)}–${formatRate(value.high)}` : '95% ДІ ще формується';
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value)) : 'ще не запускали';

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
      const response = await fetch('/api/analytics/achievements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !data.experiment.enabled }),
      });
      const body = await response.json() as Summary & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Не вдалося змінити стан експерименту.');
      setData(body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося змінити стан експерименту.'); }
    finally { setSaving(false); }
  }

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);

  const progress = data?.groups.find((group) => group.variant === 'progress');
  const control = data?.groups.find((group) => group.variant === 'control');
  const sampleReady = Boolean(progress && control && progress.assigned >= (data?.experiment.minimumArmSize || 50) && control.assigned >= (data?.experiment.minimumArmSize || 50));

  return <section className="achievementAnalytics" aria-labelledby="achievement-analytics-title">
    <header className="achievementAnalyticsHead">
      <div><small>PRODUCT ANALYTICS · BADGES</small><h2 id="achievement-analytics-title">Досягнення у цифрах</h2><p>Агреговані метрики акаунтів і добровільного A/B-тесту прогресу до нагород.</p></div>
      <button type="button" className="funnelRefresh" onClick={() => void load()} disabled={busy || saving}><RefreshCw className={busy ? 'funnelSpin' : ''}/>Оновити</button>
    </header>
    {error && <p className="achievementAnalyticsError" role="alert">{error}</p>}
    {data && <>
      <div className="achievementAnalyticsOverview">
        <article><small>АКАУНТІВ</small><b>{data.badgeDistribution.totalUsers}</b><span>У загальній базі</span></article>
        <article><small>МІНІМУМ 1 БЕЙДЖ</small><b>{formatRate(data.badgeDistribution.usersWithAnyBadgeRate)}</b><span>{data.badgeDistribution.usersWithAnyBadge} із {data.badgeDistribution.totalUsers} акаунтів</span></article>
        <article><small>БЕЙДЖІВ У КАТАЛОЗІ</small><b>{data.badgeDistribution.badges.length}</b><span>Поточний каталог</span></article>
      </div>

      <div className="achievementDistribution" aria-label="Розподіл бейджів">
        <div className="achievementAnalyticsSectionTitle"><div><BarChart3 aria-hidden="true"/><h3>Розподіл бейджів</h3></div><span>Частка від усіх акаунтів</span></div>
        <div className="achievementDistributionGrid">{data.badgeDistribution.badges.map((badge) => <article key={badge.key}>
          <span>{badge.title}</span><b>{badge.users}</b><small>{formatRate(badge.rate)}</small>
        </article>)}</div>
      </div>

      <div className="achievementExperimentCard">
        <div className="achievementExperimentIntro">
          <div><div className="achievementAnalyticsSectionTitle"><div><Eye aria-hidden="true"/><h3>Чи показувати прогрес до бейджа?</h3></div><span className={`experimentState ${data.experiment.enabled ? 'isActive' : ''}`}>{data.experiment.enabled ? 'Тест активний' : 'Тест призупинено'}</span></div>
            <p>Варіант A показує шкалу й поточний прогрес. Варіант B приховує їх. Розподіл 50/50, призначення закріплюється за акаунтом.</p>
            <small>Початок: {dateLabel(data.experiment.startedAt)} · Звітний період: 14 днів</small>
          </div>
          <button type="button" className={data.experiment.enabled ? 'experimentToggle isOn' : 'experimentToggle'} onClick={() => void toggleExperiment()} disabled={saving || busy}>
            {data.experiment.enabled ? <><EyeOff aria-hidden="true"/>Зупинити тест</> : <><Eye aria-hidden="true"/>Увімкнути тест</>}
          </button>
        </div>
        <div className={`experimentReadiness ${data.experiment.reportReady ? 'isReady' : ''}`} role="status">
          <CircleHelp aria-hidden="true"/>
          <span>{data.experiment.reportReady
            ? 'Є 14+ днів даних, 50 учасників і 50 зрілих D7 у кожній групі. Перевірте метрики перед рішеннями.'
            : !data.experiment.startedAt ? 'Увімкніть тест, щоб почати збір добровільних призначень.'
              : `Попередній зріз: день ${data.experiment.daysRunning} із 14; n — ${progress?.assigned || 0}/${control?.assigned || 0}, зрілі D7 — ${progress?.d7.eligible || 0}/${control?.d7.eligible || 0} (потрібно 50 у кожній групі).`}</span>
        </div>
        <div className="achievementExperimentGroups">
          {[progress, control].filter((group): group is Group => Boolean(group)).map((group) => <article key={group.variant}>
            <header><span className={`experimentVariantIcon ${group.variant}`}>{group.variant === 'progress' ? <Eye aria-hidden="true"/> : <EyeOff aria-hidden="true"/>}</span><div><small>{group.variant === 'progress' ? 'ВАРІАНТ A' : 'ВАРІАНТ B'}</small><b>{group.variant === 'progress' ? 'Прогрес видно' : 'Прогрес приховано'}</b></div><strong>n={group.assigned}</strong></header>
            <dl>
              <div><dt>Отримали бейдж після призначення</dt><dd>{formatRate(group.earnedRate)} <small>({group.earnedAfterAssignment}/{group.assigned})</small></dd></div>
              <div><dt>D7 повернення</dt><dd>{formatRate(group.d7.rate)} <small>({group.d7.returned ?? 0}/{group.d7.eligible} зрілих) · {formatInterval(group.d7.interval95)}</small></dd></div>
              <div><dt>D30 повернення</dt><dd>{formatRate(group.d30.rate)} <small>({group.d30.returned ?? 0}/{group.d30.eligible} зрілих) · {formatInterval(group.d30.interval95)}</small></dd></div>
              <div><dt>Оплата Pro за 30 днів</dt><dd>{formatRate(group.pro30.rate)} <small>({group.pro30.converted ?? 0}/{group.pro30.eligible} зрілих) · {formatInterval(group.pro30.interval95)}</small></dd></div>
            </dl>
          </article>)}
        </div>
        <footer><ShieldCheck aria-hidden="true"/><span>Вимірюємо лише після згоди на приватну аналітику. D7/D30 — дія у відповідному 24-годинному вікні; D30 та Pro-конверсія з’являються після дозрівання когорти. 95% ДІ — інтервал Вілсона для невизначеності, а не доказ причинності: якщо інтервали перекриваються або вибірка мала, результат непевний. Поріг 50 на групу дозволяє лише первинний перегляд. Призначення зберігається до 90 днів.</span></footer>
      </div>
      <p className="achievementAnalyticsUpdated">Оновлено {new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generatedAt))}{sampleReady ? ' · мінімальний розмір вибірки досягнуто' : ''}</p>
    </>}
  </section>;
}
