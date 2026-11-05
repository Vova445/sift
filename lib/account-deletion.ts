import {env} from 'cloudflare:workers';
import {ensureDb,ensureTranslationDb} from './db';
import {ensureEmailVerificationDb} from './email-verification';
import {ensurePasswordSecurityDb} from './auth-rate-limit';
import {ensureEmailReminderDb} from './email-reminders';
import {cancelRecurring} from './wayforpay';
import {domainContributionHash,ensureDomainIndexDb} from './domain-index';

const enc=new TextEncoder();
const digest=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');

export async function deleteAccountData(user:{id:string;email:string}){
  await ensureDb();
  await Promise.all([ensureTranslationDb(),ensureEmailVerificationDb(),ensurePasswordSecurityDb(),ensureEmailReminderDb(),ensureDomainIndexDb()]);
  const recurring=await env.DB.prepare(`SELECT id,recurring_order_reference,expires_at,cancel_at_period_end FROM subscriptions WHERE user_id=? AND plan='pro' AND status IN ('trialing','active','past_due','expired','canceled') AND recurring_order_reference IS NOT NULL AND cancel_at_period_end=0`).bind(user.id).all<{id:string;recurring_order_reference:string;expires_at:string;cancel_at_period_end:number}>();
  const pending=await env.DB.prepare(`SELECT order_reference FROM payment_orders WHERE user_id=? AND status='pending' AND expires_at>? LIMIT 1`).bind(user.id,new Date().toISOString()).first<{order_reference:string}>();
  if(pending)throw new Error('Є незавершений платіж. Дочекайтеся його завершення або закінчення строку дії та повторіть видалення.');
  const pendingSpacePayment=await env.DB.prepare(`SELECT order_reference FROM shared_space_orders WHERE owner_user_id=? AND status='pending' AND expires_at>? LIMIT 1`).bind(user.id,new Date().toISOString()).first<{order_reference:string}>();
  if(pendingSpacePayment)throw new Error('Є незавершена оплата спільного простору. Дочекайтеся її завершення або закінчення строку дії та повторіть видалення.');
  for(const sub of recurring.results||[]){
    await cancelRecurring(sub.recurring_order_reference);
    const now=new Date().toISOString(),status=Date.parse(sub.expires_at)>Date.now()?'canceled':'expired';
    const result=await env.DB.prepare(`UPDATE subscriptions SET status=?,cancel_at_period_end=1,canceled_at=?,updated_at=? WHERE id=? AND recurring_order_reference=? AND cancel_at_period_end=0`).bind(status,now,now,sub.id,sub.recurring_order_reference).run();
    if((result.meta?.changes||0)!==1)throw new Error('Підписку скасовано в WayForPay, але стан акаунта змінився. Оновіть сторінку та повторіть видалення.');
  }
  const resetEmailKey=await digest(`reset-email\0${user.email.trim().toLowerCase()}`);
  const publicIndexHash=await domainContributionHash(user.id);
  const references=await env.DB.prepare(`SELECT order_reference AS reference FROM payment_orders WHERE user_id=? UNION SELECT recurring_order_reference AS reference FROM subscriptions WHERE user_id=? AND recurring_order_reference IS NOT NULL UNION SELECT order_reference AS reference FROM shared_space_orders WHERE owner_user_id=?`).bind(user.id,user.id,user.id).all<{reference:string}>();
  const tombstoneExpiry=new Date(Date.now()+30*24*60*60*1000).toISOString();
  const tombstones=await Promise.all((references.results||[]).map(async row=>env.DB.prepare(`INSERT OR IGNORE INTO deleted_billing_refs(reference_hash,expires_at) VALUES(?,?)`).bind(await digest(row.reference),tombstoneExpiry)));
  await env.DB.batch([
    ...tombstones,
    env.DB.prepare(`DELETE FROM billing_events WHERE order_reference IN (SELECT order_reference FROM payment_orders WHERE user_id=?) OR order_reference IN (SELECT recurring_order_reference FROM subscriptions WHERE user_id=?)`).bind(user.id,user.id),
    env.DB.prepare(`DELETE FROM billing_events WHERE order_reference IN (SELECT order_reference FROM shared_space_orders WHERE owner_user_id=?)`).bind(user.id),
    env.DB.prepare(`UPDATE shared_space_items SET assigned_to_user_id=NULL,updated_at=? WHERE assigned_to_user_id=? AND space_id NOT IN (SELECT id FROM shared_spaces WHERE owner_user_id=?)`).bind(new Date().toISOString(),user.id,user.id),
    env.DB.prepare(`DELETE FROM shared_space_items WHERE created_by_user_id=? OR space_id IN (SELECT id FROM shared_spaces WHERE owner_user_id=?)`).bind(user.id,user.id),
    env.DB.prepare(`DELETE FROM shared_space_invite_acceptances WHERE user_id=? OR invite_id IN (SELECT id FROM shared_space_invites WHERE space_id IN (SELECT id FROM shared_spaces WHERE owner_user_id=?))`).bind(user.id,user.id),
    env.DB.prepare(`DELETE FROM shared_space_invites WHERE created_by=? OR space_id IN (SELECT id FROM shared_spaces WHERE owner_user_id=?)`).bind(user.id,user.id),
    env.DB.prepare(`DELETE FROM shared_space_members WHERE user_id=? OR space_id IN (SELECT id FROM shared_spaces WHERE owner_user_id=?)`).bind(user.id,user.id),
    env.DB.prepare(`DELETE FROM shared_space_legal_acceptances WHERE user_id=? OR space_id IN (SELECT id FROM shared_spaces WHERE owner_user_id=?)`).bind(user.id,user.id),
    env.DB.prepare(`DELETE FROM shared_space_orders WHERE owner_user_id=? OR space_id IN (SELECT id FROM shared_spaces WHERE owner_user_id=?)`).bind(user.id,user.id),
    env.DB.prepare(`DELETE FROM shared_spaces WHERE owner_user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM watchlist WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM domain_index_observations WHERE user_hash=?`).bind(publicIndexHash),
    env.DB.prepare(`DELETE FROM domain_index_consent WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM domain_correction_requests WHERE lower(contact_email)=?`).bind(user.email.trim().toLowerCase()),
    env.DB.prepare(`DELETE FROM scans WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM scan_usage WHERE owner_key=?`).bind(`account:${user.id}`),
    env.DB.prepare(`DELETE FROM translation_usage WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM ai_usage_events WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM email_verification_tokens WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM email_verification_status WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM email_verification_limits WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM email_reminder_deliveries WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM email_reminder_unsubscribe_tokens WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM email_reminder_preferences WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM events WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM user_achievements WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM user_achievement_events WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM password_reset_tokens WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM password_reset_limits WHERE key_hash=?`).bind(resetEmailKey),
    env.DB.prepare(`DELETE FROM auth_login_limits WHERE key_hash IN (SELECT key_hash FROM auth_login_limit_email_keys WHERE email_hash=?)`).bind(await digest(user.email.trim().toLowerCase())),
    env.DB.prepare(`DELETE FROM auth_login_limit_email_keys WHERE email_hash=?`).bind(await digest(user.email.trim().toLowerCase())),
    env.DB.prepare(`DELETE FROM sessions WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM telegram_group_authorizations WHERE owner_user_id=? OR linked_telegram_user_id IN (SELECT telegram_user_id FROM telegram_accounts WHERE user_id=?)`).bind(user.id,user.id),
    env.DB.prepare(`DELETE FROM telegram_accounts WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM telegram_link_codes WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM developer_api_keys WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM subscription_payments WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM legal_acceptances WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM payment_orders WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM subscriptions WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM signups WHERE email=?`).bind(user.email.trim().toLowerCase()),
    env.DB.prepare(`DELETE FROM users WHERE id=?`).bind(user.id)
  ]);
}
