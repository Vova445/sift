import { env } from 'cloudflare:workers';
import { ACHIEVEMENT_CATALOG } from './achievement-catalog.js';
import { ANALYTICS_MIN_SAMPLE, intervalsOverlap, isAnalyticsMature, wilsonInterval95 } from './analytics-statistics.js';
import { ensureDb } from './db';
import { ensureEventBusDb } from './event-bus';

export const ACHIEVEMENT_PROGRESS_EXPERIMENT = 'badge_progress_visibility_v1';
export const EXPERIMENT_ASSIGNMENT_TTL_DAYS = 90;
export const EXPERIMENT_REPORT_DELAY_DAYS = 14;
export const EXPERIMENT_MINIMUM_ARM_SIZE = 50;

type ExperimentConfig = { enabled: number; progress_percent: number; started_at: string | null; updated_at: string };
type Variant = 'progress' | 'control';
const d1 = () => (env as unknown as { DB: D1Database }).DB;
let schemaReady: Promise<void> | null = null;

export async function ensureAchievementExperimentDb() {
  await ensureDb();
  if (!schemaReady) schemaReady = (async () => {
    await d1().prepare(`CREATE TABLE IF NOT EXISTS achievement_experiments (
      experiment_key TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
      progress_percent INTEGER NOT NULL DEFAULT 50 CHECK (progress_percent BETWEEN 0 AND 100),
      started_at TEXT,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    )`).run();
    await d1().prepare(`INSERT OR IGNORE INTO achievement_experiments(
      experiment_key,enabled,progress_percent,started_at,updated_at,updated_by
    ) VALUES (?,0,50,NULL,'1970-01-01T00:00:00.000Z','system')`).bind(ACHIEVEMENT_PROGRESS_EXPERIMENT).run();
    await d1().prepare(`CREATE TABLE IF NOT EXISTS achievement_experiment_assignments (
      experiment_key TEXT NOT NULL REFERENCES achievement_experiments(experiment_key) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      variant TEXT NOT NULL CHECK (variant IN ('progress','control')),
      assigned_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (experiment_key,user_id)
    )`).run();
    await d1().prepare(`CREATE INDEX IF NOT EXISTS idx_achievement_experiment_variant_assigned
      ON achievement_experiment_assignments(experiment_key,variant,assigned_at)`).run();
    await d1().prepare(`CREATE INDEX IF NOT EXISTS idx_achievement_experiment_expiry
      ON achievement_experiment_assignments(expires_at)`).run();
  })();
  return schemaReady;
}

async function config() {
  await ensureAchievementExperimentDb();
  return d1().prepare(`SELECT enabled,progress_percent,started_at,updated_at FROM achievement_experiments WHERE experiment_key=?`)
    .bind(ACHIEVEMENT_PROGRESS_EXPERIMENT).first<ExperimentConfig>();
}

function randomVariant(progressPercent: number): Variant {
  const value = crypto.getRandomValues(new Uint8Array(2));
  const bucket = ((value[0] ?? 0) * 256 + (value[1] ?? 0)) % 100;
  return bucket < progressPercent ? 'progress' : 'control';
}

export async function achievementProgressVariant(userId: string, consented: boolean) {
  await ensureAchievementExperimentDb();
  const settings = await config();
  if (!settings) throw new Error('Achievement experiment configuration is unavailable.');
  if (!consented) {
    await d1().prepare(`DELETE FROM achievement_experiment_assignments WHERE experiment_key=? AND user_id=?`)
      .bind(ACHIEVEMENT_PROGRESS_EXPERIMENT, userId).run();
    return { enabled: settings.enabled === 1, assigned: false, variant: 'progress' as const, showProgress: true, assignedAt: null };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  await d1().prepare(`DELETE FROM achievement_experiment_assignments WHERE expires_at<=?`).bind(nowIso).run();
  if (settings.enabled !== 1) {
    const prior = await d1().prepare(`SELECT variant,assigned_at FROM achievement_experiment_assignments WHERE experiment_key=? AND user_id=?`)
      .bind(ACHIEVEMENT_PROGRESS_EXPERIMENT, userId).first<{ variant: Variant; assigned_at: string }>();
    return { enabled: false, assigned: Boolean(prior), variant: 'progress' as const, showProgress: true, assignedAt: prior?.assigned_at || null };
  }

  const variant = randomVariant(settings.progress_percent);
  const expiresAt = new Date(now.getTime() + EXPERIMENT_ASSIGNMENT_TTL_DAYS * 86_400_000).toISOString();
  await d1().prepare(`INSERT OR IGNORE INTO achievement_experiment_assignments(experiment_key,user_id,variant,assigned_at,expires_at)
    VALUES(?,?,?,?,?)`).bind(ACHIEVEMENT_PROGRESS_EXPERIMENT, userId, variant, nowIso, expiresAt).run();
  const assignment = await d1().prepare(`SELECT variant,assigned_at FROM achievement_experiment_assignments WHERE experiment_key=? AND user_id=?`)
    .bind(ACHIEVEMENT_PROGRESS_EXPERIMENT, userId).first<{ variant: Variant; assigned_at: string }>();
  const selected = assignment?.variant || 'progress';
  return { enabled: true, assigned: Boolean(assignment), variant: selected, showProgress: selected === 'progress', assignedAt: assignment?.assigned_at || null };
}

export async function setAchievementProgressExperiment(enabled: boolean, updatedBy: string) {
  await ensureAchievementExperimentDb();
  const now = new Date().toISOString();
  await d1().prepare(`UPDATE achievement_experiments SET enabled=?,started_at=CASE WHEN ?=1 THEN COALESCE(started_at,?) ELSE started_at END,updated_at=?,updated_by=? WHERE experiment_key=?`)
    .bind(enabled ? 1 : 0, enabled ? 1 : 0, now, now, updatedBy, ACHIEVEMENT_PROGRESS_EXPERIMENT).run();
  return getAchievementExperimentAnalytics();
}

function percentage(numerator: number, denominator: number) {
  return denominator ? Math.round(numerator / denominator * 1000) / 10 : null;
}

export async function getAchievementExperimentAnalytics(now = new Date()) {
  await ensureAchievementExperimentDb();
  await ensureEventBusDb();
  const nowIso = now.toISOString();
  const [settings, totalRow, anyBadgeRow, badgeRows, variantRows] = await Promise.all([
    config(),
    d1().prepare(`SELECT COUNT(*) AS count FROM users`).first<{ count: number }>(),
    d1().prepare(`SELECT COUNT(DISTINCT user_id) AS count FROM user_achievements`).first<{ count: number }>(),
    d1().prepare(`SELECT key,COUNT(*) AS count FROM user_achievements GROUP BY key`).all<{ key: string; count: number }>(),
    d1().prepare(`SELECT a.variant,COUNT(*) AS assigned,
      SUM(CASE WHEN EXISTS(SELECT 1 FROM user_achievements ua WHERE ua.user_id=a.user_id AND ua.unlocked_at>=a.assigned_at) THEN 1 ELSE 0 END) AS earned_after_assignment,
      SUM(CASE WHEN julianday(?)>=julianday(a.assigned_at)+8 THEN 1 ELSE 0 END) AS d7_eligible,
      SUM(CASE WHEN julianday(?)>=julianday(a.assigned_at)+8 AND EXISTS(
        SELECT 1 FROM events e WHERE e.user_id=a.user_id AND julianday(e.created_at)>=julianday(a.assigned_at)+7 AND julianday(e.created_at)<julianday(a.assigned_at)+8
      ) THEN 1 ELSE 0 END) AS d7_returned,
      SUM(CASE WHEN julianday(?)>=julianday(a.assigned_at)+31 THEN 1 ELSE 0 END) AS d30_eligible,
      SUM(CASE WHEN julianday(?)>=julianday(a.assigned_at)+31 AND EXISTS(
        SELECT 1 FROM events e WHERE e.user_id=a.user_id AND julianday(e.created_at)>=julianday(a.assigned_at)+30 AND julianday(e.created_at)<julianday(a.assigned_at)+31
      ) THEN 1 ELSE 0 END) AS d30_returned,
      SUM(CASE WHEN julianday(?)>=julianday(a.assigned_at)+30 THEN 1 ELSE 0 END) AS pro_eligible,
      SUM(CASE WHEN julianday(?)>=julianday(a.assigned_at)+30 AND EXISTS(
        SELECT 1 FROM payment_orders p WHERE p.user_id=a.user_id AND p.plan='pro' AND p.status='paid'
          AND julianday(p.created_at)>=julianday(a.assigned_at) AND julianday(p.created_at)<julianday(a.assigned_at)+30
      ) THEN 1 ELSE 0 END) AS pro_converted
      FROM achievement_experiment_assignments a WHERE a.experiment_key=? AND a.expires_at>? GROUP BY a.variant`)
      .bind(nowIso,nowIso,nowIso,nowIso,nowIso,nowIso,ACHIEVEMENT_PROGRESS_EXPERIMENT,nowIso).all<{
        variant: Variant; assigned: number; earned_after_assignment: number | null;
        d7_eligible: number | null; d7_returned: number | null;
        d30_eligible: number | null; d30_returned: number | null;
        pro_eligible: number | null; pro_converted: number | null;
      }>(),
  ]);
  const byVariant = new Map(variantRows.results.map((row) => [row.variant, row]));
  const groups = (['progress','control'] as const).map((variant) => {
    const row = byVariant.get(variant);
    const assigned = row?.assigned || 0;
    const earned = row?.earned_after_assignment || 0;
    const d7Eligible = row?.d7_eligible || 0, d7Returned = row?.d7_returned || 0;
    const d30Eligible = row?.d30_eligible || 0, d30Returned = row?.d30_returned || 0;
    const proEligible = row?.pro_eligible || 0, proConverted = row?.pro_converted || 0;
    return {
      variant, assigned, earnedAfterAssignment: earned, earnedRate: percentage(earned, assigned), earnedInterval95: wilsonInterval95(earned, assigned),
      earnedMature: assigned >= EXPERIMENT_MINIMUM_ARM_SIZE,
      d7: { eligible: d7Eligible, returned: d7Returned, rate: percentage(d7Returned, d7Eligible), interval95: wilsonInterval95(d7Returned, d7Eligible), mature: d7Eligible >= EXPERIMENT_MINIMUM_ARM_SIZE, minimumSample: EXPERIMENT_MINIMUM_ARM_SIZE },
      d30: { eligible: d30Eligible, returned: d30Returned, rate: percentage(d30Returned, d30Eligible), interval95: wilsonInterval95(d30Returned, d30Eligible), mature: d30Eligible >= EXPERIMENT_MINIMUM_ARM_SIZE, minimumSample: EXPERIMENT_MINIMUM_ARM_SIZE },
      pro30: { eligible: proEligible, converted: proConverted, rate: percentage(proConverted, proEligible), interval95: wilsonInterval95(proConverted, proEligible), mature: proEligible >= EXPERIMENT_MINIMUM_ARM_SIZE, minimumSample: EXPERIMENT_MINIMUM_ARM_SIZE },
    };
  });
  const totalUsers = totalRow?.count || 0;
  const usersWithBadge = anyBadgeRow?.count || 0;
  const counts = new Map(badgeRows.results.map((row) => [row.key, row.count]));
  const startedAt = settings?.started_at || null;
  const daysRunning = startedAt ? Math.max(0, Math.floor((now.getTime() - Date.parse(startedAt)) / 86_400_000)) : 0;
  const reportDueAt = startedAt ? new Date(Date.parse(startedAt) + EXPERIMENT_REPORT_DELAY_DAYS * 86_400_000).toISOString() : null;
  const enoughSample = groups.every((group) => group.assigned >= EXPERIMENT_MINIMUM_ARM_SIZE && group.d7.eligible >= EXPERIMENT_MINIMUM_ARM_SIZE);
  const comparisons = ['earned', 'd7', 'd30', 'pro30'].map((metric) => {
    const progressGroup = groups.find((group) => group.variant === 'progress');
    const controlGroup = groups.find((group) => group.variant === 'control');
    const a = metric === 'earned' ? progressGroup?.earnedInterval95 || null : progressGroup?.[metric as 'd7' | 'd30' | 'pro30'].interval95 || null;
    const b = metric === 'earned' ? controlGroup?.earnedInterval95 || null : controlGroup?.[metric as 'd7' | 'd30' | 'pro30'].interval95 || null;
    return { metric, intervalsOverlap: intervalsOverlap(a, b), hasIntervals: Boolean(a && b) };
  });
  return {
    experiment: {
      key: ACHIEVEMENT_PROGRESS_EXPERIMENT, enabled: settings?.enabled === 1,
      progressPercent: settings?.progress_percent || 50, startedAt, daysRunning, reportDueAt,
      minimumArmSize: EXPERIMENT_MINIMUM_ARM_SIZE,
      reportReady: isAnalyticsMature({ observations: groups.reduce((sum, group) => sum + group.assigned, 0), observedDays: daysRunning, minimumSample: EXPERIMENT_MINIMUM_ARM_SIZE * 2 }) && enoughSample,
      maturity: { mature: isAnalyticsMature({ observations: groups.reduce((sum, group) => sum + group.assigned, 0), observedDays: daysRunning, minimumSample: EXPERIMENT_MINIMUM_ARM_SIZE * 2 }), observations: groups.reduce((sum, group) => sum + group.assigned, 0), minimumObservations: EXPERIMENT_MINIMUM_ARM_SIZE * 2, observedDays: daysRunning, minimumDays: EXPERIMENT_REPORT_DELAY_DAYS },
      updatedAt: settings?.updated_at || nowIso,
    },
    badgeDistribution: {
      totalUsers, usersWithAnyBadge: usersWithBadge, usersWithAnyBadgeRate: percentage(usersWithBadge,totalUsers),
      maturity: { mature: totalUsers >= ANALYTICS_MIN_SAMPLE, observations: totalUsers, minimumObservations: ANALYTICS_MIN_SAMPLE },
      badges: ACHIEVEMENT_CATALOG.map((badge) => ({ key: badge.key, title: badge.title, users: counts.get(badge.key) || 0, rate: percentage(counts.get(badge.key) || 0,totalUsers), mature: totalUsers >= ANALYTICS_MIN_SAMPLE, observations: totalUsers, minimumObservations: ANALYTICS_MIN_SAMPLE })),
    },
    groups,
    comparisons,
    definitions: { d7: 'meaningful server event during days 7–8 after assignment', d30: 'meaningful server event during days 30–31 after assignment', pro30: 'paid Pro order within 30 days of assignment' },
    generatedAt: nowIso,
  };
}

export async function deleteExpiredAchievementExperimentAssignments(now = new Date()) {
  await ensureAchievementExperimentDb();
  const result = await d1().prepare(`DELETE FROM achievement_experiment_assignments WHERE expires_at<=?`).bind(now.toISOString()).run();
  return result.meta?.changes || 0;
}
