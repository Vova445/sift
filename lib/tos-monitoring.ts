import { env } from 'cloudflare:workers';
import { accessFor, ensureDb } from './db';
import { analyzeUrl } from './analyzer';
import { canonicalAppUrl } from './billing-security.js';
import { diffPurchaseSnapshots, purchaseSnapshot, type PurchaseSnapshot, type PurchaseTermChange } from './tos-monitor-policy.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const MAX_DUE_PER_RUN = 50;
const MAX_ACTIVE_PER_USER = 20;
const encoder = new TextEncoder();
const bindings = () => env as unknown as Record<string, string | undefined>;

type D1Row<T> = { results?: T[] };
type MonitorRow = {
  watchlist_id: string;
  user_id: string;
  email: string;
  source_url: string;
  page_title: string;
  baseline_snapshot_json: string;
};
type EventRow = {
  id: string;
  watchlist_id: string;
  user_id: string;
  email: string;
  source_url: string;
  page_title: string;
  changes_json: string;
  attempts: number;
};
type TosMonitorForUser = {
  watchlist_id: string;
  enabled: boolean;
  checked_at: string | null;
  next_check_at: string | null;
  last_error: string | null;
  latest_change: { detected_at: string; changes: PurchaseTermChange[] } | null;
};

function emailConfig() {
  const values = bindings();
  const app = canonicalAppUrl(values.APP_BASE_URL, values.WAYFORPAY_MODE === 'sandbox');
  return { apiKey: values.RESEND_API_KEY || '', from: values.AUTH_EMAIL_FROM || values.DUNNING_FROM_EMAIL || '', app };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function utc(value: Date) { return value.toISOString(); }

async function mapLimit<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await task(item);
    }
  });
  await Promise.all(workers);
}

function normalizeStoredSnapshot(value: string): PurchaseSnapshot {
  try {
    const parsed = JSON.parse(value) as PurchaseSnapshot;
    if (parsed?.version === 1 && Array.isArray(parsed.prices) && parsed.renewal && parsed.refund) return parsed;
  } catch {}
  throw new Error('Saved monitor snapshot is invalid');
}

async function ownedWatchlistItem(userId: string, scanId: string) {
  await ensureDb();
  return env.DB.prepare(`SELECT w.id AS watchlist_id,s.url,s.title,s.result_json
    FROM watchlist w JOIN scans s ON s.id=w.scan_id
    WHERE w.user_id=? AND w.scan_id=?`).bind(userId, scanId).first<{
      watchlist_id: string; url: string; title: string; result_json: string;
    }>();
}

export async function setTosMonitoring(userId: string, scanId: string, enabled: boolean, now = new Date()) {
  const item = await ownedWatchlistItem(userId, scanId);
  if (!item) return null;

  const current = await env.DB.prepare(`SELECT enabled FROM tos_monitor_subscriptions WHERE watchlist_id=? AND user_id=?`)
    .bind(item.watchlist_id, userId).first<{ enabled: number }>();
  if (enabled && !current?.enabled) {
    const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM tos_monitor_subscriptions WHERE user_id=? AND enabled=1`)
      .bind(userId).first<{ count: number }>();
    if ((count?.count || 0) >= MAX_ACTIVE_PER_USER) throw new Error(`Можна відстежувати до ${MAX_ACTIVE_PER_USER} сторінок одночасно.`);
    const baseline = purchaseSnapshot(JSON.parse(item.result_json));
    const nowIso = utc(now);
    const nextCheck = utc(new Date(now.getTime() + WEEK_MS));
    await env.DB.prepare(`INSERT INTO tos_monitor_subscriptions(watchlist_id,user_id,enabled,baseline_snapshot_json,checked_at,next_check_at,lease_until,last_error,created_at,updated_at)
      VALUES(?,?,1,?,NULL,?,NULL,NULL,?,?)
      ON CONFLICT(watchlist_id) DO UPDATE SET user_id=excluded.user_id,enabled=1,baseline_snapshot_json=excluded.baseline_snapshot_json,checked_at=NULL,next_check_at=excluded.next_check_at,lease_until=NULL,last_error=NULL,updated_at=excluded.updated_at`)
      .bind(item.watchlist_id, userId, JSON.stringify(baseline), nextCheck, nowIso, nowIso).run();
  } else if (!enabled && current?.enabled) {
    const nowIso = utc(now);
    await env.DB.batch([
      env.DB.prepare(`UPDATE tos_monitor_subscriptions SET enabled=0,lease_until=NULL,updated_at=? WHERE watchlist_id=? AND user_id=?`).bind(nowIso, item.watchlist_id, userId),
      env.DB.prepare(`UPDATE tos_monitor_events SET delivery_status='cancelled',lease_until=NULL WHERE watchlist_id=? AND delivery_status IN ('pending','sending')`).bind(item.watchlist_id),
    ]);
  }
  return (await getTosMonitoringForUser(userId)).items.find((monitor) => monitor.watchlist_id === item.watchlist_id) || null;
}

export async function getTosMonitoringForUser(userId: string) {
  await ensureDb();
  const rows = await env.DB.prepare(`SELECT m.watchlist_id,m.enabled,m.checked_at,m.next_check_at,m.last_error,
      (SELECT e.detected_at FROM tos_monitor_events e WHERE e.watchlist_id=m.watchlist_id AND e.delivery_status='sent' ORDER BY e.detected_at DESC LIMIT 1) AS latest_detected_at,
      (SELECT e.changes_json FROM tos_monitor_events e WHERE e.watchlist_id=m.watchlist_id AND e.delivery_status='sent' ORDER BY e.detected_at DESC LIMIT 1) AS latest_changes_json
    FROM tos_monitor_subscriptions m WHERE m.user_id=? ORDER BY m.updated_at DESC`).bind(userId).all<{
      watchlist_id: string; enabled: number; checked_at: string | null; next_check_at: string | null;
      last_error: string | null; latest_detected_at: string | null; latest_changes_json: string | null;
    }>() as D1Row<{
      watchlist_id: string; enabled: number; checked_at: string | null; next_check_at: string | null;
      last_error: string | null; latest_detected_at: string | null; latest_changes_json: string | null;
    }>;
  const items: TosMonitorForUser[] = (rows.results || []).map((row) => ({
    watchlist_id: row.watchlist_id,
    enabled: row.enabled === 1,
    checked_at: row.checked_at,
    next_check_at: row.next_check_at,
    last_error: row.last_error,
    latest_change: row.latest_detected_at && row.latest_changes_json
      ? { detected_at: row.latest_detected_at, changes: JSON.parse(row.latest_changes_json) as PurchaseTermChange[] }
      : null,
  }));
  return {
    items,
    activeCount: items.filter((item) => item.enabled).length,
    limit: MAX_ACTIVE_PER_USER,
    configured: (() => { const config = emailConfig(); return Boolean(config.apiKey && config.from && config.app); })(),
  };
}

async function monitorHasProAccess(userId: string, cache: Map<string, boolean>) {
  if (!cache.has(userId)) {
    const access = await accessFor(userId);
    cache.set(userId, access.plan === 'pro');
  }
  return cache.get(userId) === true;
}

async function checkDueMonitors(now: Date) {
  await ensureDb();
  const due = await env.DB.prepare(`SELECT m.watchlist_id,m.user_id,u.email,s.url AS source_url,s.title AS page_title,m.baseline_snapshot_json
    FROM tos_monitor_subscriptions m
    JOIN watchlist w ON w.id=m.watchlist_id AND w.user_id=m.user_id
    JOIN scans s ON s.id=w.scan_id AND s.user_id=m.user_id
    JOIN users u ON u.id=m.user_id
    JOIN email_verification_status v ON v.user_id=m.user_id AND v.verified_at IS NOT NULL
    WHERE m.enabled=1 AND m.next_check_at<=? AND (m.lease_until IS NULL OR m.lease_until<=?)
    ORDER BY m.next_check_at ASC LIMIT ?`).bind(utc(now), utc(now), MAX_DUE_PER_RUN).all<MonitorRow>() as D1Row<MonitorRow>;
  const rows = due.results || [];
  const accessCache = new Map<string, boolean>();
  let checked = 0, changed = 0, skipped = 0, failed = 0;

  await mapLimit(rows, 5, async (row) => {
    const leaseUntil = utc(new Date(now.getTime() + 15 * 60 * 1000));
    const lease = await env.DB.prepare(`UPDATE tos_monitor_subscriptions SET lease_until=?,updated_at=?
      WHERE watchlist_id=? AND enabled=1 AND next_check_at<=? AND (lease_until IS NULL OR lease_until<=?)`)
      .bind(leaseUntil, utc(now), row.watchlist_id, utc(now), utc(now)).run();
    if ((lease.meta?.changes || 0) === 0) { skipped++; return; }

    try {
      if (!await monitorHasProAccess(row.user_id, accessCache)) {
        await env.DB.batch([
          env.DB.prepare(`UPDATE tos_monitor_subscriptions SET enabled=0,lease_until=NULL,last_error='Pro access expired',updated_at=? WHERE watchlist_id=?`).bind(utc(now), row.watchlist_id),
          env.DB.prepare(`UPDATE tos_monitor_events SET delivery_status='cancelled',lease_until=NULL WHERE watchlist_id=? AND delivery_status IN ('pending','sending')`).bind(row.watchlist_id),
        ]);
        skipped++;
        return;
      }
      const [report, previous] = await Promise.all([
        analyzeUrl(row.source_url),
        Promise.resolve(normalizeStoredSnapshot(row.baseline_snapshot_json)),
      ]);
      const next = purchaseSnapshot(report);
      const changes = diffPurchaseSnapshots(previous, next);
      const nowIso = utc(now);
      const nextCheck = utc(new Date(now.getTime() + WEEK_MS));
      const updates = [env.DB.prepare(`UPDATE tos_monitor_subscriptions SET baseline_snapshot_json=?,checked_at=?,next_check_at=?,lease_until=NULL,last_error=NULL,updated_at=? WHERE watchlist_id=?`)
        .bind(JSON.stringify(next), nowIso, nextCheck, nowIso, row.watchlist_id)];
      if (changes.length) {
        const eventId = crypto.randomUUID();
        const changeHash = await sha256(JSON.stringify(changes.map(({ key, before, after }) => ({ key, before, after }))));
        updates.unshift(env.DB.prepare(`INSERT INTO tos_monitor_events(id,watchlist_id,user_id,source_url,page_title,change_hash,changes_json,detected_at,delivery_status,attempts)
          VALUES(?,?,?,?,?,?,?,?, 'pending',0)`)
          .bind(eventId, row.watchlist_id, row.user_id, report.url, report.title, changeHash, JSON.stringify(changes), nowIso));
      }
      await env.DB.batch(updates);
      if (changes.length) changed++;
      checked++;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 260) : 'Page check failed';
      await env.DB.prepare(`UPDATE tos_monitor_subscriptions SET lease_until=NULL,next_check_at=?,last_error=?,updated_at=? WHERE watchlist_id=?`)
        .bind(utc(new Date(now.getTime() + RETRY_MS)), message, utc(now), row.watchlist_id).run();
      failed++;
    }
  });

  return { checked, changed, skipped, failed, backlogPossible: rows.length === MAX_DUE_PER_RUN };
}

function alertEmail(row: EventRow, changes: PurchaseTermChange[], app: URL) {
  const title = escapeHtml(row.page_title);
  const sourceUrl = escapeHtml(row.source_url);
  const dashboardUrl = escapeHtml(new URL('/dashboard#planner', app).toString());
  const subjectTitle = row.page_title.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 64) || 'сторінка з умовами';
  const details = changes.map((item) => `<li style="margin:0 0 18px"><strong>${escapeHtml(item.label)}: ${escapeHtml(item.before)} → ${escapeHtml(item.after)}</strong><p>${escapeHtml(item.explanation)}</p>${item.beforeEvidence || item.afterEvidence ? `<p style="font-size:13px;color:#596057"><strong>Було:</strong> ${escapeHtml(item.beforeEvidence || 'Умову не знайдено')}<br><strong>Стало:</strong> ${escapeHtml(item.afterEvidence || 'Умову не знайдено')}</p>` : ''}</li>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#11150f"><p style="font-size:12px;letter-spacing:2px;font-weight:bold">SIFT · МОНІТОРИНГ УМОВ</p><h1 style="font-size:26px">Змінилися важливі умови</h1><p>Ми повторно перевірили сторінку <strong>${title}</strong> і знайшли суттєві зміни.</p><ul style="padding-left:20px">${details}</ul><p><a href="${sourceUrl}" style="display:inline-block;background:#b7f55f;color:#11150f;text-decoration:none;padding:14px 18px;border-radius:8px;font-weight:bold">Перевірити першоджерело</a></p><p style="font-size:13px;color:#596057">Sift порівнює доступний текст сторінки. Перевірте зміни у першоджерелі перед рішенням.</p><p style="font-size:12px"><a href="${dashboardUrl}" style="color:#4a44b6">Керувати моніторингом у Dashboard</a></p></div>`;
  return { subject: `Sift: змінилися умови на ${subjectTitle}`, html };
}

async function sendPendingAlerts(now: Date) {
  await ensureDb();
  const { apiKey, from, app } = emailConfig();
  if (!apiKey || !from || !app) return { sent: 0, pending: 0, failed: 0, email: 'not_configured' as const };
  const rows = await env.DB.prepare(`SELECT e.id,e.watchlist_id,e.user_id,e.source_url,e.page_title,e.changes_json,e.attempts,u.email
    FROM tos_monitor_events e
    JOIN tos_monitor_subscriptions m ON m.watchlist_id=e.watchlist_id AND m.enabled=1
    JOIN users u ON u.id=e.user_id
    JOIN email_verification_status v ON v.user_id=e.user_id AND v.verified_at IS NOT NULL
    WHERE e.delivery_status IN ('pending','sending') AND e.attempts<?
      AND (e.lease_until IS NULL OR e.lease_until<=?)
      AND (e.last_attempt_at IS NULL OR e.last_attempt_at<=?)
    ORDER BY e.detected_at ASC LIMIT 50`).bind(MAX_ATTEMPTS, utc(now), utc(new Date(now.getTime() - RETRY_MS))).all<EventRow>() as D1Row<EventRow>;
  const accessCache = new Map<string, boolean>();
  let sent = 0, pending = 0, failed = 0;
  await mapLimit(rows.results || [], 5, async (row) => {
    try {
      if (!await monitorHasProAccess(row.user_id, accessCache)) {
        await env.DB.prepare(`UPDATE tos_monitor_events SET delivery_status='cancelled',lease_until=NULL WHERE id=? AND delivery_status='pending'`).bind(row.id).run();
        pending++;
        return;
      }
      const claim = await env.DB.prepare(`UPDATE tos_monitor_events SET delivery_status='sending',attempts=attempts+1,last_attempt_at=?,lease_until=?,last_error=NULL
        WHERE id=? AND delivery_status IN ('pending','sending') AND attempts<? AND (lease_until IS NULL OR lease_until<=?)`)
        .bind(utc(now), utc(new Date(now.getTime() + 15 * 60 * 1000)), row.id, MAX_ATTEMPTS, utc(now)).run();
      if ((claim.meta?.changes || 0) === 0) { pending++; return; }
      const message = alertEmail(row, JSON.parse(row.changes_json) as PurchaseTermChange[], app);
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `sift-tos-alert-${row.id}` },
        body: JSON.stringify({ from, to: [row.email], ...message }),
      });
      if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
      await env.DB.prepare(`UPDATE tos_monitor_events SET delivery_status='sent',sent_at=?,lease_until=NULL,last_error=NULL WHERE id=? AND delivery_status='sending'`)
        .bind(utc(now), row.id).run();
      sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 220) : 'Email delivery failed';
      const nextStatus = row.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending';
      await env.DB.prepare(`UPDATE tos_monitor_events SET delivery_status=?,lease_until=NULL,last_error=? WHERE id=? AND delivery_status='sending'`)
        .bind(nextStatus, message, row.id).run();
      failed++;
    }
  });
  return { sent, pending, failed, email: 'configured' as const };
}

export async function processTosMonitoring(now = new Date()) {
  await ensureDb();
  const active = await env.DB.prepare(`SELECT COUNT(*) AS count FROM tos_monitor_subscriptions WHERE enabled=1`)
    .first<{ count: number }>();
  if (!(active?.count || 0)) {
    return { checked: 0, changed: 0, skipped: 0, checkFailures: 0, alertsSent: 0, alertsPending: 0, emailFailures: 0, email: 'no_active' as const };
  }
  const delivery = emailConfig();
  if (!delivery.apiKey || !delivery.from || !delivery.app) {
    return { checked: 0, changed: 0, skipped: 0, checkFailures: 0, alertsSent: 0, alertsPending: 0, emailFailures: 0, email: 'not_configured' as const };
  }
  const checks = await checkDueMonitors(now);
  const alerts = await sendPendingAlerts(now);
  return {
    checked: checks.checked,
    changed: checks.changed,
    skipped: checks.skipped,
    checkFailures: checks.failed,
    backlogPossible: checks.backlogPossible,
    alertsSent: alerts.sent,
    alertsPending: alerts.pending,
    emailFailures: alerts.failed,
    email: alerts.email,
  };
}


