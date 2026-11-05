import { env } from 'cloudflare:workers';
import type { SavingsOutcome } from './savings-policy.js';

const d1 = () => (env as unknown as { DB: D1Database }).DB;
let schemaReady: Promise<void> | null = null;

export async function ensureSavingsDb() {
  if (!schemaReady) schemaReady = (async () => {
    await d1().prepare(`CREATE TABLE IF NOT EXISTS savings_entries (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,outcome TEXT NOT NULL CHECK(outcome IN ('not_bought','canceled','refunded')),amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 1 AND 1000000000),confirmed_at TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,scan_id))`).run();
    await d1().prepare(`CREATE INDEX IF NOT EXISTS idx_savings_entries_user_confirmed ON savings_entries(user_id,confirmed_at DESC)`).run();
  })();
  return schemaReady;
}

export type SavingsEntryRow = { id: string; scan_id: string; outcome: SavingsOutcome; amount_minor: number; confirmed_at: string; created_at: string; updated_at: string; title: string; url: string };

export async function savingsEntriesForUser(userId: string, limit: number | null = 500) {
  await ensureSavingsDb();
  const query = limit === null
    ? d1().prepare(`SELECT e.id,e.scan_id,e.outcome,e.amount_minor,e.confirmed_at,e.created_at,e.updated_at,s.title,s.url FROM savings_entries e JOIN scans s ON s.id=e.scan_id WHERE e.user_id=? ORDER BY e.confirmed_at DESC`).bind(userId)
    : d1().prepare(`SELECT e.id,e.scan_id,e.outcome,e.amount_minor,e.confirmed_at,e.created_at,e.updated_at,s.title,s.url FROM savings_entries e JOIN scans s ON s.id=e.scan_id WHERE e.user_id=? ORDER BY e.confirmed_at DESC LIMIT ?`).bind(userId, Math.min(Math.max(1, Math.trunc(limit)), 5000));
  const result = await query.all<SavingsEntryRow>();
  return result.results;
}

export async function savingsEntryForScan(userId: string, scanId: string) {
  await ensureSavingsDb();
  return await d1().prepare(`SELECT id,scan_id,outcome,amount_minor,confirmed_at,created_at,updated_at FROM savings_entries WHERE user_id=? AND scan_id=?`).bind(userId, scanId).first<{ id: string; scan_id: string; outcome: SavingsOutcome; amount_minor: number; confirmed_at: string; created_at: string; updated_at: string }>();
}

export async function upsertSavingsEntry(userId: string, value: { scanId: string; outcome: SavingsOutcome; amountMinor: number }) {
  await ensureSavingsDb();
  const scan = await d1().prepare(`SELECT id FROM scans WHERE id=? AND user_id=?`).bind(value.scanId, userId).first<{ id: string }>();
  if (!scan) return { kind: 'missing' as const };
  const now = new Date().toISOString();
  const existing = await savingsEntryForScan(userId, value.scanId);
  const id = existing?.id || crypto.randomUUID();
  if (existing) {
    await d1().prepare(`UPDATE savings_entries SET outcome=?,amount_minor=?,confirmed_at=?,updated_at=? WHERE user_id=? AND scan_id=?`).bind(value.outcome, value.amountMinor, now, now, userId, value.scanId).run();
  } else {
    try {
      await d1().prepare(`INSERT INTO savings_entries(id,user_id,scan_id,outcome,amount_minor,confirmed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).bind(id, userId, value.scanId, value.outcome, value.amountMinor, now, now, now).run();
    } catch {
      const raced = await savingsEntryForScan(userId, value.scanId);
      if (!raced) throw new Error('Не вдалося зберегти підтверджену дію.');
      await d1().prepare(`UPDATE savings_entries SET outcome=?,amount_minor=?,confirmed_at=?,updated_at=? WHERE user_id=? AND scan_id=?`).bind(value.outcome, value.amountMinor, now, now, userId, value.scanId).run();
    }
  }
  return { kind: 'saved' as const, id, confirmedAt: now };
}

export async function deleteSavingsEntry(userId: string, entryId: string) {
  await ensureSavingsDb();
  const result = await d1().prepare(`DELETE FROM savings_entries WHERE id=? AND user_id=?`).bind(entryId, userId).run();
  return (result.meta?.changes || 0) > 0;
}
