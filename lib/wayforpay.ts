import {createHmac, timingSafeEqual} from 'node:crypto';
import {env} from 'cloudflare:workers';
import {checkoutAcceptanceStatement} from './legal-acceptance';
import type {CheckoutLegalConsent} from './legal-consent-policy.js';
import {ensureDb} from './db';
import {addCalendarMonth,type SubscriptionStatus} from './subscription-lifecycle';
import {planDetails,type PaidPlan} from './plan-catalog';
import {ensureFunnelAnalyticsDb,recordFunnelEventByHash} from './funnel-analytics';
import {ensureRewardsDb,rewardPaymentStatement} from './rewards';
export {planDetails} from './plan-catalog';
export type {PaidPlan} from './plan-catalog';

export type PaymentOrder={order_reference:string;user_id:string;plan:PaidPlan;amount_uah:number;currency:string;status:string;test_mode:number;expires_at:string;analytics_session_hash?:string|null;reward_id?:string|null};
export type WayForPayPayload=Record<string,unknown>;
const cfg=()=>env as unknown as Record<string,string|undefined>;
const sha256=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function wayForPayConfig(){const e=cfg(),mode=e.WAYFORPAY_MODE==='sandbox'?'sandbox':'live';return{mode,merchantAccount:e.WAYFORPAY_MERCHANT_ACCOUNT||'',secret:e.WAYFORPAY_MERCHANT_SECRET||'',merchantPassword:e.WAYFORPAY_MERCHANT_PASSWORD||'',domain:e.WAYFORPAY_MERCHANT_DOMAIN||'',appBaseUrl:e.APP_BASE_URL||'',allowlist:(e.WAYFORPAY_SANDBOX_ALLOWLIST||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)};}
export async function wasBillingReferenceDeleted(reference:string){await ensureDb();if(!reference)return false;const hash=await sha256(reference),row=await env.DB.prepare(`SELECT 1 AS found FROM deleted_billing_refs WHERE reference_hash=? AND expires_at>?`).bind(hash,new Date().toISOString()).first<{found:number}>();return !!row;}
export function sandboxAllowed(email:string){const c=wayForPayConfig();return c.mode==='sandbox'&&c.allowlist.includes(email.trim().toLowerCase());}
export function sign(value:string,secret=wayForPayConfig().secret){return createHmac('md5',secret).update(value,'utf8').digest('hex');}
export function signatureMatches(value:string,signature:unknown){if(typeof signature!=='string'||!/^[a-f\d]{32}$/i.test(signature))return false;const expected=Buffer.from(sign(value),'hex'),actual=Buffer.from(signature,'hex');return expected.length===actual.length&&timingSafeEqual(expected,actual);}
export function providerAmountMatches(order:PaymentOrder,amount:unknown,currency:unknown){const value=Number(amount);if(!Number.isFinite(value))return false;if(currency==='UAH')return value===order.amount_uah;if(currency==='USD'){const usd=Number(planDetails(order.plan).usd);return value===(order.reward_id?Math.round(usd*50)/100:usd)}return false;}
export async function getPaymentOrder(reference:string,userId?:string){await ensureDb();await ensureRewardsDb();const q=userId?env.DB.prepare('SELECT * FROM payment_orders WHERE order_reference=? AND user_id=?').bind(reference,userId):env.DB.prepare('SELECT * FROM payment_orders WHERE order_reference=?').bind(reference);return q.first<PaymentOrder>();}
export async function createPaymentOrder(order:{reference:string;userId:string;plan:PaidPlan;amount:number;testMode:boolean;legalConsent:CheckoutLegalConsent;analyticsSessionHash?:string|null;rewardId?:string|null}){await ensureFunnelAnalyticsDb();await ensureRewardsDb();const now=new Date(),expires=new Date(now.getTime()+60*60*1000);await env.DB.batch([
  env.DB.prepare(`INSERT INTO payment_orders(order_reference,user_id,plan,amount_uah,currency,status,test_mode,created_at,updated_at,expires_at,analytics_session_hash,reward_id) VALUES(?,?,?,?,?,'pending',?,?,?,?,?,?)`).bind(order.reference,order.userId,order.plan,order.amount,'UAH',order.testMode?1:0,now.toISOString(),now.toISOString(),expires.toISOString(),order.analyticsSessionHash||null,order.rewardId||null),
  checkoutAcceptanceStatement({userId:order.userId,plan:order.plan,orderReference:order.reference,consent:order.legalConsent,acceptedAt:now.toISOString()})
]);}
export async function setPaymentStatus(order:PaymentOrder,status:'paid'|'declined'|'expired'){
  await ensureDb();
  await ensureRewardsDb();
  // Only a pending order may transition to a final state. A repeated callback is idempotent.
  if(status==='paid'){
    const details=planDetails(order.plan),now=new Date(),expiry=(order.plan==='pro'?addCalendarMonth(now):new Date(now.getTime()+details.days*864e5)).toISOString();
    const statements=[
      env.DB.prepare(`UPDATE payment_orders SET status='paid',updated_at=? WHERE order_reference=? AND status='pending' AND amount_uah=? AND currency='UAH'`).bind(now.toISOString(),order.order_reference,order.amount_uah),
      env.DB.prepare(`INSERT INTO subscriptions(id,user_id,plan,status,credits,test_mode,created_at,expires_at,updated_at,recurring_order_reference,last_payment_at) SELECT order_reference,user_id,plan,'active',?,?,?, ?,?,?,? FROM payment_orders WHERE order_reference=? AND status='paid' AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE id=?)`).bind(details.credits,order.test_mode,now.toISOString(),expiry,now.toISOString(),order.plan==='pro'?order.order_reference:null,now.toISOString(),order.order_reference,order.order_reference),
      ...(order.reward_id?[await rewardPaymentStatement(order.reward_id,order.order_reference,'paid',now.toISOString())]:[]),
      ...(order.plan==='pro'?[env.DB.prepare(`INSERT OR IGNORE INTO subscription_payments(order_reference,subscription_id,user_id,amount_uah,status,period_start,period_end,created_at,paid_at) SELECT ?,id,user_id,?,'paid',?,?,?,? FROM subscriptions WHERE id=?`).bind(order.order_reference,order.amount_uah,now.toISOString(),expiry,now.toISOString(),now.toISOString(),order.order_reference)]:[])
    ];
    await env.DB.batch(statements);
    try{const stored=await recordFunnelEventByHash(order.analytics_session_hash,'pay');if(stored)await env.DB.prepare(`UPDATE payment_orders SET analytics_session_hash=NULL WHERE order_reference=?`).bind(order.order_reference).run()}catch(error){console.error('[funnel-analytics] payment event write failed',error instanceof Error?error.message:'unknown error')}
    return;
  }
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE payment_orders SET status=?,analytics_session_hash=NULL,updated_at=? WHERE order_reference=? AND status='pending'`).bind(status,now,order.order_reference),
    ...(order.reward_id?[await rewardPaymentStatement(order.reward_id,order.order_reference,'declined',now)]:[]),
  ]);
}
export async function cancelRecurring(orderReference:string){
  const config=wayForPayConfig();if(!config.merchantAccount||!config.merchantPassword)throw new Error('WayForPay не налаштовано для керування регулярними платежами.');
  const response=await fetch('https://api.wayforpay.com/regularApi',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestType:'REMOVE',merchantAccount:config.merchantAccount,merchantPassword:config.merchantPassword,orderReference})});
  if(!response.ok)throw new Error('WayForPay тимчасово недоступний. Підписку не змінено.');
  const result=await response.json() as {reasonCode?:number|string;reason?:string};if(Number(result.reasonCode)!==4100)throw new Error(`WayForPay не підтвердив скасування: ${result.reason||result.reasonCode||'невідома помилка'}`);
}
export async function cancelProSubscription(userId:string){
  await ensureDb();const now=new Date().toISOString();
  const row=await env.DB.prepare(`SELECT id,status,expires_at,recurring_order_reference,cancel_at_period_end FROM subscriptions WHERE user_id=? AND plan='pro' AND status IN ('trialing','active','past_due','expired') ORDER BY created_at DESC LIMIT 1`).bind(userId).first<{id:string;status:SubscriptionStatus;expires_at:string;recurring_order_reference:string|null;cancel_at_period_end:number}>();
  if(!row)throw new Error('Активну підписку не знайдено.');
  const expired=Date.parse(row.expires_at)<=Date.now();
  if(row.cancel_at_period_end||row.status==='canceled')return {subscriptionId:row.id,status:'canceled' as const,expiresAt:row.expires_at,cancel_at_period_end:1,auto_renew:0};
  if(!row.recurring_order_reference)throw new Error('Цей тариф оплачений одноразово й не має автопродовження.');
  await cancelRecurring(row.recurring_order_reference);
  const nextStatus=row.status==='past_due'?'past_due':expired?'expired':'canceled';
  const result=await env.DB.prepare(`UPDATE subscriptions SET status=?,cancel_at_period_end=1,canceled_at=?,updated_at=? WHERE id=? AND status=? AND cancel_at_period_end=0`).bind(nextStatus,now,now,row.id,row.status).run();
  if(!(result.meta?.changes||0))throw new Error('Стан підписки змінився. Оновіть сторінку й спробуйте ще раз.');
  return {subscriptionId:row.id,status:nextStatus,expiresAt:row.expires_at,cancel_at_period_end:1,auto_renew:0};
}
export async function subscriptionFor(userId:string){
  await ensureDb();const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE subscriptions SET status='expired',updated_at=? WHERE user_id=? AND plan='pro' AND ((status='past_due' AND grace_until IS NOT NULL AND grace_until<=?) OR (status IN ('trialing','active','canceled') AND expires_at<=?))`).bind(now,userId,now,now).run();
  return env.DB.prepare(`SELECT id,status,expires_at,cancel_at_period_end,canceled_at,last_payment_at,past_due_at,grace_until,dunning_email_sent_at,CASE WHEN recurring_order_reference IS NOT NULL AND cancel_at_period_end=0 AND status IN ('active','past_due','expired') THEN 1 ELSE 0 END AS auto_renew FROM subscriptions WHERE user_id=? AND plan='pro' ORDER BY created_at DESC LIMIT 1`).bind(userId).first<{id:string;status:SubscriptionStatus;expires_at:string;cancel_at_period_end:number;canceled_at:string|null;last_payment_at:string|null;past_due_at:string|null;grace_until:string|null;dunning_email_sent_at:string|null;auto_renew:number}>();
}
export function purchaseSignature(fields:{merchantAccount:string;merchantDomainName:string;orderReference:string;orderDate:number;amount:number;currency:string;productName:string[];productCount:number[];productPrice:number[]}){
  return sign([fields.merchantAccount,fields.merchantDomainName,fields.orderReference,fields.orderDate,fields.amount,fields.currency,...fields.productName,...fields.productCount,...fields.productPrice].join(';'));
}
export function callbackSignatureFields(data:WayForPayPayload){return [data.merchantAccount,data.orderReference,data.amount,data.currency,data.authCode,data.cardPan,data.transactionStatus,data.reasonCode].map(x=>x===undefined||x===null?'':String(x)).join(';');}
export function ackSignature(reference:string,status:string,time:number){return sign(`${reference};${status};${time}`);}
