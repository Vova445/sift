'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Bot, Check, Code2, Copy, ExternalLink, KeyRound, LockKeyhole, Plus, ShieldCheck, Trash2, Unplug, X } from 'lucide-react';
import './integrations.css';

type ApiKey = { id: string; label: string; key_prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null };
type State = { user?: { email: string }; plan?: 'free' | 'one' | 'pro'; keys?: ApiKey[]; bot?: { configured: boolean; username: string | null; startUrl: string | null }; telegram?: { linked: boolean; username: string | null; firstName: string | null; linkedAt: string | null; lastUsedAt: string | null; authorizedGroups: number }; error?: string };
type OneTimeKey = { id: string; label: string; prefix: string; createdAt: string; secret: string };
type LinkCode = { code: string; expiresAt: string; startUrl: string | null; username: string | null };

async function readJson<T>(response: Response) { return await response.json() as T; }

export default function IntegrationsPage() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('Мій проєкт');
  const [oneTimeKey, setOneTimeKey] = useState<OneTimeKey | null>(null);
  const [linkCode, setLinkCode] = useState<LinkCode | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [keysResponse, telegramResponse] = await Promise.all([fetch('/api/developer/keys', { cache: 'no-store' }), fetch('/api/telegram/link', { cache: 'no-store' })]);
      if (keysResponse.status === 401 || telegramResponse.status === 401) { setState(null); return; }
      const keys = await readJson<State>(keysResponse), telegram = await readJson<State>(telegramResponse);
      if (!keysResponse.ok) throw new Error(keys.error || 'Не вдалося завантажити інтеграції.');
      if (!telegramResponse.ok) throw new Error(telegram.error || 'Не вдалося завантажити Telegram.');
      setState({ ...keys, ...telegram, keys: keys.keys || [] });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося завантажити інтеграції.'); }
    finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  async function createKey(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/developer/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label }) });
      const body = await readJson<{ key?: Omit<OneTimeKey, 'secret'>; secret?: string; error?: string }>(response);
      if (!response.ok || !body.key || !body.secret) throw new Error(body.error || 'Не вдалося створити ключ.');
      setOneTimeKey({ ...body.key, secret: body.secret }); setLabel(''); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося створити ключ.'); }
    finally { setBusy(false); }
  }
  async function revokeKey(id: string) {
    if (!window.confirm('Відкликати цей API-ключ? Запити з ним одразу перестануть працювати.')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/developer/keys', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
      const body = await readJson<{ error?: string }>(response); if (!response.ok) throw new Error(body.error || 'Не вдалося відкликати ключ.');
      setMessage('Ключ відкликано.'); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося відкликати ключ.'); }
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
    if (!window.confirm('Відв’язати Telegram і вимкнути всі дозволені групи?')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/telegram/link', { method: 'DELETE' });
      const body = await readJson<{ error?: string }>(response); if (!response.ok) throw new Error(body.error || 'Не вдалося відв’язати Telegram.');
      setLinkCode(null); setMessage('Telegram відв’язано; груповий доступ вимкнено.'); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося відв’язати Telegram.'); }
    finally { setBusy(false); }
  }
  async function copy(value: string, labelText: string) {
    try { await navigator.clipboard.writeText(value); setMessage(`${labelText} скопійовано.`); }
    catch { setMessage(`Не вдалося скопіювати автоматично. Виділіть текст і скопіюйте вручну.`); }
  }

  if (loading) return <main className="integrationLoading"><span/><p>Завантажуємо інтеграції…</p></main>;
  if (!state) return <main className="integrationGate"><section><span className="integrationMark"><Code2/></span><small>DEVELOPER ACCESS</small><h1>Інтеграції Sift</h1><p>Увійдіть у Sift, щоб керувати API-ключами та Telegram-зв’язком.</p><Link href="/?login=1" className="integrationPrimary">Увійти <ArrowRight/></Link><Link href="/" className="integrationBack">На головну</Link></section></main>;

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
        {state.telegram?.linked ? <div className="telegramLinked"><div><Check/><span><b>Telegram підключено{state.telegram.username ? ` · @${state.telegram.username}` : ''}</b><small>{state.telegram.authorizedGroups} дозволених груп · спільний ліміт 30 запитів/хв</small></span></div><button type="button" className="integrationDanger" onClick={() => void unlinkTelegram()} disabled={busy}><Unplug/>Відв’язати</button></div> : <div className="integrationActionRow"><button type="button" className="integrationPrimary" onClick={() => void createLink()} disabled={busy || !isPro || !state.bot?.configured}>{busy ? 'Створюємо…' : 'Підключити Telegram'} <ArrowRight/></button>{!isPro && <span>Перейдіть на Pro, щоб підключити бота.</span>}</div>}
        {linkCode && <div className="telegramConnect"><div><small>КОД ДІЄ ДО {new Date(linkCode.expiresAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</small><b>Відкрийте бота та підтвердьте прив’язку</b><p>Код одноразовий, діє 10 хвилин. Ніколи не надсилайте його стороннім людям.</p></div><code>{linkCode.code}</code><div className="telegramConnectActions"><button type="button" onClick={() => void copy(linkCode.code, 'Код')}><Copy/>Копіювати код</button>{linkCode.startUrl && <a href={linkCode.startUrl} target="_blank" rel="noreferrer">Відкрити @{linkCode.username}<ExternalLink/></a>}</div></div>}
        {state.bot?.configured && <div className="telegramSteps"><b>Група до 10 людей</b><ol><li>Прив’яжіть свій Telegram у приватному чаті з ботом.</li><li>Додайте бота до групи та надішліть <code>/allowgroup</code>.</li><li>Учасники групи можуть надсилати URL. Ліміт 30 перевірок за хвилину спільний із Pro-акаунтом.</li></ol><small>Власник може вимкнути групу командою <code>/disablegroup</code> або відв’язати Telegram. Без дозволу групи бот посилання не обробляє.</small></div>}
        {!state.bot?.configured && <div className="integrationSetup"><LockKeyhole/>Bot token і webhook ще не налаштовані оператором. API-ключі можуть працювати незалежно.</div>}
      </section>

      <section className="integrationCard">
        <header className="integrationCardHeader"><span className="integrationIcon violet"><KeyRound/></span><div><small>PUBLIC API · PRO</small><h2>Керуйте API-ключами</h2></div><Link href="/api-docs" className="integrationDocLink">OpenAPI docs <ExternalLink/></Link></header>
        <p className="integrationCopy">API використовує той самий аналізатор, SSRF-захист і Pro-ліміт, що й вебдодаток: до 30 запитів за хвилину на акаунт. Ключі зберігаються лише у вигляді SHA-256 хешу.</p>
        <form className="integrationKeyForm" onSubmit={(event) => void createKey(event)}><label>Назва ключа<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={40} placeholder="Наприклад, production backend"/></label><button type="submit" className="integrationPrimary" disabled={busy || !isPro || activeKeys.length >= 5}><Plus/>{busy ? 'Створюємо…' : 'Створити API-ключ'}</button></form>
        {!isPro && <div className="integrationUpgrade"><LockKeyhole/>Створення ключів доступне лише для Sift Pro. <Link href="/#pricing">Переглянути тариф <ArrowRight/></Link></div>}
        <div className="apiKeyList">{(state.keys || []).length ? state.keys!.map((key) => <article key={key.id} className={key.revoked_at ? 'revoked' : ''}><span className="apiKeyGlyph"><KeyRound/></span><div><b>{key.label}</b><code>{key.key_prefix}••••••••••</code><small>{key.revoked_at ? `Відкликано ${new Date(key.revoked_at).toLocaleDateString('uk-UA')}` : key.last_used_at ? `Останній запит ${new Date(key.last_used_at).toLocaleString('uk-UA')}` : 'Ще не використовувався'}</small></div>{!key.revoked_at && <button type="button" className="apiKeyRevoke" onClick={() => void revokeKey(key.id)} disabled={busy} aria-label={`Відкликати ключ ${key.label}`}><Trash2/></button>}</article>) : <div className="integrationEmpty"><KeyRound/><b>API-ключів ще немає</b><span>Створіть ключ і передайте його у заголовку Authorization: Bearer.</span></div>}</div>
        <div className="apiSecurityNote"><ShieldCheck/>Секрет показується один раз після створення. Збережіть його у менеджері секретів сервера. Не додавайте ключ до браузерного коду або репозиторію.</div>
      </section>
      <footer className="integrationFoot"><Link href="/api-docs">API документація</Link><span>·</span><Link href="/dashboard">Dashboard</Link><span>·</span><a href="/api/v1/openapi.json">OpenAPI JSON</a></footer>
    </div>
    {oneTimeKey && <div className="oneTimeOverlay" role="presentation" onMouseDown={() => setOneTimeKey(null)}><section role="dialog" aria-modal="true" aria-labelledby="one-time-title" onMouseDown={(event) => event.stopPropagation()}><button className="oneTimeClose" type="button" aria-label="Закрити" onClick={() => setOneTimeKey(null)}><X/></button><span className="integrationIcon violet"><KeyRound/></span><small>СКОПІЮЙТЕ ЗАРАЗ</small><h2 id="one-time-title">Новий API-ключ створено</h2><p>Повне значення більше не буде показано. Збережіть його у менеджері секретів вашого сервера.</p><code className="oneTimeSecret">{oneTimeKey.secret}</code><button type="button" className="integrationPrimary" onClick={() => void copy(oneTimeKey.secret, 'API-ключ')}><Copy/>Копіювати ключ</button><button type="button" className="oneTimeDone" onClick={() => setOneTimeKey(null)}>Готово, я зберіг ключ</button></section></div>}
  </main>;
}
