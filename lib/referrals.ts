import { env } from 'cloudflare:workers';
import { trackEvent } from './event-bus';
import { referralIdentityAllowed } from './reward-policy.js';

const d1 = () => (env as unknown as { DB: D1Database }).DB;
const encoder = new TextEncoder();
let schemaReady: Promise<void> | null = null;

async function ensureReferralDb() {
  if (!schemaReady) schemaReady = (async () => {
    await d1().prepare(`CREATE TABLE IF NOT EXISTS referral_links (
      id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
      owner_ip_hash TEXT, owner_device_hash TEXT
    )`).run();
    await d1().prepare(`CREATE TABLE IF NOT EXISTS referral_attributions (
      id TEXT PRIMARY KEY, referee_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL, completed_at TEXT, referee_email_hash TEXT,
      referee_device_hash TEXT, referee_ip_hash TEXT, CHECK (referee_user_id <> referrer_user_id)
    )`).run();
    for (const column of ['owner_ip_hash TEXT','owner_device_hash TEXT']) {
      try { await d1().prepare(`ALTER TABLE referral_links ADD COLUMN ${column}`).run(); } catch { /* Migration already applied. */ }
    }
    for (const column of ['referee_email_hash TEXT','referee_device_hash TEXT','referee_ip_hash TEXT']) {
      try { await d1().prepare(`ALTER TABLE referral_attributions ADD COLUMN ${column}`).run(); } catch { /* Migration already applied. */ }
    }
    await d1().prepare(`CREATE INDEX IF NOT EXISTS idx_referral_attributions_referrer_completed
      ON referral_attributions(referrer_user_id,completed_at,created_at DESC)`).run();
    await d1().prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_attributions_email_hash
      ON referral_attributions(referee_email_hash) WHERE referee_email_hash IS NOT NULL`).run();
    await d1().prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_attributions_device_hash
      ON referral_attributions(referee_device_hash) WHERE referee_device_hash IS NOT NULL`).run();
    await d1().prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_attributions_ip_hash
      ON referral_attributions(referee_ip_hash) WHERE referee_ip_hash IS NOT NULL`).run();
  })();
  return schemaReady;
}

function tokenString() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function identityHash(purpose: 'email' | 'device' | 'ip', value: string | null) {
  if (!value) return null;
  const values = env as unknown as Record<string, string | undefined>;
  const secret = values.REFERRAL_ABUSE_SECRET || values.TURNSTILE_SECRET_KEY || '';
  if (!secret) return null;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const normalized = purpose === 'email' ? value.trim().toLowerCase() : value.trim().toLowerCase();
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`sift-referral:${purpose}:${normalized}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function clientIp(req?: Request) {
  const value = req?.headers.get('cf-connecting-ip')?.trim();
  return value && value.length <= 64 ? value : null;
}

function deviceValue(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value) ? value : null;
}

export async function referralUrlForUser(userId: string, origin: string, req?: Request, deviceId?: unknown) {
  await ensureReferralDb();
  const ipHash = await identityHash('ip', clientIp(req));
  const deviceHash = await identityHash('device', deviceValue(deviceId));
  const existing = await d1().prepare(`SELECT token FROM referral_links WHERE owner_user_id=?`).bind(userId).first<{ token: string }>();
  if (existing?.token) {
    await d1().prepare(`UPDATE referral_links SET owner_ip_hash=COALESCE(owner_ip_hash,?),owner_device_hash=COALESCE(owner_device_hash,?) WHERE owner_user_id=?`)
      .bind(ipHash, deviceHash, userId).run();
    return `${origin}/r/${existing.token}`;
  }
  const token = tokenString();
  await d1().prepare(`INSERT OR IGNORE INTO referral_links(id,owner_user_id,token,token_hash,created_at,owner_ip_hash,owner_device_hash) VALUES(?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), userId, token, await tokenHash(token), new Date().toISOString(), ipHash, deviceHash).run();
  const saved = await d1().prepare(`SELECT token FROM referral_links WHERE owner_user_id=?`).bind(userId).first<{ token: string }>();
  if (!saved?.token) throw new Error('Не вдалося створити реферальне посилання.');
  return `${origin}/r/${saved.token}`;
}

export async function confirmedReferralCount(userId: string) {
  await ensureReferralDb();
  const row = await d1().prepare(`SELECT COUNT(*) AS count FROM referral_attributions WHERE referrer_user_id=? AND completed_at IS NOT NULL`)
    .bind(userId).first<{ count: number }>();
  return Number(row?.count || 0);
}

export async function attributeReferralSignup(refereeUserId: string, token: unknown, req?: Request, deviceId?: unknown) {
  await ensureReferralDb();
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const owner = await d1().prepare(`SELECT owner_user_id,owner_ip_hash,owner_device_hash FROM referral_links WHERE token_hash=?`)
    .bind(await tokenHash(token)).first<{ owner_user_id: string; owner_ip_hash: string | null; owner_device_hash: string | null }>();
  if (!owner || owner.owner_user_id === refereeUserId) return false;
  const user = await d1().prepare(`SELECT email FROM users WHERE id=?`).bind(refereeUserId).first<{ email: string }>();
  if (!user?.email) return false;
  const [emailHash, deviceHash, ipHash] = await Promise.all([
    identityHash('email', user.email),
    identityHash('device', deviceValue(deviceId)),
    identityHash('ip', clientIp(req)),
  ]);
  const [emailUsed, deviceUsed, ipUsed] = await Promise.all([
    emailHash ? d1().prepare(`SELECT 1 AS found FROM referral_attributions WHERE referee_email_hash=? LIMIT 1`).bind(emailHash).first() : null,
    deviceHash ? d1().prepare(`SELECT 1 AS found FROM referral_attributions WHERE referee_device_hash=? LIMIT 1`).bind(deviceHash).first() : null,
    ipHash ? d1().prepare(`SELECT 1 AS found FROM referral_attributions WHERE referee_ip_hash=? LIMIT 1`).bind(ipHash).first() : null,
  ]);
  if (!referralIdentityAllowed({
    ownerIpHash: owner.owner_ip_hash, ownerDeviceHash: owner.owner_device_hash,
    refereeIpHash: ipHash, refereeDeviceHash: deviceHash,
    emailAlreadyUsed: Boolean(emailUsed), deviceAlreadyUsed: Boolean(deviceUsed), ipAlreadyUsed: Boolean(ipUsed),
  })) return false;
  const inserted = await d1().prepare(`INSERT OR IGNORE INTO referral_attributions(
    id,referee_user_id,referrer_user_id,created_at,referee_email_hash,referee_device_hash,referee_ip_hash
  ) VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), refereeUserId, owner.owner_user_id, new Date().toISOString(), emailHash, deviceHash, ipHash).run();
  return (inserted.meta?.changes || 0) > 0;
}

export async function completeReferralAttribution(refereeUserId: string) {
  await ensureReferralDb();
  const attribution = await d1().prepare(`SELECT referrer_user_id FROM referral_attributions WHERE referee_user_id=? AND completed_at IS NULL`)
    .bind(refereeUserId).first<{ referrer_user_id: string }>();
  if (!attribution) return false;
  const completedAt = new Date().toISOString();
  await trackEvent({
    userId: attribution.referrer_user_id,
    type: 'referral_completed',
    sourceId: refereeUserId,
    payload: { completedAt },
    createdAt: completedAt,
    relatedStatements: [d1().prepare(`UPDATE referral_attributions SET completed_at=? WHERE referee_user_id=? AND referrer_user_id=? AND completed_at IS NULL`)
      .bind(completedAt, refereeUserId, attribution.referrer_user_id)],
  });
  return true;
}
