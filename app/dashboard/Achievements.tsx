'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Award, BadgeCheck, BellRing, CircleDollarSign, Copy, FileSearch, Flame, Languages, MailCheck, ShieldCheck, UsersRound, X } from 'lucide-react';
import { useAccessibleDialog } from '../useAccessibleDialog';
import { reconcileAchievementNotifications } from '../../lib/achievement-toast-policy.js';
import { analyticsConsentGranted } from '../../lib/funnel-analytics-client';
import './achievements.css';

type Badge = { key: string; title: string; description: string; condition: string; goal: number; current: number; icon: string; earnedAt: string | null; progressLabel: string };
type Collection = { userId?: string; badges: Badge[]; analysisCount: number; longestStreak: number; recentStreak: Array<{ date: string; active: boolean }>; confirmedReferrals: number; experiment?: { enabled: boolean; assigned: boolean; variant: 'progress' | 'control'; showProgress: boolean } };
type ToastBadge = Badge & { toastId: string };
type NoticeState = { userId: string; seen: Record<string, string> };
const icons = { scan: FileSearch, renewal: BellRing, savings: CircleDollarSign, kit: MailCheck, languages: Languages, guardian: ShieldCheck, streak: Flame, mentor: UsersRound } as const;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Дата недоступна' : new Intl.DateTimeFormat('uk-UA', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

function formatWeekday(value: string) {
  return new Intl.DateTimeFormat('uk-UA', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`)).replace('.', '');
}

function browserDeviceId() {
  let id = localStorage.getItem('sift-device-id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('sift-device-id', id); }
  return id;
}

export default function Achievements() {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [error, setError] = useState('');
  const [referralUrl, setReferralUrl] = useState('');
  const [referralBusy, setReferralBusy] = useState(false);
  const [referralNotice, setReferralNotice] = useState('');
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [toastQueue, setToastQueue] = useState<ToastBadge[]>([]);
  const notices = useRef<NoticeState | null>(null);
  const requestSequence = useRef(0);
  const pendingUnlockEventAt = useRef<number | null>(null);
  const dialogRef = useAccessibleDialog<HTMLDivElement>(Boolean(selectedBadge), () => setSelectedBadge(null));

  useEffect(() => {
    let active = true;
    const load = async () => {
      const requestId = ++requestSequence.current;
      try {
        const consent = analyticsConsentGranted() ? 'granted' : 'denied';
        const response = await fetch(`/api/achievements?experimentConsent=${consent}`, { cache: 'no-store' });
        const body = await response.json() as Partial<Collection> & { error?: string };
        if (!response.ok) throw new Error(body.error || 'Досягнення тимчасово недоступні.');
        if (!active || requestId !== requestSequence.current) return;

        const collectionBody:Collection={userId:body.userId,badges:Array.isArray(body.badges)?body.badges:[],analysisCount:Number.isFinite(body.analysisCount)?Number(body.analysisCount):0,longestStreak:Number.isFinite(body.longestStreak)?Number(body.longestStreak):0,recentStreak:Array.isArray(body.recentStreak)?body.recentStreak:[],confirmedReferrals:Number.isFinite(body.confirmedReferrals)?Number(body.confirmedReferrals):0,experiment:body.experiment};
        const userId = collectionBody.userId || 'current-account';
        const storageKey = `sift:achievement-notices:v1:${userId}`;
        let previous: Record<string, string> | null = null;
        if (notices.current?.userId === userId) previous = notices.current.seen;
        else {
          try {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
              const parsed = JSON.parse(saved) as { version?: number; seen?: Record<string, string> };
              if (parsed.version === 1 && parsed.seen && typeof parsed.seen === 'object') previous = parsed.seen;
            }
          } catch { /* Keep the in-memory first-visit baseline when storage is unavailable. */ }
        }

        const unlockEventAt = pendingUnlockEventAt.current;
        const baseline = previous === null && unlockEventAt === null;
        const snapshot = reconcileAchievementNotifications(baseline ? null : (previous || {}), collectionBody.badges);
        const newlyEarned = unlockEventAt !== null && previous === null
          ? snapshot.newlyEarned.filter((badge) => badge.earnedAt && Date.parse(badge.earnedAt) >= unlockEventAt - 60_000)
          : snapshot.newlyEarned;

        notices.current = { userId, seen: snapshot.seen };
        try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, seen: snapshot.seen })); } catch { /* Toasts remain deduped for this page lifetime. */ }
        pendingUnlockEventAt.current = null;
        if (newlyEarned.length) {
          setToastQueue((current) => {
            const queued = new Set(current.map((item) => item.toastId));
            const additions = newlyEarned
              .map((badge) => ({ ...badge, toastId: `${userId}:${badge.key}:${badge.earnedAt}` }))
              .filter((badge) => !queued.has(badge.toastId));
            return additions.length ? [...current, ...additions] : current;
          });
        }
        setCollection(collectionBody);
        setError('');
      } catch (reason) {
        if (active && requestId === requestSequence.current) setError(reason instanceof Error ? reason.message : 'Досягнення тимчасово недоступні.');
      }
    };
    const refresh = () => {
      pendingUnlockEventAt.current = Date.now();
      void load();
    };
    void load();
    window.addEventListener('sift:achievements-updated', refresh);
    return () => { active = false; window.removeEventListener('sift:achievements-updated', refresh); };
  }, []);

  useEffect(() => {
    if (!toastQueue.length) return;
    const currentId = toastQueue[0].toastId;
    const timer = window.setTimeout(() => setToastQueue((current) => current[0]?.toastId === currentId ? current.slice(1) : current), 6000);
    return () => window.clearTimeout(timer);
  }, [toastQueue]);

  useEffect(() => {
    if (!selectedBadge) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [selectedBadge]);

  function dismissToast(toastId: string) {
    setToastQueue((current) => current.filter((toast) => toast.toastId !== toastId));
  }

  async function inviteFriend() {
    setReferralBusy(true); setReferralNotice('');
    try {
      if (referralUrl) {
        await navigator.clipboard.writeText(referralUrl);
        setReferralNotice('Посилання скопійовано. Підтверджене запрошення зарахується після верифікації email друга.');
        return;
      }
      const response = await fetch(`/api/referral?deviceId=${encodeURIComponent(browserDeviceId())}`, { cache: 'no-store' });
      const body = await response.json() as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || 'Не вдалося створити посилання.');
      setReferralUrl(body.url);
      try { await navigator.clipboard.writeText(body.url); setReferralNotice('Посилання скопійовано. Запрошення зарахується після підтвердження email другом.'); }
      catch { setReferralNotice('Посилання готове. Скопіюйте його з поля нижче та надішліть другу.'); }
    } catch (reason) { setReferralNotice(reason instanceof Error ? reason.message : 'Не вдалося створити запрошення.'); }
    finally { setReferralBusy(false); }
  }

  const currentToast = toastQueue[0];
  const showProgress = collection?.experiment?.showProgress !== false;
  const earnedCount = collection?.badges.filter((badge) => Boolean(badge.earnedAt)).length || 0;
  const level = earnedCount >= 8 ? 5 : Math.floor(earnedCount / 2) + 1;
  const levelProgress = earnedCount >= 8 ? 100 : (earnedCount % 2) * 50;
  const ToastIcon = currentToast ? icons[currentToast.icon as keyof typeof icons] || BadgeCheck : BadgeCheck;
  const SelectedIcon = selectedBadge ? icons[selectedBadge.icon as keyof typeof icons] || BadgeCheck : BadgeCheck;
  const selectedEarned = Boolean(selectedBadge?.earnedAt);

  return <section id="achievements" className="achievementCollection" aria-labelledby="achievement-title">
    <header className="achievementHeading"><div><small>РОЗУМНІ ПОКУПКИ</small><h2 id="achievement-title">Ваші досягнення</h2><p>Нагороди видаються за збережені перевірки та підтверджені дії у Sift.</p></div>
      {collection && <div className="achievementStreak"><span><Flame aria-hidden="true"/></span><div><small>НАЙКРАЩА СЕРІЯ</small><b>{collection.longestStreak} <em>{collection.longestStreak === 1 ? 'день' : collection.longestStreak >= 2 && collection.longestStreak <= 4 ? 'дні' : 'днів'}</em></b></div></div>}
    </header>
    {error && !collection && <p className="achievementError" role="status">{error}</p>}
    {collection && <div className="achievementMetaRow">
      <section className="achievementLevel" aria-label={`Рівень профілю ${level}`}>
        <span className="achievementLevelIcon"><Award aria-hidden="true"/></span>
        <div className="achievementLevelBody"><small>РІВЕНЬ ПРОФІЛЮ</small><b>Рівень {level}</b>
          {showProgress && <><span className="achievementLevelTrack" role="progressbar" aria-label="Прогрес до наступного рівня" aria-valuemin={0} aria-valuemax={100} aria-valuenow={levelProgress}><span style={{ width: `${levelProgress}%` }}/></span><span className="achievementLevelLabel">{earnedCount === 8 ? 'Усі відзнаки зібрано' : `${earnedCount % 2} з 2 до наступного рівня`}</span></>}
        </div>
      </section>
      <section className="achievementWeek" aria-label="Активність перевірок за останні сім днів за UTC">
        <div className="achievementWeekHead"><small>ОСТАННІ 7 ДНІВ</small><span>UTC</span></div>
        <div className="achievementWeekDots">{collection.recentStreak.map((day) => <span className={`achievementWeekDay${day.active ? ' isActive' : ''}`} key={day.date} aria-label={`${formatWeekday(day.date)} ${day.date}: ${day.active ? 'була перевірка' : 'без перевірок'}`} title={`${day.date} · ${day.active ? 'була перевірка' : 'без перевірок'}`}><i aria-hidden="true"/><small aria-hidden="true">{formatWeekday(day.date)}</small></span>)}</div>
      </section>
    </div>}
    <div className="achievementGrid" role="region" aria-busy={!collection} aria-label="Колекція досягнень">
      {(collection?.badges || []).map((badge) => {
        const Icon = icons[badge.icon as keyof typeof icons] || BadgeCheck;
        const earned = Boolean(badge.earnedAt);
        const progress = Math.min(badge.current, badge.goal);
        return <article className={`achievementCard${earned ? ' isEarned' : ' isLocked'}`} key={badge.key}>
          <button type="button" className="achievementCardButton" onClick={() => setSelectedBadge(badge)} aria-haspopup="dialog" aria-label={`${badge.title}. ${earned ? `Отримано ${formatDate(badge.earnedAt!)}` : showProgress ? badge.progressLabel : 'Ще не отримано'}. Відкрити деталі`}>
            <span className="achievementIcon"><Icon aria-hidden="true"/></span>
            <span className="achievementCopy"><span className="achievementTitleRow"><span className="achievementCardTitle">{badge.title}</span>{earned && <BadgeCheck aria-label="Отримано"/>}</span>
              <span className="achievementDescription">{badge.description}</span>
              {earned ? <span className="achievementProgressLabel">Отримано {formatDate(badge.earnedAt!)}</span> : showProgress && <><span className="achievementProgress" role="progressbar" aria-label={`Прогрес: ${badge.title}`} aria-valuemin={0} aria-valuemax={badge.goal} aria-valuenow={progress}><span style={{ width: `${badge.goal ? Math.min(100, progress / badge.goal * 100) : 0}%` }}/></span><span className="achievementProgressLabel">{badge.progressLabel}</span></>}
            </span>
          </button>
        </article>;
      })}
      {!collection && !error && Array.from({ length: 8 }, (_, item) => <div className="achievementCard achievementSkeleton" key={item} aria-hidden="true"/>)}
    </div>
    <div className="achievementReferral"><div className="achievementReferralCopy"><small>ПОДІЛІТЬСЯ SIFT</small><b>Запросіть друга</b><p>Запрошення підтверджується, коли друг створить акаунт і верифікує email.</p>{referralNotice&&<span role="status">{referralNotice}</span>}{referralUrl&&<input aria-label="Ваше реферальне посилання" value={referralUrl} readOnly onFocus={(event)=>event.currentTarget.select()}/>}</div><div className="achievementReferralCount" aria-label={`${collection?.confirmedReferrals || 0} підтверджених запрошень`}><b>{collection?.confirmedReferrals || 0}</b><span>ПІДТВЕРДЖЕНО</span><small>запрошень</small></div><button type="button" onClick={()=>void inviteFriend()} disabled={referralBusy}>{referralBusy?'Готуємо…':referralUrl?<><Copy aria-hidden="true"/>Скопіювати посилання</>:'Створити посилання'}</button></div>
    <p className="achievementNote">Точки показують дні з успішною перевіркою (UTC). Серія та досягнення рахуються з серверних подій; Sift не відстежує, чи ви фактично купили товар.</p>

    {currentToast && <div className="achievementToast" role="status" aria-live="polite" aria-atomic="true" key={currentToast.toastId}>
      <span className="achievementToastIcon"><ToastIcon aria-hidden="true"/></span><span><small>НОВЕ ДОСЯГНЕННЯ</small><b>{currentToast.title}</b><span>Відзнаку додано до вашої колекції.</span></span>
      <span className="achievementConfetti" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ '--x': `${(index - 5.5) * 14}px`, '--rotation': `${index * 47}deg` } as CSSProperties}/>)}</span>
      <button type="button" onClick={() => dismissToast(currentToast.toastId)} aria-label="Закрити сповіщення"><X aria-hidden="true"/></button>
    </div>}

    {selectedBadge && <div className="achievementDialogBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedBadge(null); }}>
      <div className={`achievementDialog${selectedEarned ? ' isEarned' : ''}`} role="dialog" aria-modal="true" aria-labelledby="achievement-dialog-title" ref={dialogRef} tabIndex={-1}>
        <button type="button" className="achievementDialogClose" onClick={() => setSelectedBadge(null)} aria-label="Закрити деталі досягнення"><X aria-hidden="true"/></button>
        <span className="achievementDialogIcon"><SelectedIcon aria-hidden="true"/></span>
        <small>{selectedEarned ? 'ДОСЯГНЕННЯ ОТРИМАНО' : showProgress ? 'ПРОГРЕС ДО НАГОРОДИ' : 'ЗАБЛОКОВАНЕ ДОСЯГНЕННЯ'}</small>
        <h2 id="achievement-dialog-title">{selectedBadge.title}</h2>
        <p>{selectedBadge.description}</p>
        <div className="achievementCondition"><small>УМОВА</small><p>{selectedBadge.condition}</p></div>
        {showProgress && <><div className="achievementDialogProgress" role="progressbar" aria-label={`Прогрес: ${selectedBadge.title}`} aria-valuemin={0} aria-valuemax={selectedBadge.goal} aria-valuenow={Math.min(selectedBadge.current, selectedBadge.goal)}><span style={{ width: `${selectedBadge.goal ? Math.min(100, selectedBadge.current / selectedBadge.goal * 100) : 0}%` }}/></div>
          <b className="achievementDialogProgressLabel">{selectedEarned ? `Отримано ${formatDate(selectedBadge.earnedAt!)}` : selectedBadge.progressLabel}</b></>}
      </div>
    </div>}
  </section>;
}
