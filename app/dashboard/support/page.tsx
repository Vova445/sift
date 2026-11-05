'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Clock3, Flag, LoaderCircle, LockKeyhole, RefreshCw, RotateCcw, Search, Shield, TriangleAlert, X } from 'lucide-react';
import { useBodyScrollLock } from '../../useBodyScrollLock';
import { useAccessibleDialog } from '../../useAccessibleDialog';
import './support.css';
import AccessGate from '../AccessGate';

type UserRow = { id: string; email: string; created_at: string; verified_at: string | null };
type FlagRow = { flag_key: 'ai_translation' | 'email_reminders' | 'tos_monitoring' | 'subscription_radar' | 'dark_pattern_detector'; enabled: number; description: string; updated_at: string; updated_by: string };
type Order = { order_reference: string; plan: 'one' | 'pro'; amount_uah: number; currency: string; status: string; test_mode: number; created_at: string; updated_at: string; expires_at: string };
type BillingEvent = { event_key: string; order_reference: string; event_type: string; signature_valid: number; processing_status: string; attempts: number; error_message: string | null; received_at: string; updated_at: string; processed_at: string | null; event_data_json: string };
type Refund = { id: string; order_reference: string; amount_uah: number; reason: string; status: string; provider_reason_code: string | null; created_at: string; updated_at: string };
type Details = {
  user: UserRow;
  orders: Order[];
  subscriptionPayments: Array<Record<string, unknown>>;
  subscriptions: Array<{ id: string; plan: string; status: string; credits: number; test_mode: number; created_at: string; expires_at: string; cancel_at_period_end: number; recurring_order_reference: string | null }>;
  billingEvents: BillingEvent[];
  refunds: Refund[];
};
type Audit = { id: string; actor_user_id: string; actor_email: string; action: string; target_user_id: string | null; target_email: string | null; order_reference: string | null; details_json: string; created_at: string };
type SupportActionResult = { error?: string; message?: string; enabled?: boolean; [key: string]: unknown };
type BillingMode = 'sandbox' | 'live';

const flagTitle = (key: string) => key === 'ai_translation' ? 'AI-переклад доказів' : key === 'email_reminders' ? 'Email-нагадування' : key === 'subscription_radar' ? 'Subscription Radar' : key === 'dark_pattern_detector' ? 'Детектор темних патернів' : 'Моніторинг змін умов';
const fmtDate = (value: string) => new Date(value).toLocaleString('uk-UA', { dateStyle: 'medium', timeStyle: 'short' });
const merchantPortal = 'https://m.wayforpay.com/account/site/login?language=uk&to=personal';

function auditDetails(detailsJson: string) {
  try {
    const details = JSON.parse(detailsJson) as Record<string, unknown>;
    return Object.entries(details)
      .filter(([key, value]) => ['reason', 'providerStatus', 'enabled', 'key', 'mode', 'amount', 'currency', 'resultCount'].includes(key) && value !== undefined && value !== null)
      .map(([key, value]) => `${key === 'reason' ? 'Причина' : key === 'enabled' ? 'Стан' : key === 'key' ? 'Прапорець' : key === 'mode' ? 'Режим' : key === 'amount' ? 'Сума' : key === 'currency' ? 'Валюта' : key === 'resultCount' ? 'Знайдено' : 'Статус WayForPay'}: ${typeof value === 'boolean' ? (value ? 'увімкнено' : 'вимкнено') : String(value)}`)
      .join(' · ');
  } catch {
    return '';
  }
}

export default function SupportPage() {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [selectedFlag, setSelectedFlag] = useState<FlagRow | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [details, setDetails] = useState<Details | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<'refund' | 'flag' | null>(null);
  const [reason, setReason] = useState('');
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [pendingAction, setPendingAction] = useState(false);
  const [adminAllowed, setAdminAllowed] = useState<boolean | null>(null);
  const [billingMode, setBillingMode] = useState<BillingMode>('live');

  const modalRef = useAccessibleDialog<HTMLElement>(Boolean(modal), () => { if (!pendingAction) setModal(null); });
  useBodyScrollLock(Boolean(modal));

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/support', { cache: 'no-store' });
      const body = await response.json() as { error?: string; flags?: FlagRow[]; audit?: Audit[]; billingMode?: BillingMode };
      if (response.status === 401 || response.status === 403) {
        setAdminAllowed(false);
        throw new Error(body.error || 'Немає доступу.');
      }
      if (!response.ok) throw new Error(body.error || 'Не вдалося завантажити support tools.');
      setAdminAllowed(true);
      setFlags(body.flags || []);
      setAudit(body.audit || []);
      setBillingMode(body.billingMode === 'sandbox' ? 'sandbox' : 'live');
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Помилка завантаження');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadBase(), 0);
    return () => window.clearTimeout(timer);
  }, [loadBase]);

  async function searchUsers(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) { setError('Введіть щонайменше 2 символи email.'); return; }
    setBusy(true);
    setError('');
    setDetails(null);
    try {
      const response = await fetch(`/api/admin/support?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' });
      const body = await response.json() as { error?: string; users?: UserRow[] };
      if (!response.ok) throw new Error(body.error || 'Пошук не вдався');
      setUsers(body.users || []);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Пошук не вдався');
    } finally {
      setBusy(false);
    }
  }

  async function selectUser(user: UserRow) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/support?userId=${encodeURIComponent(user.id)}`, { cache: 'no-store' });
      const body = await response.json() as Details & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Не вдалося відкрити профіль');
      setDetails(body);
      setUsers([user]);
      setSelectedOrder(null);
      await loadBase();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Не вдалося відкрити профіль');
    } finally {
      setBusy(false);
    }
  }

  async function postSupport(path: string, body: Record<string, unknown>) {
    setPendingAction(true);
    setNotice('');
    setError('');
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json() as SupportActionResult;
      if (!response.ok && response.status !== 202) throw new Error(data.error || 'Дія не виконана');
      setNotice(data.message || data.error || 'Зміни збережено.');
      setModal(null);
      setReason('');
      setConfirmationChecked(false);
      if (details) await selectUser(details.user);
      await loadBase();
      return data;
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Дія не виконана');
      return null;
    } finally {
      setPendingAction(false);
    }
  }

  const currentSub = details?.subscriptions.find(subscription => subscription.plan === 'pro' && ['active', 'trialing'].includes(subscription.status));
  const canRefund = (order: Order) => order.status === 'paid' && (billingMode === 'sandbox' ? order.test_mode === 1 : order.test_mode === 0);

  async function changeFlag(flag: FlagRow) {
    if (reason.trim().length < 4) { setError('Вкажіть причину зміни прапорця.'); return; }
    const result = await postSupport('/api/admin/support', { action: 'set_flag', key: flag.flag_key, enabled: !flag.enabled, reason: reason.trim() });
    if (result) setFlags(old => old.map(item => item.flag_key === flag.flag_key ? { ...item, enabled: result.enabled ? 1 : 0, updated_at: new Date().toISOString() } : item));
  }

  if(adminAllowed===false)return <AccessGate variant="restricted"/>;
  return <main className="supportPage"><div className="supportShell">
    <header className="supportTop"><a href="/dashboard"><ArrowLeft />До Dashboard</a><span><Shield /> SUPPORT CONSOLE</span><button onClick={() => void loadBase()} disabled={loading}><RefreshCw className={loading ? 'supportSpin' : ''} />Оновити</button></header>
    <section className="supportHero"><div><small>ВНУТРІШНІ ІНСТРУМЕНТИ</small><h1>Допомога клієнтам<br /><em>без SQL.</em></h1><p>Пошук акаунтів, звірка WayForPay, повернення та контроль функцій. Кожна дія потрапляє в журнал.</p></div><div className="supportHeroBadge"><LockKeyhole /><b>Доступ за allowlist</b><span>Підтверджений email · режим платежів: <strong>{billingMode === 'sandbox' ? 'TEST / sandbox' : 'PRODUCTION'}</strong></span></div></section>
    {error && <div className="supportAlert" role="alert"><TriangleAlert />{error}</div>}{notice && <div className="supportNotice" role="status"><Check />{notice}</div>}{adminAllowed && <a className="supportDomainCorrectionsLink" href="/dashboard/support/domains">Черга звернень власників доменів →</a>}
    {adminAllowed === false ? <section className="supportDenied"><LockKeyhole /><h2>Доступ обмежений</h2><p>Увійдіть під підтвердженим акаунтом зі списку <code>SUPPORT_ADMIN_EMAILS</code> або <code>ANALYTICS_ADMIN_EMAIL</code>.</p><a href="/dashboard">Повернутися до Dashboard</a></section> : <>
      <section className="supportSearch"><div><small>КАТАЛОГ КОРИСТУВАЧІВ</small><h2>Знайти акаунт</h2><p>Пошук за частиною email. Деталі відображають тільки потрібну підтримці інформацію.</p></div><form onSubmit={searchUsers}><label htmlFor="support-user-search">Email користувача</label><div><Search /><input id="support-user-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="name@example.com" autoComplete="off" /><button disabled={busy || query.trim().length < 2}>{busy ? <LoaderCircle className="supportSpin" /> : 'Знайти'}</button></div></form></section>
      {users.length > 0 && !details && <section className="supportUserList" aria-label="Результати пошуку">{users.map(user => <button key={user.id} onClick={() => void selectUser(user)}><span className="supportAvatar">{user.email[0]?.toUpperCase()}</span><span><b>{user.email}</b><small>{user.verified_at ? 'Email підтверджено' : 'Email не підтверджено'} · акаунт від {new Date(user.created_at).toLocaleDateString('uk-UA')}</small></span><ChevronRight /></button>)}</section>}
      {details && <section className="supportDetails"><header className="supportSectionHead"><div><small>ПРОФІЛЬ КОРИСТУВАЧА</small><h2>{details.user.email}</h2><p>{details.user.verified_at ? 'Email підтверджено' : 'Email не підтверджено'} · створено {fmtDate(details.user.created_at)}</p></div><button onClick={() => { setDetails(null); setSelectedOrder(null); }}><X />Закрити профіль</button></header>
        <div className="supportStats"><article><small>ЗАМОВЛЕНЬ</small><b>{details.orders.length}</b></article><article><small>ПЛАТІЖНИХ ПОДІЙ</small><b>{details.billingEvents.length}</b></article><article><small>ПІДПИСКА PRO</small><b>{currentSub ? 'Активна' : 'Не активна'}</b></article></div>
        <div className="supportBlock"><header><h3>Оплати й дії підтримки</h3><span>Сума збережена в D1; повтори callback показані окремо. Звірка перевіряє підписану відповідь WayForPay.</span></header>
          {details.orders.length ? <div className="supportOrdersTableWrap"><table className="supportOrdersTable"><caption className="supportSrOnly">WayForPay замовлення користувача</caption><colgroup><col style={{ width: '19%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '10%' }} /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} /><col style={{ width: '23%' }} /></colgroup><thead><tr><th scope="col">Замовлення</th><th scope="col">Сума</th><th scope="col">Режим</th><th scope="col">Статус</th><th scope="col">Callbacks</th><th scope="col">Квитанція</th><th scope="col">Дії</th></tr></thead><tbody>
            {details.orders.map(order => {
              const events = details.billingEvents.filter(event => event.order_reference === order.order_reference);
              const retryCount = events.reduce((total, event) => total + Math.max(0, Number(event.attempts || 0) - 1), 0);
              const isSelected = selectedOrder?.order_reference === order.order_reference;
              const showReconcile = billingMode === 'live' && order.test_mode === 0 && ['pending', 'paid'].includes(order.status) && (order.status === 'pending' || !details.subscriptions.some(subscription => subscription.id === order.order_reference && ['active', 'trialing'].includes(subscription.status)));
              return <Fragment key={order.order_reference}><tr>
                <td data-label="Замовлення"><b>{order.plan === 'pro' ? 'Sift Pro' : 'One Sift'}</b><code>{order.order_reference}</code><small>{fmtDate(order.created_at)}</small></td>
                <td data-label="Сума"><b>₴{order.amount_uah}</b><small>{order.currency}</small></td>
                <td data-label="Режим"><span className={`supportModeBadge ${order.test_mode ? 'test' : 'production'}`}>{order.test_mode ? 'TEST' : 'PROD'}</span></td>
                <td data-label="Статус"><span className={`supportStatus ${order.status}`}>{order.status}</span></td>
                <td data-label="Callbacks"><b>{events.length} подій</b><small>{retryCount} повторів · {events.reduce((total, event) => total + Number(event.attempts || 0), 0)} спроб</small></td>
                <td data-label="Квитанція"><a className="supportReceiptLink" href={merchantPortal} target="_blank" rel="noopener noreferrer">Кабінет WayForPay ↗</a></td>
                <td data-label="Дії"><div className="supportOrderActions"><button onClick={() => setSelectedOrder(isSelected ? null : order)} className="supportGhost">{isSelected ? 'Сховати' : 'Деталі'}</button>{showReconcile && <button onClick={() => void postSupport('/api/admin/support', { action: 'reconcile_payment', orderReference: order.order_reference })} disabled={pendingAction}><RefreshCw />Звірити оплату</button>}{canRefund(order) && <button className="supportRefundButton" onClick={() => { setSelectedOrder(order); setReason(''); setConfirmationChecked(false); setModal('refund'); }}><RotateCcw />{billingMode === 'sandbox' ? 'Тестове повернення' : 'Повернути кошти'}</button>}</div></td>
              </tr>{isSelected && <tr className="supportOrderDetailsRow"><td colSpan={7}><aside className="supportSelectedOrder"><b>Деталі замовлення</b><span>План: {order.plan === 'pro' ? 'Sift Pro' : 'One Sift'} · статус: {order.status} · сума: ₴{order.amount_uah} {order.currency}</span><span>Режим: {order.test_mode ? 'тестовий' : 'production'} · Створено: {fmtDate(order.created_at)} · Оновлено: {fmtDate(order.updated_at)}</span><span>Термін замовлення: {fmtDate(order.expires_at)} · Callback-подій: {events.length} · повторних спроб: {retryCount}</span><span>WayForPay не передав посилання на квитанцію в callback. Відкрийте кабінет і журнал операцій, щоб знайти чек за номером замовлення.</span>{details.refunds.filter(refund => refund.order_reference === order.order_reference).map(refund => <small className="supportRefundMeta" key={refund.id}>Повернення: {refund.status} · {refund.reason} · {refund.provider_reason_code || 'без коду'}</small>)}</aside></td></tr>}</Fragment>;
            })}
          </tbody></table></div> : <div className="supportEmpty">У цього користувача ще немає замовлень.</div>}</div>
        {details.subscriptionPayments.length > 0 && <div className="supportBlock"><header><h3>Історія продовжень</h3><span>Локальний журнал періодичних списань Pro.</span></header><div className="supportEventTable">{details.subscriptionPayments.map((raw, index) => { const payment = raw as { order_reference: string; amount_uah: number; status: string; period_start: string | null; period_end: string | null; created_at: string; paid_at: string | null }; return <article key={`${payment.order_reference}-${index}`}><div><b>₴{payment.amount_uah} · {payment.status}</b><small>{payment.order_reference}</small></div><span className={`supportStatus ${payment.status}`}>{payment.status}</span><small className="supportPaymentPeriod">{payment.paid_at ? `Оплачено ${fmtDate(payment.paid_at)}` : fmtDate(payment.created_at)}{payment.period_start && payment.period_end ? ` · період ${new Date(payment.period_start).toLocaleDateString('uk-UA')}–${new Date(payment.period_end).toLocaleDateString('uk-UA')}` : ''}</small></article>; })}</div></div>}
        <div className="supportBlock"><header><h3>Події WayForPay</h3><span>Підпис, повторні спроби, причина відмови та callback без карткових реквізитів.</span></header>{details.billingEvents.length ? <div className="supportEventTable">{details.billingEvents.map(event => <article key={event.event_key}><div><b>{event.event_type}</b><small>{fmtDate(event.received_at)} · {event.order_reference}</small></div><span className={event.signature_valid ? 'eventValid' : 'eventInvalid'}>{event.signature_valid ? 'Підпис валідний' : 'Підпис невалідний'}</span><span className={`supportStatus ${event.processing_status}`}>{event.processing_status} · {event.attempts} спроб</span>{event.error_message && <p>{event.error_message}</p>}<details><summary>Дані події</summary><pre>{JSON.stringify(JSON.parse(event.event_data_json || '{}'), null, 2)}</pre></details></article>)}</div> : <div className="supportEmpty">Подій для цього користувача немає.</div>}</div>
      </section>}
      <div className="supportLowerGrid"><section className="supportBlock supportFlags"><header><h3><Flag />Керування функціями</h3><span>Перемикачі впливають на серверні маршрути.</span></header>{flags.map(flag => <article key={flag.flag_key}><div><b>{flagTitle(flag.flag_key)}</b><p>{flag.description}</p><small>Оновлено: {flag.updated_at.startsWith('1970') ? 'за замовчуванням' : fmtDate(flag.updated_at)}</small></div><button className={flag.enabled ? 'flagToggle enabled' : 'flagToggle'} aria-pressed={Boolean(flag.enabled)} onClick={() => { setSelectedOrder(null); setReason(''); setModal('flag'); setSelectedFlag(flag); }}>{flag.enabled ? 'Увімкнено' : 'Вимкнено'}</button></article>)}</section>
        <section className="supportBlock supportAudit"><header><h3><Clock3 />Журнал дій</h3><span>Останні 50 записів у зворотному хронологічному порядку.</span></header>{audit.length ? <ol>{audit.map(item => <li key={item.id}><span className="auditDot" /><div><b>{item.action.replaceAll('_', ' ')}</b><p>{item.actor_email}{item.target_email ? ` → ${item.target_email}` : ''}{item.order_reference ? ` · ${item.order_reference}` : ''}</p>{auditDetails(item.details_json) && <p className="supportAuditDetails">{auditDetails(item.details_json)}</p>}<small>{fmtDate(item.created_at)}</small></div></li>)}</ol> : <div className="supportEmpty">Дії підтримки з’являться тут.</div>}</section></div>
    </>}
  </div>
  {modal && <div className="supportModalBackdrop" onMouseDown={() => !pendingAction && setModal(null)}><section className="supportModal" role="dialog" aria-modal="true" aria-labelledby="support-modal-title" tabIndex={-1} ref={modalRef} onMouseDown={event => event.stopPropagation()}><button className="supportModalClose" onClick={() => setModal(null)} aria-label="Закрити" disabled={pendingAction}><X /></button>{modal === 'refund' ? <><span className="supportModalIcon danger"><RotateCcw /></span><small>{billingMode === 'sandbox' ? 'ТЕСТОВЕ ПОВЕРНЕННЯ WAYFORPAY' : 'ПОВНЕ ПОВЕРНЕННЯ WAYFORPAY'}</small><h2 id="support-modal-title">Повернути ₴{selectedOrder?.amount_uah}?</h2><p>{billingMode === 'sandbox' ? 'Тестове середовище: реальні кошти не списуються. Запит і результат буде записано в аудит.' : 'Це фінансова дія. Сервер бере суму із замовлення, а для Pro спершу зупиняє автопродовження.'}</p><label htmlFor="support-refund-reason">Причина<textarea id="support-refund-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={250} placeholder="Коротко опишіть причину для аудиту й WayForPay" /></label><label className="supportConfirmCheck"><input type="checkbox" checked={confirmationChecked} onChange={event => setConfirmationChecked(event.target.checked)} /><span className="supportCustomCheckbox" aria-hidden="true"><Check /></span><span>Підтверджую повне повернення коштів для цього замовлення. Дію буде записано в аудит.</span></label><button className="supportDangerAction" disabled={pendingAction || reason.trim().length < 8 || !confirmationChecked} onClick={() => void postSupport('/api/admin/support/refund', { orderReference: selectedOrder?.order_reference, reason, confirmation: confirmationChecked })}>{pendingAction ? 'Надсилаємо запит…' : billingMode === 'sandbox' ? 'Виконати тестове повернення' : 'Підтвердити повне повернення'}</button></> : <><span className="supportModalIcon"><Flag /></span><small>ЗМІНА FEATURE FLAG</small><h2 id="support-modal-title">{selectedFlag?.enabled ? 'Вимкнути' : 'Увімкнути'} {selectedFlag ? flagTitle(selectedFlag.flag_key) : 'функцію'}?</h2><p>Зміна одразу вплине на серверну доступність функції та буде записана до аудиту.</p><label htmlFor="support-flag-reason">Причина<textarea id="support-flag-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={300} placeholder="Причина зміни — буде записана в аудит" /></label><button className="supportPrimaryAction" disabled={pendingAction || reason.trim().length < 4} onClick={() => selectedFlag && void changeFlag(selectedFlag)}>{pendingAction ? 'Зберігаємо…' : 'Зберегти зміну'}</button></>}</section></div>}
  </main>;
}
