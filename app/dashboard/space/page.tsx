'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Copy, CreditCard, Link2, LogOut, Plus, ShieldCheck, Trash2, UsersRound, X } from 'lucide-react';
import './space.css';

type Member = { user_id: string; email: string; role: 'owner' | 'member'; joined_at: string };
type Item = { id: string; title: string; service_url: string | null; amount_minor: number | null; currency: 'UAH' | 'USD' | 'EUR' | 'GBP'; next_charge_date: string | null; status: 'active' | 'canceling' | 'canceled'; note: string; assigned_to_user_id: string | null; created_by_user_id: string; assigned_email: string | null; created_by_email: string };
type Invite = { id: string; expires_at: string; uses_count: number; max_uses: number };
type Space = { id: string; owner_user_id: string; title: string; status: 'pending' | 'active' | 'expired' | 'closed'; test_mode: number; expires_at: string | null; role: 'owner' | 'member'; memberCount?: number; members: Member[]; items: Item[]; invites: Invite[]; payments: Array<{ order_reference: string; status: string; amount_uah: number; created_at: string }>; priceUah: number; termDays: number; maxMembers: number };
type Draft = { title: string; serviceUrl: string; amount: string; currency: Item['currency']; nextChargeDate: string; status: Item['status']; note: string; assignedToUserId: string };
type ApiBody = { error?: string; spaces?: Space[]; space?: Space; invite?: { id: string; url: string; expiresAt: string; maxUses: number }; spaceId?: string; alreadyMember?: boolean; ok?: boolean; status?: string; testMode?: boolean; price?: { uah: number; termDays: number; autoRenew: boolean }; periodEnd?: string; action?: string; fields?: Record<string, unknown> };
const emptyDraft: Draft = { title: '', serviceUrl: '', amount: '', currency: 'UAH', nextChargeDate: '', status: 'active', note: '', assignedToUserId: '' };
const money = (minor: number | null, currency: string) => minor === null ? 'Суму не вказано' : new Intl.NumberFormat('uk-UA', { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
const statusLabel = (status: Space['status']) => ({ pending: 'Очікує оплати', active: 'Активний', expired: 'Потрібно поновити', closed: 'Закритий' })[status];

export default function SharedSpacePage() {
  const [spaces, setSpaces] = useState<Space[]>([]), [space, setSpace] = useState<Space | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [signedIn, setSignedIn] = useState<boolean | null>(null), [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [inviteUrl, setInviteUrl] = useState(''), [draft, setDraft] = useState<Draft>(emptyDraft), [editingId, setEditingId] = useState(''), [legalAccepted, setLegalAccepted] = useState(false), [paymentBusy, setPaymentBusy] = useState(false);

  const refresh = useCallback(async (selectedId?: string) => {
    setError('');
    const response = await fetch('/api/spaces', { cache: 'no-store' });
    const body = await response.json() as ApiBody;
    if (response.status === 401) { setSignedIn(false); setSpaces([]); setSpace(null); return; }
    if (!response.ok) throw new Error(body.error || 'Не вдалося завантажити простори.');
    setSignedIn(true);
    const nextSpaces = body.spaces as Space[];
    setSpaces(nextSpaces);
    const currentId = selectedId || space?.id || nextSpaces[0]?.id;
    if (currentId) {
      const detailResponse = await fetch(`/api/spaces/${encodeURIComponent(currentId)}`, { cache: 'no-store' });
      const detail = await detailResponse.json() as ApiBody;
      if (detailResponse.ok) setSpace(detail.space || null);
      else { setSpace(null); setError(detail.error || 'Простір недоступний.'); }
    } else setSpace(null);
  }, [space?.id]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        await refresh();
        if (!active) return;
        const query = new URLSearchParams(window.location.search), inviteToken = query.get('invite'), paymentReference = query.get('spacePayment'), paymentSpaceId = query.get('spaceId');
        if (inviteToken) {
          const result = await fetch('/api/spaces/invites/accept', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: inviteToken }) });
          const body = await result.json() as ApiBody;
          if (!result.ok) throw new Error(body.error || 'Не вдалося прийняти запрошення.');
          if (active) { setNotice(body.alreadyMember ? 'Ви вже є учасником цього простору.' : 'Ви приєдналися до спільного простору.'); await refresh(body.spaceId); }
          window.history.replaceState({}, '', '/dashboard/space');
        }
        if (paymentReference) {
          const candidate = await fetch('/api/spaces', { cache: 'no-store' }).then((r) => r.json()) as ApiBody;
          const ownerSpace = (candidate.spaces || []).find((item: Space) => item.id === paymentSpaceId && item.role === 'owner' && item.status !== 'closed') || (candidate.spaces || []).find((item: Space) => item.role === 'owner' && item.status !== 'closed');
          if (ownerSpace) {
            for (let attempt = 0; attempt < 5; attempt++) {
              const status = await fetch(`/api/spaces/${encodeURIComponent(ownerSpace.id)}/billing?reference=${encodeURIComponent(paymentReference)}`, { cache: 'no-store' });
              const body = await status.json() as ApiBody;
              if (!status.ok) throw new Error(body.error || 'Не вдалося перевірити оплату.');
              if (body.status === 'paid') { setNotice('WayForPay підтвердив оплату. Спільний простір активний ще 30 днів.'); await refresh(ownerSpace.id); break; }
              if (body.status === 'declined' || body.status === 'expired') { setError('Оплату не підтверджено. Можна повторити спробу.'); break; }
              if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 1600));
            }
          }
          window.history.replaceState({}, '', '/dashboard/space');
        }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Не вдалося завантажити спільний простір.'); }
      finally { if (active) setLoading(false); }
    };
    void run();
    return () => { active = false; };
  }, [refresh]);

  const calendarItems = useMemo(() => (space?.items || []).filter((item) => item.next_charge_date && item.status !== 'canceled'), [space]);
  async function request(path: string, init?: RequestInit) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(path, init), body = await response.json() as ApiBody;
      if (!response.ok) throw new Error(body.error || 'Не вдалося виконати дію.');
      if (body.space) setSpace(body.space);
      return body;
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося виконати дію.'); return null; }
    finally { setBusy(false); }
  }
  async function createSpace(event: React.FormEvent) {
    event.preventDefault(); const body = await request('/api/spaces', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
    if (body?.space) { setTitle(''); await refresh(body.space.id); }
  }
  async function makeInvite() {
    if (!space) return;
    const body = await request(`/api/spaces/${encodeURIComponent(space.id)}/invites`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (body?.invite?.url) { setInviteUrl(body.invite.url); await refresh(space.id); }
  }
  async function saveItem(event: React.FormEvent) {
    event.preventDefault(); if (!space) return;
    const value = { title: draft.title, serviceUrl: draft.serviceUrl || null, amountMinor: draft.amount === '' ? null : Math.round(Number(draft.amount.replace(',', '.')) * 100), currency: draft.currency, nextChargeDate: draft.nextChargeDate || null, status: draft.status, note: draft.note, assignedToUserId: draft.assignedToUserId || null, ...(editingId ? { itemId: editingId } : {}) };
    if (draft.amount && (!Number.isFinite(Number(draft.amount.replace(',', '.'))) || Number(draft.amount.replace(',', '.')) < 0)) { setError('Вкажіть суму у правильному форматі.'); return; }
    const body = await request(`/api/spaces/${encodeURIComponent(space.id)}/items`, { method: editingId ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
    if (body?.space) { setDraft(emptyDraft); setEditingId(''); }
  }
  function editItem(item: Item) { setEditingId(item.id); setDraft({ title: item.title, serviceUrl: item.service_url || '', amount: item.amount_minor === null ? '' : (item.amount_minor / 100).toFixed(2), currency: item.currency, nextChargeDate: item.next_charge_date || '', status: item.status, note: item.note, assignedToUserId: item.assigned_to_user_id || '' }); document.querySelector('#space-item-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  async function deleteItem(itemId: string) { if (!space) return; await request(`/api/spaces/${encodeURIComponent(space.id)}/items`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId }) }); }
  async function removeMember(memberId: string) { if (!space) return; await request(`/api/spaces/${encodeURIComponent(space.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'remove_member', memberId }) }); }
  async function leaveSpace() { if (!space) return; const result = await request(`/api/spaces/${encodeURIComponent(space.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'leave' }) }); if (result?.ok) { setSpace(null); await refresh(); } }
  async function revokeInvite(inviteId: string) { if (!space) return; await request(`/api/spaces/${encodeURIComponent(space.id)}/invites`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inviteId }) }); }
  async function checkout() {
    if (!space || !legalAccepted) { setError('Підтвердьте умови оплати, щоб перейти до WayForPay.'); return; }
    setPaymentBusy(true); setError('');
    try {
      const response = await fetch(`/api/spaces/${encodeURIComponent(space.id)}/checkout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ legalConsent: { acceptTerms: true, acknowledgePrivacy: true, acceptRefund: true, requestImmediatePerformance: true } }) });
      const body = await response.json() as ApiBody; if (!response.ok) throw new Error(body.error || 'Не вдалося створити оплату.');
      if (!body.action || !body.fields) throw new Error('WayForPay не повернув параметри платежу.');
      const form = document.createElement('form'); form.method = 'POST'; form.action = body.action; form.acceptCharset = 'utf-8';
      for (const [key, value] of Object.entries(body.fields as Record<string, unknown>)) {
        if (Array.isArray(value)) for (const item of value) { const input = document.createElement('input'); input.type = 'hidden'; input.name = `${key}[]`; input.value = String(item); form.appendChild(input); }
        else if (value !== undefined && value !== null) { const input = document.createElement('input'); input.type = 'hidden'; input.name = key; input.value = String(value); form.appendChild(input); }
      }
      document.body.appendChild(form); form.submit();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося зв’язатися з WayForPay.'); }
    finally { setPaymentBusy(false); }
  }
  async function copyInvite(url: string) { try { await navigator.clipboard.writeText(url); setNotice('Посилання скопійовано. Його можна надіслати учаснику.'); } catch { setInviteUrl(url); setNotice('Скопіюйте посилання вручну з поля нижче.'); } }

  if (loading) return <main className="spaceLoading"><span/><p>Завантажуємо спільні простори…</p></main>;
  if (signedIn === false) {
    const returnPath = `/dashboard/space${window.location.search}`;
    const next = encodeURIComponent(returnPath);
    return <main className="spaceGate"><div className="spaceGateCard"><span className="spaceIcon"><UsersRound/></span><small>SHARED SIFT SPACE</small><h1>Спільний простір<br/>для важливих підписок.</h1><p>Увійдіть, щоб працювати зі спільним календарем, списком підписок і запрошенням.</p><Link className="spacePrimary" href={`/?login=1&next=${next}`}>Увійти до простору <ArrowRight/></Link><Link href={`/?signup=1&next=${next}`} className="spaceTextLink">Створити акаунт</Link></div></main>;
  }

  return <main className="spacePage">
    <header className="spaceTop"><Link href="/dashboard" className="spaceBack"><ArrowLeft/> Dashboard</Link><Link className="spaceBrand" href="/"><span>S</span> SIFT</Link><div className="spaceTopActions"><Link href="/">Головна</Link><button type="button" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.assign('/'); }}><LogOut/>Вийти</button></div></header>
    <div className="spaceWrap">
      <section className="spaceHero"><div><span className="spaceEyebrow"><UsersRound/> SHARED SPACE</span><h1>Ваші підписки.<br/><em>Спільна ясність.</em></h1><p>Календар списань і список сервісів, де видно ціну, дату та відповідального.</p></div><div className="spaceHeroNote"><ShieldCheck/><span>Доступ до простору перевіряє сервер для кожної дії.</span></div></section>
      {error && <div className="spaceAlert" role="alert"><span>{error}</span><button type="button" aria-label="Закрити повідомлення" onClick={() => setError('')}><X/></button></div>}
      {notice && <div className="spaceNotice" role="status"><Check/><span>{notice}</span><button type="button" aria-label="Закрити повідомлення" onClick={() => setNotice('')}><X/></button></div>}
      <section className="spaceCreate"><div><small>НОВИЙ СПІЛЬНИЙ ПРОСТІР</small><h2>Почніть для сім’ї чи команди</h2><p>Власник оплачує простір окремо у WayForPay, учасники не отримують доступ до персональних звітів.</p></div><form onSubmit={createSpace}><label htmlFor="space-name">Назва простору</label><div><input id="space-name" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={60} placeholder="Наприклад, Сім’я або Команда" required minLength={2}/><button className="spacePrimary" disabled={busy}><Plus/>{busy ? 'Створюємо…' : 'Створити'}</button></div></form></section>
      {spaces.length > 0 && <section className="spaceLayout">
        <aside className="spaceList"><div className="spaceSectionTitle"><small>ВАШІ ПРОСТОРИ</small><span>{spaces.length}</span></div>{spaces.map((item) => <button key={item.id} className={space?.id === item.id ? 'selected' : ''} onClick={() => void refresh(item.id)}><span className="spaceListIcon"><UsersRound/></span><span><b>{item.title}</b><small>{statusLabel(item.status)} · {item.role === 'owner' ? 'Власник' : 'Учасник'}</small></span><ArrowRight/></button>)}</aside>
        {space && <div className="spaceMain">
          <section className="spaceOverview"><header><div><small>СПІЛЬНИЙ ПРОСТІР</small><h2>{space.title}</h2></div><span className={`spaceStatus ${space.status}`}>{statusLabel(space.status)}</span></header><div className="spaceMeta"><span><UsersRound/>{space.members.length} з {space.maxMembers} учасників</span><span><CalendarDays/>{space.expires_at && space.status !== 'pending' ? `Доступ до ${new Date(space.expires_at).toLocaleDateString('uk-UA')}` : 'Оплата відкриє доступ на 30 днів'}</span><span>{space.role === 'owner' ? 'Власник простору' : 'Учасник простору'}</span></div></section>
          {space.role === 'owner' && space.status !== 'closed' && <section className="spaceBilling"><div className="spaceBillingIcon"><CreditCard/></div><div className="spaceBillingCopy"><small>ОКРЕМА ОПЛАТА WAYFORPAY</small><h3>{space.status === 'pending' ? 'Активуйте простір для учасників' : space.status === 'expired' ? 'Поновіть спільний доступ' : 'Додайте ще 30 днів доступу'}</h3><p>Разова оплата <b>119 ₴ за 30 днів</b>. {space.status === 'active' ? 'Чинний доступ збережеться, нові дні додадуться після його завершення. ' : ''}Автопродовження немає — власник поновлює доступ вручну.</p><label className="spaceConsent"><input type="checkbox" checked={legalAccepted} onChange={(event) => setLegalAccepted(event.target.checked)}/><span>Приймаю <a href="/terms" target="_blank" rel="noreferrer">Умови</a>, <a href="/refund" target="_blank" rel="noreferrer">умови повернення</a>, ознайомився з <a href="/privacy" target="_blank" rel="noreferrer">Політикою приватності</a> та прошу почати послугу одразу.</span></label></div><button className="spacePrimary" onClick={() => void checkout()} disabled={paymentBusy}>{paymentBusy ? 'Готуємо оплату…' : 'Перейти до оплати'}<ArrowRight/></button></section>}
          {space.status === 'closed' && <section className="spaceEmpty"><ShieldCheck/><h3>Цей простір закрито</h3><p>Спільні дані більше недоступні.</p></section>}
          {space.status === 'active' && <>
            <section className="spaceMembers"><header><div><small>OWNER + MEMBERS</small><h3>Учасники</h3></div>{space.role === 'owner' && <button className="spaceSecondary" onClick={() => void makeInvite()} disabled={busy || space.members.length >= space.maxMembers}><Link2/>{busy ? 'Готуємо…' : 'Створити запрошення'}</button>}{space.role === 'member' && <button className="spaceSecondary" onClick={() => void leaveSpace()} disabled={busy}>Вийти з простору</button>}</header>
              <div className="spaceMemberList">{space.members.map((member) => <article key={member.user_id}><span className={`memberAvatar ${member.role}`}>{member.role === 'owner' ? 'O' : member.email.slice(0, 1).toUpperCase()}</span><span><b>{member.email}</b><small>{member.role === 'owner' ? 'Власник · керує оплатою й учасниками' : 'Учасник · додає та веде власні записи'}</small></span>{space.role === 'owner' && member.role === 'member' && <button className="spaceIconButton" aria-label={`Видалити ${member.email}`} onClick={() => void removeMember(member.user_id)}><Trash2/></button>}</article>)}</div>
              {inviteUrl && <div className="spaceInviteShare"><div><small>ПРИВАТНЕ ПОСИЛАННЯ · ДІЄ 7 ДНІВ</small><input aria-label="Посилання-запрошення" value={inviteUrl} readOnly onFocus={(event) => event.currentTarget.select()}/></div><button className="spacePrimary" onClick={() => void copyInvite(inviteUrl)}><Copy/>Копіювати</button></div>}
              {space.role === 'owner' && space.invites.length > 0 && <div className="spaceInviteList">{space.invites.map((invite) => <article key={invite.id}><span><b>Активне запрошення</b><small>Використано {invite.uses_count} з {invite.max_uses} · до {new Date(invite.expires_at).toLocaleDateString('uk-UA')}</small></span><button onClick={() => void revokeInvite(invite.id)}>Скасувати</button></article>)}</div>}
            </section>
            <section className="spaceCalendar"><header><div><small>SHARED CALENDAR</small><h3>Найближчі списання</h3></div><span>{calendarItems.length} дат</span></header>{calendarItems.length ? <div className="spaceCalendarList">{calendarItems.map((item) => <article key={item.id}><span className="chargeDate"><CalendarDays/><b>{new Date(`${item.next_charge_date}T12:00:00`).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}</b></span><span className="chargeService"><b>{item.title}</b><small>{item.assigned_email ? `Відповідальний: ${item.assigned_email}` : 'Відповідального не призначено'}</small></span><strong>{money(item.amount_minor, item.currency)}</strong></article>)}</div> : <div className="spaceCalendarEmpty"><CalendarDays/><span>Додайте підписку з датою списання — вона з’явиться тут.</span></div>}</section>
            <section className="spaceItems"><header><div><small>SHARED WATCHLIST</small><h3>Сервіси та підписки</h3></div><span>{space.items.length} записів</span></header>{space.items.length ? <div className="spaceItemList">{space.items.map((item) => <article key={item.id}><div className="spaceItemHeading"><span className="spaceItemDot"/><div><b>{item.title}</b><small>{item.service_url ? <a href={item.service_url} target="_blank" rel="noreferrer">Відкрити сервіс <ArrowRight/></a> : 'Посилання не додано'}</small></div><span className={`itemStatus ${item.status}`}>{item.status === 'active' ? 'Активна' : item.status === 'canceling' ? 'Скасовується' : 'Скасована'}</span></div><div className="spaceItemDetails"><strong>{money(item.amount_minor, item.currency)}</strong><span>{item.next_charge_date ? `Наступне списання ${new Date(`${item.next_charge_date}T12:00:00`).toLocaleDateString('uk-UA')}` : 'Дату списання не вказано'}</span><span>{item.assigned_email ? `Відповідає: ${item.assigned_email}` : 'Без відповідального'}</span></div>{item.note && <p className="spaceItemNote">{item.note}</p>}<div className="spaceItemActions"><small>Додав(ла): {item.created_by_email}</small>{(space.role === 'owner' || item.created_by_user_id === space.members.find((member) => member.email === item.created_by_email)?.user_id) && <><button onClick={() => editItem(item)}>Редагувати</button><button onClick={() => void deleteItem(item.id)}><Trash2/>Видалити</button></>}</div></article>)}</div> : <div className="spaceCalendarEmpty"><UsersRound/><span>Поки немає спільних записів. Додайте першу підписку нижче.</span></div>}
              <form id="space-item-form" className="spaceItemForm" onSubmit={(event) => void saveItem(event)}><div className="spaceFormTitle"><span>{editingId ? 'ОНОВИТИ ЗАПИС' : 'ДОДАТИ ПІДПИСКУ'}</span>{editingId && <button type="button" onClick={() => { setDraft(emptyDraft); setEditingId(''); }}>Скасувати редагування</button>}</div><div className="spaceFormGrid"><label>Назва<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Наприклад, Хмарне сховище" required minLength={2} maxLength={100}/></label><label>Посилання<input type="url" value={draft.serviceUrl} onChange={(event) => setDraft({ ...draft, serviceUrl: event.target.value })} placeholder="https://service.com"/></label><label>Сума за період<div className="spaceAmount"><input inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder="0,00"/><select aria-label="Валюта" value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value as Item['currency'] })}>{['UAH', 'USD', 'EUR', 'GBP'].map((currency) => <option key={currency}>{currency}</option>)}</select></div></label><label>Наступне списання<input type="date" value={draft.nextChargeDate} onChange={(event) => setDraft({ ...draft, nextChargeDate: event.target.value })}/></label><label>Стан<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Item['status'] })}><option value="active">Активна</option><option value="canceling">Скасовується</option><option value="canceled">Скасована</option></select></label><label>Хто відповідає<select value={draft.assignedToUserId} onChange={(event) => setDraft({ ...draft, assignedToUserId: event.target.value })}><option value="">Не призначено</option>{space.members.map((member) => <option key={member.user_id} value={member.user_id}>{member.email}</option>)}</select></label><label className="spaceNoteField">Нотатка<textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} rows={2} maxLength={1000} placeholder="Деталі для всіх учасників"/></label></div><button className="spacePrimary" disabled={busy}><Check/>{busy ? 'Зберігаємо…' : editingId ? 'Зберегти зміни' : 'Додати до спільного простору'}</button></form>
            </section>
          </>}
        </div>}
      </section>}
      {!spaces.length && <section className="spaceFirst"><span className="spaceIcon"><UsersRound/></span><h2>Створіть простір і запросіть своїх</h2><p>Після окремої оплати WayForPay власник зможе запросити до чотирьох учасників. Підписки та дати списань будуть видимі всім у спільному календарі.</p></section>}
      <footer className="spaceFoot"><ShieldCheck/>Кожен API-запит перевіряє членство в просторі. Оплата спільного доступу не змінює персональні тарифи.</footer>
    </div>
  </main>;
}
