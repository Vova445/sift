import {env} from 'cloudflare:workers';
import {requireSupportAdmin,supportSameOrigin} from '../../../../lib/support-admin';
import {writeSupportAudit} from '../../../../lib/support-tools-db';
import {getPaymentOrder,providerAmountMatches,setPaymentStatus,signatureMatches,wayForPayConfig} from '../../../../lib/wayforpay';
import {enforceRateLimit,rateLimitIdentities,rateLimitedResponse} from '../../../../lib/request-rate-limit';

type UserRow={id:string;email:string;created_at:string;verified_at:string|null};
const d1=()=> (env as unknown as {DB:D1Database}).DB;
const db=()=>d1();

export async function GET(req:Request){
  const auth=await requireSupportAdmin(req);if('response'in auth)return auth.response;
  const limited=await enforceRateLimit('support:read',rateLimitIdentities(req,auth.user.id),60);
  if(!limited.allowed)return rateLimitedResponse('Забагато запитів до support tools. Спробуйте пізніше.',limited.retryAfter);
  const url=new URL(req.url),userId=url.searchParams.get('userId')?.slice(0,100)||'',query=(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,100);
  try{
    if(userId){
      const user=await db().prepare(`SELECT u.id,u.email,u.created_at,v.verified_at FROM users u LEFT JOIN email_verification_status v ON v.user_id=u.id WHERE u.id=?`).bind(userId).first<UserRow>();
      if(!user)return Response.json({error:'Користувача не знайдено.'},{status:404});
      const [orders,subscriptionPayments,subscriptions,events,refunds]=await Promise.all([
        db().prepare(`SELECT order_reference,plan,amount_uah,currency,status,test_mode,created_at,updated_at,expires_at FROM payment_orders WHERE user_id=? ORDER BY created_at DESC LIMIT 30`).bind(user.id).all(),
        db().prepare(`SELECT order_reference,amount_uah,status,period_start,period_end,created_at,paid_at FROM subscription_payments WHERE user_id=? ORDER BY created_at DESC LIMIT 30`).bind(user.id).all(),
        db().prepare(`SELECT id,plan,status,credits,test_mode,created_at,expires_at,cancel_at_period_end,recurring_order_reference FROM subscriptions WHERE user_id=? ORDER BY created_at DESC LIMIT 20`).bind(user.id).all(),
        db().prepare(`SELECT event_key,order_reference,event_type,signature_valid,processing_status,attempts,error_message,received_at,updated_at,processed_at,event_data_json FROM billing_events WHERE order_reference IN (SELECT order_reference FROM payment_orders WHERE user_id=?) ORDER BY received_at DESC LIMIT 50`).bind(user.id).all(),
        db().prepare(`SELECT id,order_reference,amount_uah,reason,status,provider_reason_code,created_at,updated_at FROM support_refunds WHERE order_reference IN (SELECT order_reference FROM payment_orders WHERE user_id=?) ORDER BY created_at DESC LIMIT 30`).bind(user.id).all(),
      ]);
      await writeSupportAudit({actorUserId:auth.user.id,action:'view_user',targetUserId:user.id,details:{orders:orders.results.length,events:events.results.length}});
      return Response.json({user,orders:orders.results||[],subscriptionPayments:subscriptionPayments.results||[],subscriptions:subscriptions.results||[],billingEvents:events.results||[],refunds:refunds.results||[]},{headers:{'Cache-Control':'private, no-store'}});
    }
    if(query.length<2){
      const [flags,audit]=await Promise.all([
        db().prepare(`SELECT flag_key,enabled,description,updated_at,updated_by FROM support_feature_flags ORDER BY flag_key`).all(),
        db().prepare(`SELECT a.id,a.actor_user_id,actor.email AS actor_email,a.action,a.target_user_id,target.email AS target_email,a.order_reference,a.details_json,a.created_at FROM support_audit_log a LEFT JOIN users actor ON actor.id=a.actor_user_id LEFT JOIN users target ON target.id=a.target_user_id ORDER BY a.created_at DESC LIMIT 50`).all(),
      ]);
      return Response.json({flags:flags.results||[],audit:audit.results||[]},{headers:{'Cache-Control':'private, no-store'}});
    }
    const escaped=query.replace(/[\\%_]/g,'\\$&');
    const matches=await db().prepare(`SELECT u.id,u.email,u.created_at,v.verified_at FROM users u LEFT JOIN email_verification_status v ON v.user_id=u.id WHERE lower(u.email) LIKE ? ESCAPE '\\' ORDER BY u.created_at DESC LIMIT 20`).bind(`%${escaped}%`).all<UserRow>();
    await writeSupportAudit({actorUserId:auth.user.id,action:'search_users',details:{resultCount:matches.results.length}});
    return Response.json({users:matches.results||[]},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){console.error('[support] GET failed',error instanceof Error?error.message:'unknown');return Response.json({error:'Не вдалося завантажити support-дані.'},{status:503})}
}

export async function POST(req:Request){
  const auth=await requireSupportAdmin(req);if('response'in auth)return auth.response;
  if(!supportSameOrigin(req))return Response.json({error:'Запит має надійти з цього сайту.'},{status:403});
  const limited=await enforceRateLimit('support:write',rateLimitIdentities(req,auth.user.id),12);
  if(!limited.allowed)return rateLimitedResponse('Забагато дій у support tools. Спробуйте пізніше.',limited.retryAfter);
  const raw=await req.text();if(raw.length>8192)return Response.json({error:'Запит завеликий.'},{status:413});
  let body:Record<string,unknown>;try{body=JSON.parse(raw) as Record<string,unknown>}catch{return Response.json({error:'Некоректний JSON.'},{status:400})}
  if(body.action==='set_flag'){
    const key=body.key,enabled=body.enabled,reason=typeof body.reason==='string'?body.reason.trim().slice(0,300):'';
    if((key!=='ai_translation'&&key!=='email_reminders'&&key!=='tos_monitoring'&&key!=='subscription_radar'&&key!=='dark_pattern_detector')||typeof enabled!=='boolean'||reason.length<4)return Response.json({error:'Оберіть відомий прапорець і вкажіть причину зміни.'},{status:400});
    const result=await db().prepare(`UPDATE support_feature_flags SET enabled=?,updated_at=?,updated_by=? WHERE flag_key=?`).bind(enabled?1:0,new Date().toISOString(),auth.user.id,key).run();
    if(!(result.meta?.changes||0))return Response.json({error:'Прапорець не знайдено.'},{status:404});
    await writeSupportAudit({actorUserId:auth.user.id,action:'set_feature_flag',details:{key,enabled,reason}});
    return Response.json({ok:true,key,enabled});
  }
  if(body.action==='reconcile_pro'){
    const reference=typeof body.orderReference==='string'?body.orderReference.trim():'';
    if(!/^sift_[a-f\d]{32}$/i.test(reference))return Response.json({error:'Некоректний номер замовлення.'},{status:400});
    const order=await getPaymentOrder(reference);
    if(!order||order.plan!=='pro'||order.test_mode!==0)return Response.json({error:'Знайдіть реальне замовлення Sift Pro.'},{status:404});
    const config=wayForPayConfig();if(!config.merchantAccount||!config.secret)return Response.json({error:'WayForPay не налаштовано на сервері.'},{status:503});
    let status:Record<string,unknown>;
    try{
      const response=await fetch('https://api.wayforpay.com/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({transactionType:'CHECK_STATUS',merchantAccount:config.merchantAccount,orderReference:reference,merchantSignature:(await import('node:crypto')).createHmac('md5',config.secret).update(`${config.merchantAccount};${reference}`).digest('hex'),apiVersion:1})});
      if(!response.ok)throw new Error('provider unavailable');status=await response.json() as Record<string,unknown>;
    }catch{return Response.json({error:'WayForPay зараз недоступний. Стан акаунта не змінено.'},{status:503})}
    const signed=[status.merchantAccount,status.orderReference,status.amount,status.currency,status.authCode,status.cardPan,status.transactionStatus,status.reasonCode].map(v=>v===undefined||v===null?'':String(v)).join(';');
    const valid=status.merchantAccount===config.merchantAccount&&status.orderReference===reference&&providerAmountMatches(order,status.amount,status.currency)&&signatureMatches(signed,status.merchantSignature);
    if(!valid){await writeSupportAudit({actorUserId:auth.user.id,action:'reconcile_rejected',targetUserId:order.user_id,orderReference:reference,details:{reason:'provider_response_validation_failed'}});return Response.json({error:'WayForPay повернув непідтверджений або невідповідний платіж.'},{status:502})}
    if(status.transactionStatus!=='Approved'){
      await writeSupportAudit({actorUserId:auth.user.id,action:'reconcile_not_paid',targetUserId:order.user_id,orderReference:reference,details:{providerStatus:String(status.transactionStatus||'unknown')}});
      return Response.json({error:`WayForPay підтвердив статус «${String(status.transactionStatus||'невідомий')}». Pro не змінено.`},{status:409});
    }
    await setPaymentStatus(order,'paid');
    const sub=await db().prepare(`SELECT status,expires_at FROM subscriptions WHERE id=? AND user_id=? AND plan='pro'`).bind(reference,order.user_id).first<{status:string;expires_at:string}>();
    await writeSupportAudit({actorUserId:auth.user.id,action:'reconcile_pro',targetUserId:order.user_id,orderReference:reference,details:{providerStatus:'Approved',subscriptionCreated:Boolean(sub)}});
    if(!sub||!['active','trialing'].includes(sub.status)||Date.parse(sub.expires_at)<=Date.now())return Response.json({error:'Оплата підтверджена, але підписка не стала активною. Перевірте стан вручну.',confirmedPaid:true},{status:409});
    return Response.json({ok:true,message:'Оплату підтверджено у WayForPay, доступ Sift Pro синхронізовано.',subscription:sub});
  }
  return Response.json({error:'Невідома дія.'},{status:400});
}
