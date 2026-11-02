import {createHmac, timingSafeEqual} from 'node:crypto';
import {env} from 'cloudflare:workers';
import {ensureDb} from './db';

export type PaidPlan='one'|'pro';
export type PaymentOrder={order_reference:string;user_id:string;plan:PaidPlan;amount_uah:number;currency:string;status:string;test_mode:number;expires_at:string};
export type WayForPayPayload=Record<string,unknown>;
const cfg=()=>env as unknown as Record<string,string|undefined>;
export function wayForPayConfig(){const e=cfg(),mode=e.WAYFORPAY_MODE==='sandbox'?'sandbox':'live';return{mode,merchantAccount:e.WAYFORPAY_MERCHANT_ACCOUNT||'',secret:e.WAYFORPAY_MERCHANT_SECRET||'',domain:e.WAYFORPAY_MERCHANT_DOMAIN||'',allowlist:(e.WAYFORPAY_SANDBOX_ALLOWLIST||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)};}
export function sandboxAllowed(email:string){const c=wayForPayConfig();return c.mode==='sandbox'&&c.allowlist.includes(email.trim().toLowerCase());}
export function sign(value:string,secret=wayForPayConfig().secret){return createHmac('md5',secret).update(value,'utf8').digest('hex');}
export function signatureMatches(value:string,signature:unknown){if(typeof signature!=='string'||!/^[a-f\d]{32}$/i.test(signature))return false;const expected=Buffer.from(sign(value),'hex'),actual=Buffer.from(signature,'hex');return expected.length===actual.length&&timingSafeEqual(expected,actual);}
export function planDetails(plan:PaidPlan){return plan==='one'?{label:'One Sift — один повний звіт',uah:59,usd:'1.49',credits:1,days:90}:{label:'Sift Pro — 30 днів',uah:279,usd:'6.90',credits:0,days:30};}
export function providerAmountMatches(order:PaymentOrder,amount:unknown,currency:unknown){const value=Number(amount);if(!Number.isFinite(value))return false;if(currency==='UAH')return value===order.amount_uah;if(currency==='USD')return value===Number(planDetails(order.plan).usd);return false;}
export async function getPaymentOrder(reference:string,userId?:string){await ensureDb();const q=userId?env.DB.prepare('SELECT * FROM payment_orders WHERE order_reference=? AND user_id=?').bind(reference,userId):env.DB.prepare('SELECT * FROM payment_orders WHERE order_reference=?').bind(reference);return q.first<PaymentOrder>();}
export async function createPaymentOrder(order:{reference:string;userId:string;plan:PaidPlan;amount:number;testMode:boolean}){await ensureDb();const now=new Date(),expires=new Date(now.getTime()+60*60*1000);await env.DB.prepare(`INSERT INTO payment_orders(order_reference,user_id,plan,amount_uah,currency,status,test_mode,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,'pending',?,?,?,?)`).bind(order.reference,order.userId,order.plan,order.amount,'UAH',order.testMode?1:0,now.toISOString(),now.toISOString(),expires.toISOString()).run();}
export async function setPaymentStatus(order:PaymentOrder,status:'paid'|'declined'|'expired',providerFee?:number){
  await ensureDb();
  // Only a pending order may transition to a final state. A repeated callback is idempotent.
  if(status==='paid'){
    const details=planDetails(order.plan),now=new Date(),expiry=new Date(now.getTime()+details.days*864e5).toISOString();
    await env.DB.batch([
      env.DB.prepare(`UPDATE payment_orders SET status='paid',updated_at=? WHERE order_reference=? AND status='pending' AND amount_uah=? AND currency='UAH'`).bind(now.toISOString(),order.order_reference,order.amount_uah),
      env.DB.prepare(`INSERT INTO subscriptions(id,user_id,plan,status,credits,test_mode,created_at,expires_at) SELECT order_reference,user_id,plan,'active',?,?,?,? FROM payment_orders WHERE order_reference=? AND status='paid' AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE id=?)`).bind(details.credits,order.test_mode,now.toISOString(),expiry,order.order_reference,order.order_reference)
    ]);
    return;
  }
  await env.DB.prepare(`UPDATE payment_orders SET status=?,updated_at=? WHERE order_reference=? AND status='pending'`).bind(status,new Date().toISOString(),order.order_reference).run();
  void providerFee;
}
export function purchaseSignature(fields:{merchantAccount:string;merchantDomainName:string;orderReference:string;orderDate:number;amount:number;currency:string;productName:string[];productCount:number[];productPrice:number[]}){
  return sign([fields.merchantAccount,fields.merchantDomainName,fields.orderReference,fields.orderDate,fields.amount,fields.currency,...fields.productName,...fields.productCount,...fields.productPrice].join(';'));
}
export function callbackSignatureFields(data:WayForPayPayload){return [data.merchantAccount,data.orderReference,data.amount,data.currency,data.authCode,data.cardPan,data.transactionStatus,data.reasonCode].map(x=>x===undefined||x===null?'':String(x)).join(';');}
export function ackSignature(reference:string,status:string,time:number){return sign(`${reference};${status};${time}`);}
