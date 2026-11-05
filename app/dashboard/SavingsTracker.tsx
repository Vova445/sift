'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, BadgeCheck, Check, CircleDollarSign, FileSpreadsheet, Pencil, Share2, Trash2 } from 'lucide-react';
import './savings.css';

type Outcome = 'not_bought' | 'canceled' | 'refunded';
type ReportOption = { id: string; title: string; url: string };
type Entry = { id: string; scanId: string; outcome: Outcome; amountMinor: number; confirmedAt: string; confirmedDate: string; title: string; url: string };
type Data = { entries: Entry[]; summary: { monthMinor: number; yearMinor: number; entryCount: number; currency: 'UAH' } };

const outcomeLabels: Record<Outcome, string> = { not_bought: 'Не купив', canceled: 'Скасував підписку', refunded: 'Повернув кошти' };
const money = (minor: number) => new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', maximumFractionDigits: 2 }).format(minor / 100);

export default function SavingsTracker({ reports }: { reports: ReportOption[] }) {
  const [data, setData] = useState<Data>({ entries: [], summary: { monthMinor: 0, yearMinor: 0, entryCount: 0, currency: 'UAH' } });
  const [reportId, setReportId] = useState('');
  const [outcome, setOutcome] = useState<Outcome>('not_bought');
  const [amount, setAmount] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sectionRef = useRef<HTMLElement>(null);
  const entriesRef = useRef(data.entries);
  const existing = useMemo(() => data.entries.find((entry) => entry.scanId === reportId) || null, [data.entries, reportId]);

  function selectReport(scanId: string) {
    setReportId(scanId);
    const entry = entriesRef.current.find((item) => item.scanId === scanId);
    setOutcome(entry?.outcome || 'not_bought');
    setAmount(entry ? (entry.amountMinor / 100).toFixed(2) : '');
    setConfirmed(false);
  }

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/savings', { cache: 'no-store' });
      const body = await response.json() as Data & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Не вдалося оновити трекер.');
      entriesRef.current = body.entries;
      setData(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося завантажити Savings Tracker.');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    const onUpdate = () => { void refresh(); };
    const onOpen = (event: Event) => {
      const scanId = (event as CustomEvent<{ scanId?: string }>).detail?.scanId;
      if (!scanId) return;
      selectReport(scanId); setError(''); setNotice('');
      window.setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    };
    window.addEventListener('sift:savings-updated', onUpdate);
    window.addEventListener('sift:savings-open', onOpen);
    return () => { window.removeEventListener('sift:savings-updated', onUpdate); window.removeEventListener('sift:savings-open', onOpen); };
  }, [refresh]);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/savings', { method: existing ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scanId: reportId, outcome, amount, confirmed }) });
      const body = await response.json() as { error?: string; fxAvailable?: boolean };
      if (!response.ok) throw new Error(body.error || 'Не вдалося зберегти запис.');
      setConfirmed(false); setNotice(body.fxAvailable === false ? 'Запис збережено. Курс НБУ тимчасово недоступний, тому ця сума поки не врахована у прогресі бейджа «Заощадник». Відредагуйте запис, коли курс відновиться.' : existing ? 'Запис оновлено.' : 'Підтверджену дію додано до трекера.');
      await refresh(); window.dispatchEvent(new Event('sift:savings-updated'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося зберегти. Спробуйте ще раз.'); }
    finally { setBusy(false); }
  }

  async function remove(entryId: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/savings', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entryId }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Не вдалося видалити запис.');
      setNotice('Запис видалено.'); await refresh(); window.dispatchEvent(new Event('sift:savings-updated'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не вдалося видалити запис.'); }
    finally { setBusy(false); }
  }

  function edit(entry: Entry) {
    selectReport(entry.scanId);
    setError(''); setNotice('');
    window.setTimeout(() => document.getElementById('savings-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  async function shareCard() {
    setError(''); setNotice('');
    try {
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Не вдалося створити картку на цьому пристрої.');
      context.fillStyle = '#10130f'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#b0f35a'; context.beginPath(); context.roundRect(70, 62, 72, 72, 22); context.fill();
      context.fillStyle = '#10130f'; context.font = '700 42px Arial'; context.fillText('S', 94, 113);
      context.fillStyle = '#f6f7f2'; context.font = '700 28px Arial'; context.fillText('SIFT · МОЯ ЕКОНОМІЯ', 166, 108);
      context.fillStyle = '#aab3a4'; context.font = '24px Arial'; context.fillText('Підтверджені мною дії в Savings Tracker', 72, 194);
      context.fillStyle = '#b0f35a'; context.font = '700 72px Arial'; context.fillText(money(data.summary.yearMinor), 72, 310);
      context.fillStyle = '#f6f7f2'; context.font = '26px Arial'; context.fillText('зафіксовано цього року', 74, 354);
      context.fillStyle = '#c5cebd'; context.font = '24px Arial'; context.fillText(`Цього місяця: ${money(data.summary.monthMinor)}   ·   Дій: ${data.summary.entryCount}`, 74, 430);
      context.fillStyle = '#879181'; context.font = '18px Arial'; context.fillText('Суми внесені користувачем і не звірені з банківськими транзакціями.', 74, 550);
      context.fillStyle = '#879181'; context.font = '18px Arial'; context.fillText('Sift · Savings Tracker', 900, 580);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((file) => file ? resolve(file) : reject(new Error('Не вдалося підготувати PNG-картку.')), 'image/png'));
      const file = new File([blob], 'sift-savings.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Моя економія з Sift' });
      else { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'sift-savings.png'; link.click(); URL.revokeObjectURL(url); setNotice('PNG-картку завантажено. Її можна надіслати в месенджері.'); }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : 'Не вдалося створити картку для поширення.');
    }
  }

  return <section className="savingsTracker" ref={sectionRef} aria-labelledby="savings-title">
    <header className="savingsHeader"><div><small>ВАША ПЕРСОНАЛЬНА ЕКОНОМІЯ</small><h2 id="savings-title">Ваша зафіксована економія</h2><p>Записуйте суму після свого рішення за конкретним звітом.</p></div><span className="savingsTrust"><BadgeCheck aria-hidden="true"/>Ви підтверджуєте суму</span></header>
    <div className="savingsTotals"><article><small>ЦЬОГО МІСЯЦЯ</small><b>{money(data.summary.monthMinor)}</b><span>За підтвердженими діями</span></article><article><small>ЦЬОГО РОКУ</small><b>{money(data.summary.yearMinor)}</b><span>Від початку року</span></article></div>
    <p className="savingsBankNote"><BadgeCheck aria-hidden="true"/><span><b>Sift не звіряє суму з банком.</b> Ви самі підтверджуєте результат і суму.</span></p>
    <div className="savingsBody"><form id="savings-form" className="savingsForm" onSubmit={save}>
      <div><small>{existing ? 'ОНОВИТИ ДІЮ' : 'ДОДАТИ ДІЮ'}</small><h3>{existing ? 'Змінити підтверджений результат' : 'Що сталося після перевірки?'}</h3></div>
      <label>Звіт<select value={reportId} onChange={(event) => { selectReport(event.target.value); setNotice(''); setError(''); }} required><option value="">Оберіть звіт</option>{reports.map((report) => <option key={report.id} value={report.id}>{report.title}</option>)}</select></label>
      <label>Результат<select value={outcome} onChange={(event) => setOutcome(event.target.value as Outcome)}><option value="not_bought">Не купив</option><option value="canceled">Скасував підписку</option><option value="refunded">Повернув кошти</option></select></label>
      <label>Сума в гривнях<div className="savingsAmount"><span>₴</span><input type="number" min="0.01" max="10000000" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" required/></div></label>
      <label className="savingsConfirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/><span>Підтверджую, що виконав(-ла) цю дію і перевірив(-ла) суму.</span></label>
      <button className="savingsSave" type="submit" disabled={busy || !reports.length}>{busy ? 'Зберігаємо…' : existing ? 'Оновити запис' : 'Підтвердити дію'} <Check aria-hidden="true"/></button>
      {!reports.length && <p className="savingsHint">Спершу збережіть звіт після аналізу сторінки.</p>}
      {error && <p className="savingsMessage error" role="alert">{error}</p>}{notice && <p className="savingsMessage" role="status">{notice}</p>}
    </form><aside className="savingsAside"><div><CircleDollarSign aria-hidden="true"/><h3>Суми рахуються лише після підтвердження</h3><p>Для одного звіту доступний один запис, який можна відредагувати. Так одна покупка не дублюється кількома діями.</p></div><div className="savingsActions"><a href="/api/savings/export" aria-label="Завантажити Savings Tracker у форматі CSV"><FileSpreadsheet/>Експортувати CSV <ArrowDownToLine/></a><button type="button" onClick={()=>void shareCard()} aria-label="Створити та поширити картку PNG"><Share2/>Картка PNG <ArrowUpRight/></button></div></aside></div>
    <div className="savingsRecent"><header><div><small>ІСТОРІЯ ДІЙ</small><h3>Ваші зафіксовані результати</h3></div><span>{data.summary.entryCount} записів</span></header>{data.entries.length ? <><ul>{data.entries.slice(0, showAll ? data.entries.length : 5).map((entry) => <li key={entry.id}><span className="savingsCheck"><Check aria-hidden="true"/></span><span className="savingsEntryInfo"><b>{entry.title}</b><span className={`savingsOutcomeChip ${entry.outcome}`}>{outcomeLabels[entry.outcome]}</span><small>{new Date(`${entry.confirmedDate}T12:00:00`).toLocaleDateString('uk-UA')}</small></span><strong>{money(entry.amountMinor)}</strong><span className="savingsEntryActions"><button type="button" aria-label={`Редагувати запис ${entry.title}`} onClick={()=>edit(entry)} disabled={busy}><Pencil aria-hidden="true"/></button><button type="button" aria-label={`Видалити запис ${entry.title}`} onClick={()=>void remove(entry.id)} disabled={busy}><Trash2 aria-hidden="true"/></button></span></li>)}</ul>{data.summary.entryCount>data.entries.length&&<p className="savingsHint">У дашборді показано останні {data.entries.length} записів. Повний список є у CSV.</p>}{data.entries.length>5&&<button className="savingsShowAll" type="button" onClick={()=>setShowAll(!showAll)}>{showAll?'Згорнути історію':'Показати всі записи'}</button>}</> : <div className="savingsEmpty"><div><b>Ще немає підтверджених дій</b><p>Оберіть збережений звіт, додайте результат і підтвердіть суму — вона з’явиться тут.</p></div><a href={reports.length ? '#savings-form' : '/#top'}>{reports.length ? 'Додати перший результат' : 'Перевірити сторінку'} <ArrowUpRight aria-hidden="true"/></a></div>}</div>
    <footer>Це ваші власні оцінки або суми з квитанцій, які ви підтвердили вручну. Sift не перевіряє операції у банку. Для одного звіту зараховується лише одна дія.</footer>
  </section>;
}
