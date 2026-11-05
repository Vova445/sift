'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Bot, Check, Copy, ExternalLink, KeyRound, LockKeyhole, Plus, ShieldCheck, Trash2, Unplug, X } from 'lucide-react';
import { useAccessibleDialog } from '../../useAccessibleDialog';
import { useBodyScrollLock } from '../../useBodyScrollLock';
import ConfirmActionDialog from '../ConfirmActionDialog';
import AccessGate from '../AccessGate';
import './integrations.css';

type ApiKey = { id: string; label: string; key_prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null };
type State = { user?: { email: string }; plan?: 'free' | 'one' | 'pro'; keys?: ApiKey[]; bot?: { configured: boolean; username: string | null; startUrl: string | null }; telegram?: { linked: boolean; username: string | null; firstName: string | null; linkedAt: string | null; lastUsedAt: string | null; authorizedGroups: number }; error?: string };
type OneTimeKey = { id: string; label: string; prefix: string; createdAt: string; secret: string };
type LinkCode = { code: string; expiresAt: string; startUrl: string | null; username: string | null };
type PendingAction = { type: 'key'; id: string; label: string } | { type: 'telegram' } | null;

async function readJson<T>(response: Response) { return await response.json() as T; }
function dateTime(value: string | null) { return value ? new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Ще не використовувався'; }

export default function IntegrationsPage() {
  const [state, setState] = useState<State | null>(null);
  const [authRequired,setAuthRequired]=useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('Мій проєкт');
  const [oneTimeKey, setOneTimeKey] = useState<OneTimeKey | null>(null);
  const [linkCode, setLinkCode] = useState<LinkCode | null>(null);
  const [linkSeconds, setLinkSeconds] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const oneTimeDialogRef = useAccessibleDialog<HTMLElement>(Boolean(oneTimeKey), () => setOneTimeKey(null));
  useBodyScrollLock(Boolean(oneTimeKey));
  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true); setError('');
    try {
      const [keysResponse, telegramResponse] = await Promise.all([fetch('/api/developer/keys', { cache: 'no-store' }), fetch('/api/telegram/link', { cache: 'no-store' })]);
      if (keysResponse.status === 401 || telegramResponse.status === 401) { setState(null); setAuthRequired(true); return; }
      const keys = await readJson<State>(keysResponse), telegram = await readJson<State>(telegramResponse);
      if (!keysResponse.ok) throw new Error(keys.error || 'Не вдалося завантажити інтеграції.');
      if (!telegramResponse.ok) throw new Error(telegram.error || 'Не вдалося завантажити Telegram.');
      setState({ ...keys, ...telegram, keys: keys.keys || [] });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося завантажити інтеграції.'); }
    finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!linkCode) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((Date.parse(linkCode.expiresAt) - Date.now()) / 1000));
      setLinkSeconds(seconds);
      if (seconds === 0) { setLinkCode(null); setMessage('Код прив’язки минув. Створіть новий, щоб підключити Telegram.'); }
    };
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [linkCode]);
  useEffect(() => {
    if (!linkCode) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch('/api/telegram/link', { cache: 'no-store' });
        if (!response.ok) return;
        const body = await readJson<State>(response);
        if (active && body.telegram?.linked) {
          setState(current => current ? { ...current, plan: body.plan, bot: body.bot, telegram: body.telegram } : current);
          setLinkCode(null); setMessage('Telegram успішно підключено. Тепер статус оновлюється автоматично.');
        }
      } catch { /* Keep showing the active one-time code; the next poll retries. */ }
    };
    const timer = window.setInterval(() => void poll(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [linkCode]);

  async function createKey(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/developer/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label }) });
      const body = await readJson<{ key?: Omit<OneTimeKey, 'secret'>; secret?: string; error?: string }>(response);
      if (!response.ok || !body.key || !body.secret) throw new Error(body.error || 'Не вдалося створити ключ.');
      setOneTimeKey({ ...body.key, secret: body.secret }); setLabel(''); await refresh(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося створити ключ.'); }
    finally { setBusy(false); }
  }
  async function confirmPendingAction() {
    if (!pendingAction || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = pendingAction.type === 'key'
        ? await fetch('/api/developer/keys', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: pendingAction.id }) })
        : await fetch('/api/telegram/link', { method: 'DELETE' });
      const body = await readJson<{ error?: string }>(response); if (!response.ok) throw new Error(body.error || 'Не вдалося виконати дію.');
      setPendingAction(null);
      setMessage(pendingAction.type === 'key' ? 'API-ключ відкликано. Запити з ним одразу перестали працювати.' : 'Telegram відв’язано; доступ усіх дозволених груп вимкнено.');
      if (pendingAction.type === 'telegram') setLinkCode(null);
      await refresh(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося виконати дію. Спробуйте ще раз.'); }
    finally { setBusy(false); }
  }
  async function createLink() {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/telegram/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const body = await readJson<LinkCode & { error?: string }>(response); if (!response.ok) throw new Error(body.error || 'Не вдалося створити код.');
      setLinkCode(body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося підключити Telegram.'); }
    finally { setBusy(false); }
  }
  async function unlinkTelegram() {
    setPendingAction({ type: 'telegram' });
  }
  async function copy(value: string, labelText: string) {
    try { await navigator.clipboard.writeText(value); setMessage(`${labelText} скопійовано.`); }
    catch { setMessage(`Не вдалося скопіювати автоматично. Виділіть текст і скопіюйте вручну.`); }
  }

  if (loading) return <main className="integrationLoading"><span/><p>Завантажуємо інтеграції…</p></main>;
  if (!state) return authRequired ? <AccessGate variant="integrations"/> : <main className="integrationLoading" role="alert"><p>{error||'Не вдалося завантажити інтеграції.'}</p><button type="button" onClick={()=>void refresh()}>Спробувати ще раз</button></main>;

  const activeKeys = (state.keys || []).filter((key) => !key.revoked_at);
  const isPro = state.plan === 'pro';
  return <main className="integrationPage">
    <header className="integrationTop"><Link href="/dashboard" className="integrationBack"><ArrowLeft/> Dashboard</Link><Link href="/" className="integrationBrand"><span>S</span> SIFT <small>DEVELOPER</small></Link><span className={`integrationPlan ${state.plan || 'free'}`}>{isPro ? 'SIFT PRO' : state.plan === 'one' ? 'ONE SIFT' : 'FREE'}</span></header>
    <div className="integrationWrap">
      <div className="integrationIntro"><small>API & TELEGRAM</small><h1>Зв’яжіть Sift зі своїми інструментами.</h1><p>Перевіряйте посилання з Telegram або викликайте API. Кожен звіт зберігається у вашій історії Sift.</p></div>
      {(error || message) && <div className={`integrationNotice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{error || message}<button type="button" aria-label="Закрити повідомлення" onClick={() => { setError(''); setMessage(''); }}><X/></button></div>}
      <section className="integrationCard">
        <header className="integrationCardHeader"><span className="integrationIcon"><Bot/></span><div><small>TELEGRAM BOT</small><h2>Надішліть посилання — отримайте звіт</h2></div><span className={`integrationStatus ${state.telegram?.linked ? 'on' : ''}`}>{state.telegram?.linked ? 'ПІДКЛЮЧЕНО' : state.bot?.configured ? 'ГОТОВИЙ ДО ПІДКЛЮЧЕННЯ' : 'ПОТРІБНЕ НАЛАШТУВАННЯ'}</span></header>
        <p className="integrationCopy">Бот надсилає вердикт, Clarity Score, знайдені ціни й уривки доказів. Звіт додається до Dashboard. Працює лише з активним і підтвердженим Sift Pro.</p>
        {state.telegram?.linked ? <div className="telegramLinked"><div><Check/><span><b>Telegram підключено{state.telegram.username ? ` · @${state.telegram.username}` : ''}</b><small>{state.telegram.authorizedGroups} дозволених груп · спільний ліміт 30 запитів/хв</small></span></div><button type="button" className="integrationDanger" onClick={unlinkTelegram} disabled={busy}><Unplug/>Відв’язати</button></div> : <div className="integrationActionRow"><button type="button" className="integrationPrimary" onClick={() => void createLink()} disabled={busy || !isPro || !state.bot?.configured}>{busy ? 'Створюємо…' : 'Підключити Telegram'} <ArrowRight/></button>{!isPro && <Link href="/#pricing" className="integrationUpgradeLink">Перейти на Pro <ArrowRight/></Link>}</div>}
        {linkCode && <div className="telegramConnect"><div><small>КОД ДІЄ ЩЕ {String(Math.floor(linkSeconds / 60)).padStart(2, '0')}:{String(linkSeconds % 60).padStart(2, '0')}</small><b>Відкрийте бота та підтвердьте прив’язку</b><p>Код одноразовий і дійсний 10 хвилин. Ніколи не надсилайте його стороннім людям. Статус оновиться автоматично після прив’язки.</p></div><code>{linkCode.code}</code><div className="telegramConnectActions"><button type="button" onClick={() => void copy(linkCode.code, 'Код')}><Copy/>Копіювати код</button>{linkCode.startUrl && <a href={linkCode.startUrl} target="_blank" rel="noreferrer">Відкрити бота <ExternalLink/></a>}</div></div>}
        {state.bot?.configured && <div className="telegramSteps"><b>Спільна група — до 10 людей</b><ol><li>Прив’яжіть свій Telegram у приватному чаті з ботом.</li><li>Додайте бота до групи та надішліть <code>/allowgroup</code>.</li><li>Учасники можуть надсилати URL; спільний ліміт — 30 запитів за хвилину на Pro-акаунт.</li></ol><small>Перед підключенням і кожною груповою перевіркою Sift перевіряє розмір групи; понад 10 учасників доступ призупиняється. Власник вимикає доступ через <code>/disablegroup</code>, відв’язує акаунт через <code>/unlink</code> у приватному чаті або в Sift → Інтеграції. Без дозволу групи бот посилання не обробляє.</small></div>}
        {!state.bot?.configured && <div className="integrationSetup"><LockKeyhole/>Bot token і webhook ще не налаштовані оператором. API-ключі можуть працювати незалежно.</div>}
      </section>

      <section className="integrationCard">
        <header className="integrationCardHeader"><span className="integrationIcon violet"><KeyRound/></span><div><small>PUBLIC API · PRO</small><h2>Керуйте API-ключами</h2></div><Link href="/api-docs" className="integrationDocLink">OpenAPI docs <ExternalLink/></Link></header>
        <p className="integrationCopy">API використовує той самий аналізатор, SSRF-захист і Pro-ліміт, що й вебдодаток: до 30 запитів за хвилину на акаунт. Ключі зберігаються лише у вигляді SHA-256 хешу.</p>
        <form className="integrationKeyForm" onSubmit={(event) => void createKey(event)}><label>Назва ключа<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={40} placeholder="Наприклад, production backend"/></label><button type="submit" className="integrationPrimary" disabled={busy || !isPro || !label.trim() || activeKeys.length >= 5}><Plus/>{busy ? 'Створюємо…' : 'Створити API-ключ'}</button></form>
        {!isPro && <div className="integrationUpgrade"><LockKeyhole/>Створення ключів доступне лише для Sift Pro. <Link href="/#pricing">Переглянути тариф <ArrowRight/></Link></div>}
        <div className="apiKeyList">{(state.keys || []).length ? <div className="apiKeyTableWrap"><table className="apiKeyTable"><caption className="integrationVisuallyHidden">API-ключі вашого акаунта</caption><thead><tr><th scope="col">Назва</th><th scope="col">Префікс</th><th scope="col">Створено</th><th scope="col">Остання активність</th><th scope="col"><span className="integrationVisuallyHidden">Дія</span></th></tr></thead><tbody>{state.keys!.map((key) => <tr key={key.id} className={key.revoked_at ? 'revoked' : ''}><th scope="row" data-label="Назва">{key.label}{key.revoked_at && <small className="apiKeyRevokedLabel">Відкликано</small>}</th><td data-label="Префікс"><code>{key.key_prefix}••••••••••</code></td><td data-label="Створено"><time dateTime={key.created_at}>{dateTime(key.created_at)}</time></td><td data-label="Остання активність">{key.revoked_at ? `Відкликано ${dateTime(key.revoked_at)}` : dateTime(key.last_used_at)}</td><td data-label="Дія">{!key.revoked_at && <button type="button" className="apiKeyRevoke" onClick={() => setPendingAction({ type: 'key', id: key.id, label: key.label })} disabled={busy} aria-label={`Відкликати ключ ${key.label}`}><Trash2/><span>Відкликати</span></button>}</td></tr>)}</tbody></table></div> : <div className="integrationEmpty"><KeyRound/><b>API-ключів ще немає</b><span>Створіть ключ і передайте його у заголовку Authorization: Bearer.</span></div>}</div>
        <div className="apiSecurityNote"><ShieldCheck/>Секрет показується один раз після створення. Збережіть його у менеджері секретів сервера. Не додавайте ключ до браузерного коду або репозиторію.</div>
      </section>
      <footer className="integrationFoot"><Link href="/api-docs">API документація</Link><span>·</span><Link href="/dashboard">Dashboard</Link><span>·</span><a href="/api/v1/openapi.json">OpenAPI JSON</a></footer>
    </div>
    {oneTimeKey && <div className="oneTimeOverlay" role="presentation" onMouseDown={() => setOneTimeKey(null)}><section ref={oneTimeDialogRef} role="dialog" aria-modal="true" aria-labelledby="one-time-title" aria-describedby="one-time-description" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}><button className="oneTimeClose" type="button" aria-label="Закрити" onClick={() => setOneTimeKey(null)}><X/></button><span className="integrationIcon violet"><KeyRound/></span><small>СКОПІЮЙТЕ ЗАРАЗ</small><h2 id="one-time-title">Новий API-ключ створено</h2><p id="one-time-description">Повне значення показано лише зараз і не зберігається в Sift у відкритому вигляді. Збережіть його у менеджері секретів вашого сервера.</p><div className="oneTimeWarning" role="alert"><ShieldCheck aria-hidden="true"/><span><b>Скопіюйте ключ зараз.</b><small>Після закриття цього вікна відновити секрет неможливо — доведеться створити новий.</small></span></div><code className="oneTimeSecret">{oneTimeKey.secret}</code><button type="button" className="integrationPrimary" onClick={() => void copy(oneTimeKey.secret, 'API-ключ')}><Copy/>Копіювати ключ</button><button type="button" className="oneTimeDone" onClick={() => setOneTimeKey(null)}>Готово, я зберіг ключ</button></section></div>}
    <ConfirmActionDialog open={pendingAction!==null} title={pendingAction?.type==='key'?'Відкликати API-ключ?':'Відв’язати Telegram?'} description={pendingAction?.type==='key'?`Ключ «${pendingAction.label}» одразу перестане працювати. Уже збережені звіти залишаться в історії.`:'Telegram буде відв’язано, а всі дозволені групи втратять доступ до перевірок. Цю дію можна скасувати, прив’язавши акаунт знову.'} confirmLabel={pendingAction?.type==='key'?'Відкликати ключ':'Відв’язати Telegram'} busy={busy} message={error} onConfirm={()=>void confirmPendingAction()} onClose={()=>{if(!busy){setPendingAction(null);setError('')}}}/>
  </main>;
}
