import { env } from 'cloudflare:workers';
import { currentUser } from '../../../lib/auth';
import { validateSavingsEntry } from '../../../lib/savings-policy.js';
import { deleteSavingsEntry, ensureSavingsDb, savingsEntriesForUser, savingsEntryForScan, upsertSavingsEntry } from '../../../lib/savings';
import { currentOfficialUsdRate } from '../../../lib/nbu-exchange';
import { trackEvent } from '../../../lib/event-bus';

const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const d1 = () => (env as unknown as { DB: D1Database }).DB;
function sameOrigin(req: Request) {
  try { return new URL(req.headers.get('origin') || '').origin === new URL(req.url).origin; } catch { return false; }
}
function jsonDate(row: { confirmed_at: string }) { return row.confirmed_at.slice(0, 10); }

export async function GET(req: Request) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть в акаунт, щоб користуватися Savings Tracker.' }, { status: 401, headers: noStore });
  try {
    await ensureSavingsDb();
    const [entries, monthRows, yearRows, countRow] = await Promise.all([
      savingsEntriesForUser(user.id),
      d1().prepare(`SELECT COALESCE(SUM(amount_minor),0) AS total FROM savings_entries WHERE user_id=? AND substr(confirmed_at,1,7)=?`).bind(user.id, new Date().toISOString().slice(0, 7)).first<{ total: number }>(),
      d1().prepare(`SELECT COALESCE(SUM(amount_minor),0) AS total FROM savings_entries WHERE user_id=? AND substr(confirmed_at,1,4)=?`).bind(user.id, new Date().toISOString().slice(0, 4)).first<{ total: number }>(),
      d1().prepare(`SELECT COUNT(*) AS total FROM savings_entries WHERE user_id=?`).bind(user.id).first<{ total: number }>(),
    ]);
    return Response.json({
      entries: entries.map((row) => ({ id: row.id, scanId: row.scan_id, outcome: row.outcome, amountMinor: row.amount_minor, confirmedAt: row.confirmed_at, confirmedDate: jsonDate(row), title: row.title, url: row.url })),
      summary: { monthMinor: monthRows?.total || 0, yearMinor: yearRows?.total || 0, entryCount: countRow?.total || 0, currency: 'UAH' },
    }, { headers: noStore });
  } catch {
    return Response.json({ error: 'Не вдалося завантажити Savings Tracker.' }, { status: 503, headers: noStore });
  }
}

async function readAndValidate(req: Request): Promise<Response | { value: { scanId: string; outcome: 'not_bought' | 'canceled' | 'refunded'; amountMinor: number } }> {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'Некоректний запит.' }, { status: 400, headers: noStore }); }
  const parsed = validateSavingsEntry(body as Parameters<typeof validateSavingsEntry>[0]);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400, headers: noStore });
  return { value: parsed.value };
}

export async function POST(req: Request) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть в акаунт, щоб записати дію.' }, { status: 401, headers: noStore });
  if (!sameOrigin(req)) return Response.json({ error: 'Запит відхилено.' }, { status: 403, headers: noStore });
  const parsed = await readAndValidate(req);
  if (parsed instanceof Response) return parsed;
  try {
    const existing = await savingsEntryForScan(user.id, parsed.value.scanId);
    if (existing) return Response.json({ error: 'Для цього звіту вже є запис. Оновіть його в трекері.' }, { status: 409, headers: noStore });
    const saved = await upsertSavingsEntry(user.id, parsed.value);
    if (saved.kind === 'missing') return Response.json({ error: 'Цей звіт не знайдено у вашому акаунті.' }, { status: 404, headers: noStore });
    const fx = await currentOfficialUsdRate();
    await trackEvent({ userId: user.id, type: 'savings_confirmed', sourceId: `${parsed.value.scanId}:${saved.confirmedAt}`, createdAt: saved.confirmedAt, payload: { scanId: parsed.value.scanId, outcome: parsed.value.outcome, amountMinor: parsed.value.amountMinor, currency: 'UAH', uahPerUsd: fx?.rate ?? null, fxDate: fx?.date ?? null } });
    return Response.json({ ok: true, entryId: saved.id, confirmedAt: saved.confirmedAt, fxAvailable: Boolean(fx) }, { status: 201, headers: noStore });
  } catch {
    return Response.json({ error: 'Не вдалося зберегти дію. Спробуйте ще раз.' }, { status: 503, headers: noStore });
  }
}

export async function PUT(req: Request) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть в акаунт, щоб змінити запис.' }, { status: 401, headers: noStore });
  if (!sameOrigin(req)) return Response.json({ error: 'Запит відхилено.' }, { status: 403, headers: noStore });
  const parsed = await readAndValidate(req);
  if (parsed instanceof Response) return parsed;
  try {
    const existing = await savingsEntryForScan(user.id, parsed.value.scanId);
    if (!existing) return Response.json({ error: 'Запис для цього звіту не знайдено.' }, { status: 404, headers: noStore });
    const saved = await upsertSavingsEntry(user.id, parsed.value);
    if (saved.kind === 'missing') return Response.json({ error: 'Цей звіт не знайдено у вашому акаунті.' }, { status: 404, headers: noStore });
    const fx = await currentOfficialUsdRate();
    await trackEvent({ userId: user.id, type: 'savings_confirmed', sourceId: `${parsed.value.scanId}:${saved.confirmedAt}`, createdAt: saved.confirmedAt, payload: { scanId: parsed.value.scanId, outcome: parsed.value.outcome, amountMinor: parsed.value.amountMinor, currency: 'UAH', uahPerUsd: fx?.rate ?? null, fxDate: fx?.date ?? null } });
    return Response.json({ ok: true, entryId: saved.id, confirmedAt: saved.confirmedAt, fxAvailable: Boolean(fx) }, { headers: noStore });
  } catch {
    return Response.json({ error: 'Не вдалося оновити запис. Спробуйте ще раз.' }, { status: 503, headers: noStore });
  }
}

export async function DELETE(req: Request) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: 'Увійдіть в акаунт, щоб видалити запис.' }, { status: 401, headers: noStore });
  if (!sameOrigin(req)) return Response.json({ error: 'Запит відхилено.' }, { status: 403, headers: noStore });
  let body: { entryId?: unknown };
  try { body = await req.json() as { entryId?: unknown }; } catch { return Response.json({ error: 'Некоректний запит.' }, { status: 400, headers: noStore }); }
  if (typeof body.entryId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.entryId)) return Response.json({ error: 'Оберіть запис.' }, { status: 400, headers: noStore });
  try {
    const entry = await d1().prepare(`SELECT scan_id FROM savings_entries WHERE id=? AND user_id=?`).bind(body.entryId, user.id).first<{ scan_id: string }>();
    const deleted = await deleteSavingsEntry(user.id, body.entryId);
    if (deleted && entry) await trackEvent({ userId: user.id, type: 'savings_removed', sourceId: `${entry.scan_id}:${new Date().toISOString()}`, payload: { scanId: entry.scan_id } });
    return deleted ? Response.json({ ok: true }, { headers: noStore }) : Response.json({ error: 'Запис не знайдено.' }, { status: 404, headers: noStore });
  } catch { return Response.json({ error: 'Не вдалося видалити запис.' }, { status: 503, headers: noStore }); }
}

