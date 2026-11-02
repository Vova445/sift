import {env} from 'cloudflare:workers';
import {ensureDb,ensureTranslationDb} from './db';
import {ensureEmailVerificationDb} from './email-verification';
import {ensurePasswordSecurityDb} from './auth-rate-limit';
import {cancelRecurring} from './wayforpay';

const enc=new TextEncoder();
const digest=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');

export async function deleteAccountData(user:{id:string;email:string}){
  await ensureDb();
  await Promise.all([ensureTranslationDb(),ensureEmailVerificationDb(),ensurePasswordSecurityDb()]);
  const recurring=await env.DB.prepare(`SELECT id,recurring_order_reference,expires_at,cancel_at_period_end FROM subscriptions WHERE user_id=? AND plan='pro' AND status IN ('trialing','active','past_due','expired','canceled') AND recurring_order_reference IS NOT NULL AND cancel_at_period_end=0`).bind(user.id).all<{id:string;recurring_order_reference:string;expires_at:string;cancel_at_period_end:number}>();
  const pending=await env.DB.prepare(`SELECT order_reference FROM payment_orders WHERE user_id=? AND status='pending' AND expires_at>? LIMIT 1`).bind(user.id,new Date().toISOString()).first<{order_reference:string}>();
  if(pending)throw new Error('Є незавершений платіж. Дочекайтеся його завершення або закінчення строку дії та повторіть видалення.');
  for(const sub of recurring.results||[]){
    await cancelRecurring(sub.recurring_order_reference);
    const now=new Date().toISOString(),status=Date.parse(sub.expires_at)>Date.now()?'canceled':'expired';
    const result=await env.DB.prepare(`UPDATE subscriptions SET status=?,cancel_at_period_end=1,canceled_at=?,updated_at=? WHERE id=? AND recurring_order_reference=? AND cancel_at_period_end=0`).bind(status,now,now,sub.id,sub.recurring_order_reference).run();
    if((result.meta?.changes||0)!==1)throw new Error('Підписку скасовано в WayForPay, але стан акаунта змінився. Оновіть сторінку та повторіть видалення.');
  }
  const resetEmailKey=await digest(`reset-email\0${user.email.trim().toLowerCase()}`);
  const references=await env.DB.prepare(`SELECT order_reference AS reference FROM payment_orders WHERE user_id=? UNION SELECT recurring_order_reference AS reference FROM subscriptions WHERE user_id=? AND recurring_order_reference IS NOT NULL`).bind(user.id,user.id).all<{reference:string}>();
  const tombstoneExpiry=new Date(Date.now()+30*24*60*60*1000).toISOString();
  const tombstones=await Promise.all((references.results||[]).map(async row=>env.DB.prepare(`INSERT OR IGNORE INTO deleted_billing_refs(reference_hash,expires_at) VALUES(?,?)`).bind(await digest(row.reference),tombstoneExpiry)));
  await env.DB.batch([
    ...tombstones,
    env.DB.prepare(`DELETE FROM billing_events WHERE order_reference IN (SELECT order_reference FROM payment_orders WHERE user_id=?) OR order_reference IN (SELECT recurring_order_reference FROM subscriptions WHERE user_id=?)`).bind(user.id,user.id),
    env.DB.prepare(`DELETE FROM watchlist WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM scans WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM scan_usage WHERE owner_key=?`).bind(`account:${user.id}`),
    env.DB.prepare(`DELETE FROM translation_usage WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM ai_usage_events WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM email_verification_tokens WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM email_verification_status WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM email_verification_limits WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM password_reset_tokens WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM password_reset_limits WHERE key_hash=?`).bind(resetEmailKey),
    env.DB.prepare(`DELETE FROM auth_login_limits WHERE key_hash IN (SELECT key_hash FROM auth_login_limit_email_keys WHERE email_hash=?)`).bind(await digest(user.email.trim().toLowerCase())),
    env.DB.prepare(`DELETE FROM auth_login_limit_email_keys WHERE email_hash=?`).bind(await digest(user.email.trim().toLowerCase())),
    env.DB.prepare(`DELETE FROM sessions WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM subscription_payments WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM legal_acceptances WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM payment_orders WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM subscriptions WHERE user_id=?`).bind(user.id),
    env.DB.prepare(`DELETE FROM signups WHERE email=?`).bind(user.email.trim().toLowerCase()),
    env.DB.prepare(`DELETE FROM users WHERE id=?`).bind(user.id)
  ]);
}
