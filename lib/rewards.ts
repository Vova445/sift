import { env } from 'cloudflare:workers';
import { QUARTERLY_FREE_CREDIT_LIMIT, REWARD_TYPE_BY_BADGE, rewardLedgerKey } from './reward-policy.js';

type RewardType = 'one_credit' | 'pro_discount_50' | 'priority_alerts';
type RewardRow = {
  id: string; reward_key: string; reward_type: RewardType; status: string;
  quarter_key: string | null; created_at: string; expires_at: string | null;
  redeemed_at: string | null; metadata_json: string;
};

const db = () => (env as unknown as { DB: D1Database }).DB;
const ONE_CREDIT_RESERVATION_MS = 15 * 60 * 1000;
const PRO_DISCOUNT_RESERVATION_MS = 60 * 60 * 1000;
let schemaReady: Promise<void> | null = null;

function quarterKey(date: Date) {
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function expiryAfter(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000).toISOString();
}

export async function ensureRewardsDb() {
  if (!schemaReady) schemaReady = (async () => {
    await db().prepare(`CREATE TABLE IF NOT EXISTS rewards (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reward_key TEXT NOT NULL,
      reward_type TEXT NOT NULL CHECK (reward_type IN ('one_credit','pro_discount_50','priority_alerts')),
      status TEXT NOT NULL CHECK (status IN ('available','reserved','redeemed','expired','capped')),
      quarter_key TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      reserved_reference TEXT,
      reserved_until TEXT,
      redeemed_at TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      UNIQUE(user_id,reward_key)
    )`).run();
    await db().prepare(`CREATE INDEX IF NOT EXISTS idx_rewards_user_status_expiry ON rewards(user_id,status,reward_type,expires_at)`).run();
    await db().prepare(`CREATE INDEX IF NOT EXISTS idx_rewards_quarter_type ON rewards(user_id,quarter_key,reward_type,status)`).run();
    await db().prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_rewards_reserved_reference ON rewards(reserved_reference) WHERE reserved_reference IS NOT NULL`).run();
    try { await db().prepare(`ALTER TABLE payment_orders ADD COLUMN reward_id TEXT`).run(); } catch { /* Existing schema already has the migration. */ }
  })();
  return schemaReady;
}

/** Idempotent reward grants share the same D1 batch as the event projection. */
export function rewardGrantStatement(userId: string, badgeKey: string, issuedAt: string) {
  const rewardType = REWARD_TYPE_BY_BADGE[badgeKey] as RewardType | undefined;
  if (!rewardType) return null;
  const issued = new Date(issuedAt);
  const safeIssued = Number.isNaN(issued.getTime()) ? new Date() : issued;
  const timestamp = safeIssued.toISOString();
  const quarter = rewardType === 'one_credit' ? quarterKey(safeIssued) : null;
  const expiresAt = rewardType === 'one_credit' || rewardType === 'pro_discount_50'
    ? expiryAfter(safeIssued, 90)
    : expiryAfter(safeIssued, 180);
  const id = crypto.randomUUID();
  return db().prepare(`INSERT OR IGNORE INTO rewards(
    id,user_id,reward_key,reward_type,status,quarter_key,created_at,expires_at,metadata_json
  ) SELECT ?,?,?,?,CASE WHEN ?='one_credit' AND (
      SELECT COUNT(*) FROM rewards WHERE user_id=? AND reward_type='one_credit' AND quarter_key=? AND status!='capped'
    )>=? THEN 'capped' ELSE 'available' END,?,?,?,?
  `).bind(
    id, userId, rewardLedgerKey(badgeKey, rewardType), rewardType, rewardType,
    userId, quarter, QUARTERLY_FREE_CREDIT_LIMIT, quarter, timestamp, expiresAt,
    JSON.stringify({ source: 'achievement', badgeKey }),
  );
}

export function rewardConsumeStatement(reservation: string, redeemedAt: string) {
  const match = /^reward:([A-Za-z0-9-]{16,80})$/.exec(reservation);
  if (!match) return null;
  return db().prepare(`UPDATE rewards SET status='redeemed',redeemed_at=?,reserved_reference=NULL,reserved_until=NULL
    WHERE id=? AND reward_type='one_credit' AND status='reserved' AND reserved_reference=?`)
    .bind(redeemedAt, match[1], reservation);
}

export async function availableRewardCredits(userId: string, now = new Date()) {
  await ensureRewardsDb();
  const nowIso = now.toISOString();
  await db().prepare(`UPDATE rewards SET status='expired',reserved_reference=NULL,reserved_until=NULL
    WHERE user_id=? AND reward_type='one_credit' AND status='available' AND expires_at<=?`).bind(userId, nowIso).run();
  await db().prepare(`UPDATE rewards SET status='available',reserved_reference=NULL,reserved_until=NULL
    WHERE user_id=? AND reward_type='one_credit' AND status='reserved' AND reserved_until<=?
      AND NOT EXISTS (SELECT 1 FROM scans WHERE scans.one_subscription_id='reward:'||rewards.id)`)
    .bind(userId, nowIso).run();
  const row = await db().prepare(`SELECT COUNT(*) AS count FROM rewards
    WHERE user_id=? AND reward_type='one_credit' AND status='available' AND (expires_at IS NULL OR expires_at>?)`)
    .bind(userId, nowIso).first<{ count: number }>();
  return row?.count || 0;
}

export async function reserveRewardCredit(userId: string, now = new Date()) {
  await availableRewardCredits(userId, now);
  const nowIso = now.toISOString();
  const row = await db().prepare(`SELECT id FROM rewards WHERE user_id=? AND reward_type='one_credit' AND status='available'
    AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at,id LIMIT 1`).bind(userId, nowIso).first<{ id: string }>();
  if (!row) return null;
  const reservation = `reward:${row.id}`;
  const reservedUntil = new Date(now.getTime() + ONE_CREDIT_RESERVATION_MS).toISOString();
  const result = await db().prepare(`UPDATE rewards SET status='reserved',reserved_reference=?,reserved_until=?
    WHERE id=? AND user_id=? AND status='available' AND (expires_at IS NULL OR expires_at>?)`)
    .bind(reservation, reservedUntil, row.id, userId, nowIso).run();
  return (result.meta?.changes || 0) > 0 ? reservation : null;
}

export async function releaseRewardCredit(reservation: string) {
  await ensureRewardsDb();
  const match = /^reward:([A-Za-z0-9-]{16,80})$/.exec(reservation);
  if (!match) return;
  const now = new Date().toISOString();
  await db().prepare(`UPDATE rewards SET status=CASE WHEN expires_at IS NOT NULL AND expires_at<=? THEN 'expired' ELSE 'available' END,
    reserved_reference=NULL,reserved_until=NULL WHERE id=? AND reward_type='one_credit' AND status='reserved' AND reserved_reference=?`)
    .bind(now, match[1], reservation).run();
}

export async function reserveProDiscountReward(userId: string, reference: string) {
  await ensureRewardsDb();
  const now = new Date(), nowIso = now.toISOString();
  await db().prepare(`UPDATE payment_orders SET status='expired',updated_at=? WHERE status='pending' AND expires_at<=?`)
    .bind(nowIso, nowIso).run();
  await db().prepare(`UPDATE rewards SET status='available',reserved_reference=NULL,reserved_until=NULL
    WHERE user_id=? AND reward_type='pro_discount_50' AND status='reserved' AND reserved_until<=?
      AND NOT EXISTS (SELECT 1 FROM payment_orders WHERE payment_orders.reward_id=rewards.id AND payment_orders.status='pending')`)
    .bind(userId, nowIso).run();
  const reward = await db().prepare(`SELECT id FROM rewards WHERE user_id=? AND reward_type='pro_discount_50' AND status='available'
    AND expires_at>? ORDER BY created_at,id LIMIT 1`).bind(userId, nowIso).first<{ id: string }>();
  if (!reward) return null;
  const reservedUntil = new Date(now.getTime() + PRO_DISCOUNT_RESERVATION_MS).toISOString();
  const result = await db().prepare(`UPDATE rewards SET status='reserved',reserved_reference=?,reserved_until=?
    WHERE id=? AND user_id=? AND reward_type='pro_discount_50' AND status='available' AND expires_at>?`)
    .bind(reference, reservedUntil, reward.id, userId, nowIso).run();
  return (result.meta?.changes || 0) > 0 ? reward.id : null;
}

export async function releaseProDiscountReward(rewardId: string, reference: string) {
  await ensureRewardsDb();
  const now = new Date().toISOString();
  await db().prepare(`UPDATE rewards SET status=CASE WHEN expires_at<=? THEN 'expired' ELSE 'available' END,
    reserved_reference=NULL,reserved_until=NULL WHERE id=? AND reward_type='pro_discount_50' AND status='reserved' AND reserved_reference=?`)
    .bind(now, rewardId, reference).run();
}

export async function rewardPaymentStatement(rewardId: string, reference: string, status: 'paid' | 'declined', now: string) {
  await ensureRewardsDb();
  if (status === 'paid') return db().prepare(`UPDATE rewards SET status='redeemed',redeemed_at=?,reserved_reference=NULL,reserved_until=NULL
    WHERE id=? AND reward_type='pro_discount_50' AND status='reserved' AND reserved_reference=?`)
    .bind(now, rewardId, reference);
  return db().prepare(`UPDATE rewards SET status=CASE WHEN expires_at<=? THEN 'expired' ELSE 'available' END,
    reserved_reference=NULL,reserved_until=NULL WHERE id=? AND reward_type='pro_discount_50' AND status='reserved' AND reserved_reference=?`)
    .bind(now, rewardId, reference);
}

export async function rewardsForUser(userId: string) {
  await ensureRewardsDb();
  const now = new Date().toISOString();
  await db().prepare(`UPDATE rewards SET status='expired' WHERE user_id=? AND status='available' AND expires_at IS NOT NULL AND expires_at<=?`)
    .bind(userId, now).run();
  const result = await db().prepare(`SELECT id,reward_key,reward_type,status,quarter_key,created_at,expires_at,redeemed_at,metadata_json
    FROM rewards WHERE user_id=? ORDER BY created_at DESC,id DESC`).bind(userId).all<RewardRow>();
  const items = result.results.map((row) => {
    const metadata = (() => { try { return JSON.parse(row.metadata_json) as { badgeKey?: string } } catch { return {} } })();
    const labels: Record<RewardType, { title: string; description: string }> = {
      one_credit: { title: 'Кредит One Sift', description: 'Один повний звіт без оплати. Зараховується лише після збереження звіту.' },
      pro_discount_50: { title: '50% на перший платіж Pro', description: 'Знижка автоматично застосовується до першого платежу Pro; наступні списання — за стандартною ціною.' },
      priority_alerts: { title: 'Пріоритетні нагадування', description: 'Email-нагадування з вашого Planner обробляються першими, коли черга заповнена.' },
    };
    return { id: row.id, key: row.reward_key, type: row.reward_type, status: row.status, quarter: row.quarter_key, earnedAt: row.created_at, expiresAt: row.expires_at, redeemedAt: row.redeemed_at, badgeKey: metadata.badgeKey || null, ...labels[row.reward_type] };
  });
  const currentQuarter = quarterKey(new Date(now));
  const quarterlyCreditsUsed = items.filter((item) => item.type === 'one_credit' && item.quarter === currentQuarter && item.status !== 'capped').length;
  return {
    items,
    availableOneCredits: items.filter((item) => item.type === 'one_credit' && item.status === 'available' && (!item.expiresAt || item.expiresAt > now)).length,
    currentQuarter,
    quarterlyCreditsUsed,
    quarterlyCreditLimit: QUARTERLY_FREE_CREDIT_LIMIT,
  };
}
