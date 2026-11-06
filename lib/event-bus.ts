import { env } from 'cloudflare:workers';
import { ACHIEVEMENT_CATALOG_VERSION, evaluateAchievementCatalog } from './achievement-catalog.js';
import { longestAnalysisStreak, normalizeAnalysisDays } from './achievement-policy.js';
import { ensureRewardsDb, rewardGrantStatement } from './rewards';

export type SiftEventType =
  | 'analysis_completed'
  | 'autorenew_found'
  | 'subscription_canceled'
  | 'watchlist_added'
  | 'watchlist_removed'
  | 'translation_used'
  | 'cancellation_kit_used'
  | 'savings_confirmed'
  | 'savings_removed'
  | 'referral_completed';

type EventInput = {
  type: SiftEventType;
  sourceId: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
};

type TrackEventInput = EventInput & {
  userId: string;
  /** Related writes that must commit atomically with the event, such as the scan row. */
  relatedStatements?: Array<ReturnType<typeof env.DB.prepare>>;
  /** Additional facts from the same source action, e.g. a renewal found in a new scan. */
  additionalEvents?: EventInput[];
};

type StoredEvent = { type: SiftEventType; source_id: string; payload: string; created_at: string };

let schemaReady: Promise<void> | null = null;

export async function ensureEventBusDb() {
  if (!schemaReady) schemaReady = (async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('analysis_completed','autorenew_found','subscription_canceled','watchlist_added','watchlist_removed','translation_used','cancellation_kit_used','savings_confirmed','savings_removed','referral_completed')),
      source_id TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      UNIQUE(user_id,type,source_id)
    )`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_events_user_created ON events(user_id,created_at DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_events_user_type_created ON events(user_id,type,created_at DESC)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_achievements (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      progress TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY(user_id,key)
    )`).run();
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_achievements_user_key ON user_achievements(user_id,key)`).run();
  })();
  return schemaReady;
}

function asJson(payload: Record<string, unknown> | undefined) {
  const encoded = JSON.stringify(payload || {});
  if (encoded.length > 8_192) throw new Error('Event payload exceeds the allowed size.');
  return encoded;
}

function eventStatement(userId: string, event: EventInput, fallbackTime: string) {
  if (!event.sourceId || event.sourceId.length > 200) throw new Error('Event source is invalid.');
  const createdAt = event.createdAt || fallbackTime;
  const watchlistStateEvent = event.type === 'watchlist_added' || event.type === 'watchlist_removed';
  const query = watchlistStateEvent
    ? `INSERT INTO events(id,user_id,type,source_id,payload,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,type,source_id) DO UPDATE SET payload=excluded.payload,created_at=excluded.created_at`
    : `INSERT OR IGNORE INTO events(id,user_id,type,source_id,payload,created_at) VALUES(?,?,?,?,?,?)`;
  return env.DB.prepare(query).bind(crypto.randomUUID(), userId, event.type, event.sourceId, asJson(event.payload), createdAt);
}

/**
 * The sole server-side write path for user activity. Dedupe is enforced by D1's
 * (user_id,type,source_id) unique index; related DB writes can join the same batch.
 */
export async function trackEvent(input: TrackEventInput) {
  await ensureEventBusDb();
  if (!input.userId || input.userId.length > 100) throw new Error('Event owner is invalid.');
  const now = input.createdAt || new Date().toISOString();
  const statements = [
    ...(input.relatedStatements || []),
    eventStatement(input.userId, input, now),
    ...(input.additionalEvents || []).map((event) => eventStatement(input.userId, event, now)),
  ];
  await env.DB.batch(statements);
  // Events are already durable if projection work needs a later retry. The achievements
  // endpoint runs this projection again, and duplicate trackEvent calls are safe too.
  try { await refreshAchievementProjection(input.userId); }
  catch (error) { console.error('[event-bus] achievement projection failed', error instanceof Error ? error.message : 'unknown error'); }
  return { accepted: true };
}

function streakUnlocks(events: StoredEvent[]) {
  const days = normalizeAnalysisDays(events.filter((event) => event.type === 'analysis_completed').map((event) => event.created_at.slice(0, 10)));
  const completedAt: Record<string, string> = {};
  let previous: number | null = null;
  let run = 0;
  for (const day of days) {
    const date = Date.parse(`${day}T00:00:00.000Z`);
    run = previous !== null && date - previous === 86_400_000 ? run + 1 : 1;
    previous = date;
    if (run >= 3 && !completedAt.streak_3_days) {
      completedAt.streak_3_days = events.find((event) => event.type === 'analysis_completed' && event.created_at.slice(0, 10) === day)?.created_at || `${day}T00:00:00.000Z`;
    }
    if (run >= 7 && !completedAt.streak_7_days) {
      completedAt.streak_7_days = events.find((event) => event.type === 'analysis_completed' && event.created_at.slice(0, 10) === day)?.created_at || `${day}T00:00:00.000Z`;
    }
  }
  return { days, longest: longestAnalysisStreak(days), completedAt };
}

export async function eventsForUser(userId: string) {
  await ensureEventBusDb();
  const rows = await env.DB.prepare(`SELECT type,source_id,payload,created_at FROM events WHERE user_id=? ORDER BY created_at ASC,id ASC`).bind(userId).all<StoredEvent>();
  return rows.results;
}

export async function refreshAchievementProjection(userId: string) {
  const events = await eventsForUser(userId);
  await ensureRewardsDb();
  const streak = streakUnlocks(events);
  const badges = evaluateAchievementCatalog(events);
  const latestEventAt = events[events.length - 1]?.created_at || new Date().toISOString();
  const priorRows = await env.DB.prepare(`SELECT key,unlocked_at FROM user_achievements WHERE user_id=?`).bind(userId).all<{ key: string; unlocked_at: string }>();
  const priorUnlocks = new Map(priorRows.results.map((row) => [row.key, row.unlocked_at]));
  // The quarterly cap is based on when the ledger actually issues a reward, not
  // an old achievement timestamp that may be backfilled during a deployment.
  const rewardIssuedAt = new Date().toISOString();
  const statements = badges.filter((badge) => badge.unlocked).map((badge) => {
    const progress = JSON.stringify({ current: badge.progress, goal: badge.goal, catalogVersion: ACHIEVEMENT_CATALOG_VERSION });
    return env.DB.prepare(`INSERT INTO user_achievements(user_id,key,unlocked_at,progress)
      VALUES(?,?,?,?)
      ON CONFLICT(user_id,key) DO UPDATE SET
        unlocked_at=COALESCE(user_achievements.unlocked_at,excluded.unlocked_at),
        progress=excluded.progress`)
      .bind(userId, badge.key, priorUnlocks.get(badge.key) || latestEventAt, progress);
  });
  const rewardStatements = badges.filter((badge) => badge.unlocked)
    .map((badge) => rewardGrantStatement(userId, badge.key, rewardIssuedAt))
    .filter((statement): statement is NonNullable<typeof statement> => Boolean(statement));
  if (statements.length || rewardStatements.length) await env.DB.batch([...statements, ...rewardStatements]);
  return { eventCount: events.length, unlocked: badges.filter((badge) => badge.unlocked).map((badge) => badge.key), analysisDays: streak.days };
}
