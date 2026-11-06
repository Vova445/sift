import { env } from 'cloudflare:workers';
import { LEGAL_POLICY_VERSIONS, checkoutLegalConsent } from './legal-consent-policy.js';

const db = () => (env as unknown as { DB: D1Database }).DB;
const sha256 = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const randomToken = () => { const bytes = crypto.getRandomValues(new Uint8Array(32)); return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''); };

export const SHARED_SPACE_PRICE_UAH = 119;
export const SHARED_SPACE_TERM_DAYS = 30;
export const SHARED_SPACE_MAX_MEMBERS = 5;
export const SHARED_SPACE_INVITE_DAYS = 7;

export type SharedSpaceStatus = 'pending' | 'active' | 'expired' | 'closed';
export type SharedSpaceRole = 'owner' | 'member';
export type SharedSpaceRow = {
  id: string; owner_user_id: string; title: string; status: SharedSpaceStatus; test_mode: number;
  expires_at: string | null; last_payment_reference: string | null; created_at: string; updated_at: string;
  role: SharedSpaceRole;
};
export type SharedSpaceItem = {
  id: string; space_id: string; title: string; service_url: string | null; amount_minor: number | null;
  currency: 'UAH' | 'USD' | 'EUR' | 'GBP'; next_charge_date: string | null; status: 'active' | 'canceling' | 'canceled';
  note: string; assigned_to_user_id: string | null; created_by_user_id: string; created_at: string; updated_at: string;
  assigned_email: string | null; created_by_email: string;
};
export type SharedSpaceOrder = {
  order_reference: string; space_id: string; owner_user_id: string; amount_uah: number; currency: 'UAH';
  status: 'pending' | 'paid' | 'declined' | 'expired'; test_mode: number; created_at: string; updated_at: string;
  expires_at: string; paid_at: string | null; period_start: string | null; period_end: string | null;
};

export function validateSharedSpaceTitle(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'Вкажіть назву простору.' };
  const title = value.trim().replace(/\s+/g, ' ');
  if (title.length < 2 || title.length > 60) return { ok: false, error: 'Назва має містити від 2 до 60 символів.' };
  return { ok: true, value: title };
}

export function validateSharedSpaceItem(input: Record<string, unknown>) {
  const title = typeof input.title === 'string' ? input.title.trim().replace(/\s+/g, ' ') : '';
  if (title.length < 2 || title.length > 100) return { ok: false as const, error: 'Назва підписки має містити від 2 до 100 символів.' };
  let serviceUrl: string | null = null;
  if (input.serviceUrl !== undefined && input.serviceUrl !== null && input.serviceUrl !== '') {
    if (typeof input.serviceUrl !== 'string' || input.serviceUrl.length > 2048) return { ok: false as const, error: 'Посилання задовге або некоректне.' };
    try {
      const parsed = new URL(input.serviceUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('invalid');
      serviceUrl = parsed.toString();
    } catch { return { ok: false as const, error: 'Вкажіть коректне посилання http або https.' }; }
  }
  let amountMinor: number | null = null;
  if (input.amountMinor !== undefined && input.amountMinor !== null && input.amountMinor !== '') {
    if (!Number.isSafeInteger(input.amountMinor) || Number(input.amountMinor) < 0 || Number(input.amountMinor) > 100_000_000_00) return { ok: false as const, error: 'Сума має бути цілим числом у мінімальних одиницях валюти.' };
    amountMinor = Number(input.amountMinor);
  }
  const currency = input.currency === undefined ? 'UAH' : input.currency;
  if (!['UAH', 'USD', 'EUR', 'GBP'].includes(String(currency))) return { ok: false as const, error: 'Оберіть підтримувану валюту.' };
  let nextChargeDate: string | null = null;
  if (input.nextChargeDate !== undefined && input.nextChargeDate !== null && input.nextChargeDate !== '') {
    if (typeof input.nextChargeDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.nextChargeDate)) return { ok: false as const, error: 'Вкажіть дату у форматі РРРР-ММ-ДД.' };
    const date = new Date(`${input.nextChargeDate}T00:00:00.000Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== input.nextChargeDate) return { ok: false as const, error: 'Вкажіть коректну дату.' };
    nextChargeDate = input.nextChargeDate;
  }
  const status = input.status === undefined ? 'active' : input.status;
  if (!['active', 'canceling', 'canceled'].includes(String(status))) return { ok: false as const, error: 'Оберіть коректний стан підписки.' };
  const note = input.note === undefined ? '' : input.note;
  if (typeof note !== 'string' || note.length > 1000) return { ok: false as const, error: 'Нотатка має бути до 1000 символів.' };
  const assignedToUserId = input.assignedToUserId === undefined || input.assignedToUserId === null || input.assignedToUserId === '' ? null : input.assignedToUserId;
  if (assignedToUserId !== null && (typeof assignedToUserId !== 'string' || assignedToUserId.length > 100)) return { ok: false as const, error: 'Некоректний відповідальний учасник.' };
  return { ok: true as const, value: { title, serviceUrl, amountMinor, currency: String(currency) as SharedSpaceItem['currency'], nextChargeDate, status: String(status) as SharedSpaceItem['status'], note: note.trim(), assignedToUserId: assignedToUserId as string | null } };
}

function effectiveStatus(space: Pick<SharedSpaceRow, 'status' | 'expires_at'>): SharedSpaceStatus {
  if (space.status === 'active' && (!space.expires_at || Date.parse(space.expires_at) <= Date.now())) return 'expired';
  return space.status;
}

export async function listSharedSpaces(userId: string) {
  const { results } = await db().prepare(`SELECT s.*,m.role,(SELECT COUNT(*) FROM shared_space_members all_members WHERE all_members.space_id=s.id) AS member_count FROM shared_space_members m JOIN shared_spaces s ON s.id=m.space_id WHERE m.user_id=? ORDER BY s.updated_at DESC`).bind(userId).all<SharedSpaceRow & { member_count: number }>();
  return results.map((space) => ({ ...space, status: effectiveStatus(space), memberCount: space.member_count }));
}

export async function getSharedSpace(spaceId: string, userId: string) {
  const row = await db().prepare(`SELECT s.*,m.role FROM shared_spaces s JOIN shared_space_members m ON m.space_id=s.id WHERE s.id=? AND m.user_id=?`).bind(spaceId, userId).first<SharedSpaceRow>();
  if (!row) return null;
  const status = effectiveStatus(row);
  if (row.role !== 'owner' && status !== 'active') return null;
  const [{ results: members }, { results: items }] = await Promise.all([
    db().prepare(`SELECT m.user_id,m.role,m.joined_at,u.email FROM shared_space_members m JOIN users u ON u.id=m.user_id WHERE m.space_id=? ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END,m.joined_at`).bind(spaceId).all<{ user_id: string; role: SharedSpaceRole; joined_at: string; email: string }>(),
    db().prepare(`SELECT i.*,a.email AS assigned_email,c.email AS created_by_email FROM shared_space_items i LEFT JOIN users a ON a.id=i.assigned_to_user_id JOIN users c ON c.id=i.created_by_user_id WHERE i.space_id=? ORDER BY CASE WHEN i.next_charge_date IS NULL THEN 1 ELSE 0 END,i.next_charge_date,i.created_at DESC`).bind(spaceId).all<SharedSpaceItem>(),
  ]);
  const pendingInvites = row.role === 'owner' ? await db().prepare(`SELECT id,expires_at,uses_count,max_uses,created_at FROM shared_space_invites WHERE space_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC`).bind(spaceId, new Date().toISOString()).all() : { results: [] };
  const latestOrder = row.role === 'owner' ? await db().prepare(`SELECT order_reference,status,amount_uah,created_at,paid_at,period_start,period_end FROM shared_space_orders WHERE space_id=? ORDER BY created_at DESC LIMIT 5`).bind(spaceId).all() : { results: [] };
  return { ...row, status, members, items, invites: pendingInvites.results, payments: latestOrder.results, priceUah: SHARED_SPACE_PRICE_UAH, termDays: SHARED_SPACE_TERM_DAYS, maxMembers: SHARED_SPACE_MAX_MEMBERS };
}

export async function createSharedSpace(userId: string, title: string) {
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await db().batch([
    db().prepare(`INSERT INTO shared_spaces(id,owner_user_id,title,status,created_at,updated_at) VALUES(?,?,?,'pending',?,?)`).bind(id, userId, title, now, now),
    db().prepare(`INSERT INTO shared_space_members(space_id,user_id,role,joined_at) VALUES(?,?,'owner',?)`).bind(id, userId, now),
  ]);
  return getSharedSpace(id, userId);
}

export async function renameSharedSpace(spaceId: string, ownerId: string, title: string) {
  const result = await db().prepare(`UPDATE shared_spaces SET title=?,updated_at=? WHERE id=? AND owner_user_id=? AND status!='closed'`).bind(title, new Date().toISOString(), spaceId, ownerId).run();
  return (result.meta?.changes || 0) > 0;
}

export async function createSharedSpaceInvite(spaceId: string, ownerId: string) {
  const space = await db().prepare(`SELECT status,expires_at FROM shared_spaces WHERE id=? AND owner_user_id=?`).bind(spaceId, ownerId).first<{ status: SharedSpaceStatus; expires_at: string | null }>();
  if (!space) return { kind: 'missing' as const };
  if (effectiveStatus({ status: space.status, expires_at: space.expires_at }) !== 'active') return { kind: 'inactive' as const };
  const counts = await db().prepare(`SELECT (SELECT COUNT(*) FROM shared_space_members WHERE space_id=?) AS members,(SELECT COALESCE(SUM(max_uses-uses_count),0) FROM shared_space_invites WHERE space_id=? AND revoked_at IS NULL AND expires_at>?) AS reserved`).bind(spaceId, spaceId, new Date().toISOString()).first<{ members: number; reserved: number }>();
  const seats = SHARED_SPACE_MAX_MEMBERS - (counts?.members || 0) - (counts?.reserved || 0);
  if (seats <= 0) return { kind: 'full' as const };
  const token = randomToken(), tokenHash = await sha256(token), id = crypto.randomUUID(), now = new Date(), expiresAt = new Date(now.getTime() + SHARED_SPACE_INVITE_DAYS * 864e5).toISOString();
  await db().prepare(`INSERT INTO shared_space_invites(id,space_id,token_hash,created_by,max_uses,expires_at,created_at) VALUES(?,?,?,?,?,?,?)`).bind(id, spaceId, tokenHash, ownerId, Math.min(seats, SHARED_SPACE_MAX_MEMBERS - 1), expiresAt, now.toISOString()).run();
  return { kind: 'created' as const, id, token, expiresAt, maxUses: Math.min(seats, SHARED_SPACE_MAX_MEMBERS - 1) };
}

export async function revokeSharedSpaceInvite(spaceId: string, inviteId: string, ownerId: string) {
  const result = await db().prepare(`UPDATE shared_space_invites SET revoked_at=? WHERE id=? AND space_id=? AND created_by=? AND revoked_at IS NULL`).bind(new Date().toISOString(), inviteId, spaceId, ownerId).run();
  return (result.meta?.changes || 0) > 0;
}

export async function acceptSharedSpaceInvite(token: string, userId: string) {
  if (!/^[a-f\d]{64}$/i.test(token)) return { kind: 'invalid' as const };
  const tokenHash = await sha256(token);
  const invite = await db().prepare(`SELECT i.id,i.space_id,i.uses_count,i.max_uses,i.expires_at,i.revoked_at,s.status,s.expires_at AS space_expires FROM shared_space_invites i JOIN shared_spaces s ON s.id=i.space_id WHERE i.token_hash=?`).bind(tokenHash).first<{ id: string; space_id: string; uses_count: number; max_uses: number; expires_at: string; revoked_at: string | null; status: SharedSpaceStatus; space_expires: string | null }>();
  if (!invite || invite.revoked_at || Date.parse(invite.expires_at) <= Date.now() || effectiveStatus({ status: invite.status, expires_at: invite.space_expires }) !== 'active') return { kind: 'invalid' as const };
  const member = await db().prepare(`SELECT role FROM shared_space_members WHERE space_id=? AND user_id=?`).bind(invite.space_id, userId).first<{ role: SharedSpaceRole }>();
  if (member) return { kind: 'accepted' as const, spaceId: invite.space_id, alreadyMember: true };
  const acceptedAt = new Date().toISOString();
  await db().batch([
    db().prepare(`UPDATE shared_space_invites SET uses_count=uses_count+1 WHERE id=? AND revoked_at IS NULL AND expires_at>? AND uses_count<max_uses AND EXISTS(SELECT 1 FROM shared_spaces s WHERE s.id=shared_space_invites.space_id AND s.status='active' AND s.expires_at>?)`).bind(invite.id, acceptedAt, acceptedAt),
    db().prepare(`INSERT OR IGNORE INTO shared_space_invite_acceptances(invite_id,user_id,use_number,accepted_at) SELECT id,?,uses_count,? FROM shared_space_invites WHERE id=? AND revoked_at IS NULL AND expires_at>? AND uses_count BETWEEN 1 AND max_uses AND EXISTS(SELECT 1 FROM shared_spaces s WHERE s.id=shared_space_invites.space_id AND s.status='active' AND s.expires_at>?) AND NOT EXISTS (SELECT 1 FROM shared_space_invite_acceptances WHERE invite_id=? AND user_id=?)`).bind(userId, acceptedAt, invite.id, acceptedAt, acceptedAt, invite.id, userId),
    db().prepare(`INSERT OR IGNORE INTO shared_space_members(space_id,user_id,role,invited_by,joined_at) SELECT ?,a.user_id,'member',i.created_by,a.accepted_at FROM shared_space_invite_acceptances a JOIN shared_space_invites i ON i.id=a.invite_id JOIN shared_spaces s ON s.id=i.space_id WHERE a.invite_id=? AND a.user_id=? AND a.use_number<=i.max_uses AND i.revoked_at IS NULL AND i.expires_at>? AND s.status='active' AND s.expires_at>?`).bind(invite.space_id, invite.id, userId, acceptedAt, acceptedAt),
  ]);
  const joined = await db().prepare(`SELECT 1 FROM shared_space_members WHERE space_id=? AND user_id=? AND role='member'`).bind(invite.space_id, userId).first();
  return joined ? { kind: 'accepted' as const, spaceId: invite.space_id, alreadyMember: false } : { kind: 'full' as const };
}

export async function createSharedSpaceItem(spaceId: string, userId: string, input: ReturnType<typeof validateSharedSpaceItem> & { ok: true }) {
  const value = input.value;
  if (value.assignedToUserId) {
    const assignee = await db().prepare(`SELECT 1 FROM shared_space_members WHERE space_id=? AND user_id=?`).bind(spaceId, value.assignedToUserId).first();
    if (!assignee) return { kind: 'bad_assignee' as const };
  }
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await db().prepare(`INSERT INTO shared_space_items(id,space_id,title,service_url,amount_minor,currency,next_charge_date,status,note,assigned_to_user_id,created_by_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, spaceId, value.title, value.serviceUrl, value.amountMinor, value.currency, value.nextChargeDate, value.status, value.note, value.assignedToUserId, userId, now, now).run();
  return { kind: 'created' as const };
}

export async function updateSharedSpaceItem(spaceId: string, itemId: string, userId: string, role: SharedSpaceRole, input: ReturnType<typeof validateSharedSpaceItem> & { ok: true }) {
  const value = input.value;
  if (value.assignedToUserId) {
    const assignee = await db().prepare(`SELECT 1 FROM shared_space_members WHERE space_id=? AND user_id=?`).bind(spaceId, value.assignedToUserId).first();
    if (!assignee) return { kind: 'bad_assignee' as const };
  }
  const result = await db().prepare(`UPDATE shared_space_items SET title=?,service_url=?,amount_minor=?,currency=?,next_charge_date=?,status=?,note=?,assigned_to_user_id=?,updated_at=? WHERE id=? AND space_id=? AND (?='owner' OR created_by_user_id=?)`).bind(value.title, value.serviceUrl, value.amountMinor, value.currency, value.nextChargeDate, value.status, value.note, value.assignedToUserId, new Date().toISOString(), itemId, spaceId, role, userId).run();
  return (result.meta?.changes || 0) > 0 ? { kind: 'updated' as const } : { kind: 'missing' as const };
}

export async function deleteSharedSpaceItem(spaceId: string, itemId: string, userId: string, role: SharedSpaceRole) {
  const result = await db().prepare(`DELETE FROM shared_space_items WHERE id=? AND space_id=? AND (?='owner' OR created_by_user_id=?)`).bind(itemId, spaceId, role, userId).run();
  return (result.meta?.changes || 0) > 0;
}

export async function removeSharedSpaceMember(spaceId: string, memberId: string, ownerId: string) {
  if (memberId === ownerId) return false;
  const result = await db().prepare(`DELETE FROM shared_space_members WHERE space_id=? AND user_id=? AND role='member' AND EXISTS(SELECT 1 FROM shared_spaces WHERE id=? AND owner_user_id=?)`).bind(spaceId, memberId, spaceId, ownerId).run();
  if (!(result.meta?.changes || 0)) return false;
  await db().prepare(`UPDATE shared_space_items SET assigned_to_user_id=NULL,updated_at=? WHERE space_id=? AND assigned_to_user_id=?`).bind(new Date().toISOString(), spaceId, memberId).run();
  return true;
}

export async function leaveSharedSpace(spaceId: string, userId: string) {
  const result = await db().prepare(`DELETE FROM shared_space_members WHERE space_id=? AND user_id=? AND role='member'`).bind(spaceId, userId).run();
  if (!(result.meta?.changes || 0)) return false;
  await db().prepare(`UPDATE shared_space_items SET assigned_to_user_id=NULL,updated_at=? WHERE space_id=? AND assigned_to_user_id=?`).bind(new Date().toISOString(), spaceId, userId).run();
  return true;
}

export async function createSharedSpacePayment(input: { spaceId: string; ownerId: string; reference: string; testMode: boolean; legalConsent: unknown }) {
  const consent = checkoutLegalConsent(input.legalConsent);
  if (!consent) return { kind: 'consent_required' as const };
  const space = await db().prepare(`SELECT status FROM shared_spaces WHERE id=? AND owner_user_id=?`).bind(input.spaceId, input.ownerId).first<{ status: SharedSpaceStatus }>();
  if (!space || space.status === 'closed') return { kind: 'missing' as const };
  const now = new Date(), expires = new Date(now.getTime() + 60 * 60 * 1000), nowIso = now.toISOString();
  await db().batch([
    db().prepare(`INSERT INTO shared_space_orders(order_reference,space_id,owner_user_id,amount_uah,status,test_mode,created_at,updated_at,expires_at) VALUES(?,?,?,?,'pending',?,?,?,?)`).bind(input.reference, input.spaceId, input.ownerId, SHARED_SPACE_PRICE_UAH, input.testMode ? 1 : 0, nowIso, nowIso, expires.toISOString()),
    db().prepare(`INSERT INTO shared_space_legal_acceptances(id,user_id,space_id,order_reference,terms_version,privacy_version,refund_version,terms_accepted,privacy_acknowledged,refund_accepted,immediate_performance,accepted_at) VALUES(?,?,?,?,?,?,?,1,1,1,1,?)`).bind(crypto.randomUUID(), input.ownerId, input.spaceId, input.reference, LEGAL_POLICY_VERSIONS.terms, LEGAL_POLICY_VERSIONS.privacy, LEGAL_POLICY_VERSIONS.refund, nowIso),
  ]);
  return { kind: 'created' as const, amountUah: SHARED_SPACE_PRICE_UAH, expiresAt: expires.toISOString() };
}

export async function getSharedSpacePayment(reference: string, ownerId?: string) {
  const query = ownerId
    ? db().prepare(`SELECT * FROM shared_space_orders WHERE order_reference=? AND owner_user_id=?`).bind(reference, ownerId)
    : db().prepare(`SELECT * FROM shared_space_orders WHERE order_reference=?`).bind(reference);
  return query.first<SharedSpaceOrder>();
}

export function sharedSpaceAmountMatches(order: Pick<SharedSpaceOrder, 'amount_uah'>, amount: unknown, currency: unknown) {
  return currency === 'UAH' && Number.isFinite(Number(amount)) && Number(amount) === order.amount_uah;
}

export async function setSharedSpacePaymentStatus(order: SharedSpaceOrder, status: 'paid' | 'declined' | 'expired') {
  const now = new Date().toISOString();
  if (status !== 'paid') {
    await db().prepare(`UPDATE shared_space_orders SET status=?,updated_at=? WHERE order_reference=? AND status='pending'`).bind(status, now, order.order_reference).run();
    return;
  }
  await db().batch([
    db().prepare(`UPDATE shared_space_orders SET status='paid',paid_at=?,updated_at=? WHERE order_reference=? AND status='pending' AND amount_uah=? AND currency='UAH' AND expires_at>?`).bind(now, now, order.order_reference, SHARED_SPACE_PRICE_UAH, now),
    db().prepare(`UPDATE shared_spaces SET status='active',test_mode=(SELECT test_mode FROM shared_space_orders WHERE order_reference=?),expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',MAX(COALESCE(julianday(expires_at),julianday(?)),julianday(?))+?),last_payment_reference=?,updated_at=? WHERE id=(SELECT space_id FROM shared_space_orders WHERE order_reference=? AND status='paid') AND COALESCE(last_payment_reference,'')<>? AND status!='closed'`).bind(order.order_reference, now, now, SHARED_SPACE_TERM_DAYS, order.order_reference, now, order.order_reference, order.order_reference),
    db().prepare(`UPDATE shared_space_orders SET period_start=COALESCE(period_start,?),period_end=(SELECT expires_at FROM shared_spaces WHERE id=shared_space_orders.space_id),updated_at=? WHERE order_reference=? AND status='paid'`).bind(now, now, order.order_reference),
  ]);
}
