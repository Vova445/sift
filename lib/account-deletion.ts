import {env} from 'cloudflare:workers';
import {cancelRecurring} from './wayforpay';
import {domainContributionHash} from './domain-index';

const enc=new TextEncoder();
const digest=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');

export async function deleteAccountData(user:{id:string;email:string}){
  const recurring=await env.DB.prepare(`SELECT id,recurring_order_reference,expires_at FROM subscriptions WHERE user_id=? AND plan='pro' AND status IN ('trialing','active','past_due','expired','canceled') AND recurring_order_reference IS NOT NULL AND cancel_at_period_end=0`).bind(user.id).all<{id:string;recurring_order_reference:string;expires_at:string}>();
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

  const email=user.email.trim().toLowerCase();
  const [resetEmailKey,emailHash,publicIndexHash]=await Promise.all([
    digest(`reset-email\0${email}`),
    digest(email),
    domainContributionHash(user.id),
  ]);
  const references=await env.DB.prepare(`SELECT order_reference AS reference FROM payment_orders WHERE user_id=? UNION SELECT recurring_order_reference AS reference FROM subscriptions WHERE user_id=? AND recurring_order_reference IS NOT NULL UNION SELECT order_reference AS reference FROM shared_space_orders WHERE owner_user_id=?`).bind(user.id,user.id,user.id).all<{reference:string}>();
  const tombstoneExpiry=new Date(Date.now()+30*24*60*60*1000).toISOString();
  const tombstones=await Promise.all((references.results||[]).map(async row=>env.DB.prepare(`INSERT OR IGNORE INTO deleted_billing_refs(reference_hash,expires_at) VALUES(?,?)`).bind(await digest(row.reference),tombstoneExpiry)));

  // The migration trigger removes every user-owned row atomically. Keeping this
  // request to a few D1 statements avoids exceeding Workers' CPU ceiling.
  await env.DB.batch([
    ...tombstones,
    env.DB.prepare(`DELETE FROM domain_index_observations WHERE user_hash=?`).bind(publicIndexHash),
    env.DB.prepare(`DELETE FROM auth_login_limits WHERE key_hash IN (SELECT key_hash FROM auth_login_limit_email_keys WHERE email_hash=?)`).bind(emailHash),
    env.DB.prepare(`DELETE FROM auth_login_limit_email_keys WHERE email_hash=?`).bind(emailHash),
    env.DB.prepare(`DELETE FROM password_reset_limits WHERE key_hash=?`).bind(resetEmailKey),
    env.DB.prepare(`DELETE FROM users WHERE id=?`).bind(user.id),
  ]);
}
