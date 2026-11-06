import { env } from 'cloudflare:workers';

const db = () => (env as unknown as { DB: D1Database }).DB;
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
const randomHex = (size: number) => { const bytes = new Uint8Array(size); crypto.getRandomValues(bytes); return hex(bytes); };
const now = () => new Date().toISOString();

export type DeveloperApiKey = { id: string; user_id: string; label: string; key_prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null };
export type ApiKeyOwner = { id: string; user_id: string; email: string; email_verified_at: string | null; key_id: string; key_prefix: string };

export function validateApiKeyLabel(value: unknown) {
  if (typeof value !== 'string') return { ok: false as const, error: 'Дайте ключу назву.' };
  const label = value.trim().replace(/\s+/g, ' ');
  if (!label || label.length > 40 || /[\u0000-\u001f\u007f]/.test(label)) return { ok: false as const, error: 'Назва має містити від 1 до 40 символів.' };
  return { ok: true as const, value: label };
}

export async function listDeveloperApiKeys(userId: string) {
  return (await db().prepare(`SELECT id,user_id,label,key_prefix,created_at,last_used_at,revoked_at FROM developer_api_keys WHERE user_id=? ORDER BY created_at DESC LIMIT 20`).bind(userId).all<DeveloperApiKey>()).results || [];
}

export async function createDeveloperApiKey(userId: string, label: string) {
  const active = await db().prepare(`SELECT COUNT(*) AS count FROM developer_api_keys WHERE user_id=? AND revoked_at IS NULL`).bind(userId).first<{ count: number }>();
  if ((active?.count || 0) >= 5) throw new Error('Можна мати не більше 5 активних API-ключів. Відкличте старий ключ і спробуйте знову.');
  const id = crypto.randomUUID();
  const key = `sift_sk_${randomHex(32)}`;
  const createdAt = now();
  await db().prepare(`INSERT INTO developer_api_keys(id,user_id,label,key_prefix,key_hash,created_at) VALUES(?,?,?,?,?,?)`).bind(id, userId, label, key.slice(0, 16), await sha256(key), createdAt).run();
  return { id, label, prefix: key.slice(0, 16), createdAt, key };
}

export async function revokeDeveloperApiKey(userId: string, id: string) {
  const result = await db().prepare(`UPDATE developer_api_keys SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL`).bind(now(), id, userId).run();
  return (result.meta?.changes || 0) > 0;
}

export async function authenticateDeveloperApiKey(request: Request): Promise<ApiKeyOwner | null> {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer (sift_sk_[a-f\d]{64})$/i);
  if (!match) return null;
  const tokenHash = await sha256(match[1]);
  const row = await db().prepare(`SELECT k.id AS key_id,k.user_id,k.key_prefix,u.id,u.email,v.verified_at AS email_verified_at FROM developer_api_keys k JOIN users u ON u.id=k.user_id LEFT JOIN email_verification_status v ON v.user_id=u.id WHERE k.key_hash=? AND k.revoked_at IS NULL`).bind(tokenHash).first<ApiKeyOwner>();
  if (row) await db().prepare(`UPDATE developer_api_keys SET last_used_at=? WHERE id=? AND revoked_at IS NULL`).bind(now(), row.key_id).run();
  return row || null;
}

export async function createTelegramLinkCode(userId: string) {
  const code = randomHex(24);
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await db().batch([
    db().prepare(`DELETE FROM telegram_link_codes WHERE user_id=? AND used_at IS NULL`).bind(userId),
    db().prepare(`INSERT INTO telegram_link_codes(code_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)`).bind(await sha256(code), userId, expiresAt, createdAt),
  ]);
  return { code, createdAt, expiresAt };
}

export async function telegramLinkStatus(userId: string) {
  const [account, groups] = await Promise.all([
    db().prepare(`SELECT telegram_username,first_name,linked_at,last_used_at FROM telegram_accounts WHERE user_id=?`).bind(userId).first<{ telegram_username: string | null; first_name: string | null; linked_at: string; last_used_at: string | null }>(),
    db().prepare(`SELECT COUNT(*) AS count FROM telegram_group_authorizations WHERE owner_user_id=?`).bind(userId).first<{ count: number }>(),
  ]);
  return { linked: Boolean(account), username: account?.telegram_username || null, firstName: account?.first_name || null, linkedAt: account?.linked_at || null, lastUsedAt: account?.last_used_at || null, authorizedGroups: groups?.count || 0 };
}

export async function telegramLinkCodeUserId(code: string) {
  const row = await db().prepare(`SELECT user_id,expires_at,used_at FROM telegram_link_codes WHERE code_hash=?`).bind(await sha256(code)).first<{ user_id: string; expires_at: string; used_at: string | null }>();
  return row && !row.used_at && Date.parse(row.expires_at) > Date.now() ? row.user_id : null;
}

export async function telegramLinkOwner(code: string, identity: { id: string; username?: string; firstName?: string }) {
  const codeHash = await sha256(code);
  const link = await db().prepare(`SELECT user_id,expires_at,used_at FROM telegram_link_codes WHERE code_hash=?`).bind(codeHash).first<{ user_id: string; expires_at: string; used_at: string | null }>();
  if (!link || link.used_at || Date.parse(link.expires_at) <= Date.now()) return { ok: false as const, reason: 'invalid' };
  const linkedTelegram = await db().prepare(`SELECT user_id FROM telegram_accounts WHERE telegram_user_id=?`).bind(identity.id).first<{ user_id: string }>();
  if (linkedTelegram && linkedTelegram.user_id !== link.user_id) return { ok: false as const, reason: 'already_linked' };
  const linkedAccount = await db().prepare(`SELECT telegram_user_id FROM telegram_accounts WHERE user_id=?`).bind(link.user_id).first<{ telegram_user_id: string }>();
  if (linkedAccount && linkedAccount.telegram_user_id !== identity.id) return { ok: false as const, reason: 'account_has_telegram' };
  const timestamp = now();
  const statements = [
    db().prepare(`UPDATE telegram_link_codes SET used_at=? WHERE code_hash=? AND user_id=? AND used_at IS NULL AND expires_at>?`).bind(timestamp, codeHash, link.user_id, timestamp),
    db().prepare(`INSERT INTO telegram_accounts(telegram_user_id,user_id,telegram_username,first_name,linked_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM telegram_link_codes WHERE code_hash=? AND used_at=?) ON CONFLICT(telegram_user_id) DO UPDATE SET telegram_username=excluded.telegram_username,first_name=excluded.first_name WHERE telegram_accounts.user_id=excluded.user_id`).bind(identity.id, link.user_id, identity.username || null, identity.firstName || null, timestamp, codeHash, timestamp),
  ];
  await db().batch(statements);
  const stored = await db().prepare(`SELECT user_id FROM telegram_accounts WHERE telegram_user_id=?`).bind(identity.id).first<{ user_id: string }>();
  return stored?.user_id === link.user_id ? { ok: true as const, userId: link.user_id } : { ok: false as const, reason: 'already_linked' };
}

export async function telegramAccount(telegramUserId: string) {
  return db().prepare(`SELECT a.user_id,a.telegram_user_id,u.email,v.verified_at AS email_verified_at FROM telegram_accounts a JOIN users u ON u.id=a.user_id LEFT JOIN email_verification_status v ON v.user_id=u.id WHERE a.telegram_user_id=?`).bind(telegramUserId).first<{ user_id: string; telegram_user_id: string; email: string; email_verified_at: string | null }>();
}

export async function telegramGroupOwner(chatId: string) {
  return db().prepare(`SELECT owner_user_id,linked_telegram_user_id FROM telegram_group_authorizations WHERE chat_id=?`).bind(chatId).first<{ owner_user_id: string; linked_telegram_user_id: string }>();
}

export async function authorizeTelegramGroup(input: { chatId: string; userId: string; telegramUserId: string; title: string }) {
  await db().prepare(`INSERT INTO telegram_group_authorizations(chat_id,owner_user_id,linked_telegram_user_id,title,linked_at) VALUES(?,?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET owner_user_id=excluded.owner_user_id,linked_telegram_user_id=excluded.linked_telegram_user_id,title=excluded.title,linked_at=excluded.linked_at`).bind(input.chatId, input.userId, input.telegramUserId, input.title.slice(0, 120), now()).run();
}

export async function revokeTelegramGroup(chatId: string, userId: string) {
  await db().prepare(`DELETE FROM telegram_group_authorizations WHERE chat_id=? AND owner_user_id=?`).bind(chatId, userId).run();
}

export async function unlinkTelegram(userId: string) {
  await db().batch([
    db().prepare(`DELETE FROM telegram_group_authorizations WHERE owner_user_id=?`).bind(userId),
    db().prepare(`DELETE FROM telegram_accounts WHERE user_id=?`).bind(userId),
    db().prepare(`DELETE FROM telegram_link_codes WHERE user_id=?`).bind(userId),
  ]);
}

export async function claimTelegramUpdate(updateId: number) {
  const timestamp = Date.now();
  const result = await db().prepare(`INSERT INTO telegram_bot_updates(update_id,status,lease_until,updated_at) VALUES(?,'processing',?,?) ON CONFLICT(update_id) DO UPDATE SET status='processing',lease_until=excluded.lease_until,updated_at=excluded.updated_at WHERE telegram_bot_updates.status!='processed' AND telegram_bot_updates.lease_until<=?`).bind(updateId, timestamp + 60_000, now(), timestamp).run();
  const claimed = (result.meta?.changes || 0) > 0;
  if (!claimed) return { claimed: false as const, chatId: null, replyText: null };
  const row = await db().prepare(`SELECT chat_id,reply_text FROM telegram_bot_updates WHERE update_id=?`).bind(updateId).first<{ chat_id: string | null; reply_text: string | null }>();
  return { claimed: true as const, chatId: row?.chat_id || null, replyText: row?.reply_text || null };
}

export async function cacheTelegramReply(updateId: number, chatId: number, replyText: string) {
  await db().prepare(`UPDATE telegram_bot_updates SET chat_id=?,reply_text=?,updated_at=? WHERE update_id=? AND status='processing'`).bind(String(chatId), replyText, now(), updateId).run();
}

export async function finishTelegramUpdate(updateId: number, success: boolean) {
  await db().prepare(`UPDATE telegram_bot_updates SET status=?,lease_until=?,updated_at=? WHERE update_id=?`).bind(success ? 'processed' : 'failed', success ? Number.MAX_SAFE_INTEGER : 0, now(), updateId).run();
}

export async function markTelegramUse(telegramUserId: string) {
  await db().prepare(`UPDATE telegram_accounts SET last_used_at=? WHERE telegram_user_id=?`).bind(now(), telegramUserId).run();
}
