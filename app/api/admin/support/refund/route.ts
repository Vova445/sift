import {env} from 'cloudflare:workers';
import {requireSupportAdmin,supportSameOrigin} from '../../../../../lib/support-admin';
import {writeSupportAudit} from '../../../../../lib/support-tools-db';
import {cancelRecurring,getPaymentOrder,sign,signatureMatches,wayForPayConfig} from '../../../../../lib/wayforpay';
import {enforceRateLimit,rateLimitIdentities,rateLimitedResponse} from '../../../../../lib/request-rate-limit';

const d1=()=> (env as unknown as {DB:D1Database}).DB;

export async function POST(req:Request){
  const auth=await requireSupportAdmin(req);if('response'in auth)return auth.response;
  if(!supportSameOrigin(req))return Response.json({error:'Запит має надійти з цього сайту.'},{status:403});
  const limited=await enforceRateLimit('support:refund',rateLimitIdentities(req,auth.user.id),3);
  if(!limited.allowed)return rateLimitedResponse('Забагато спроб повернення. Спробуйте пізніше.',limited.retryAfter);
  const raw=await req.text();if(raw.length>4096)return Response.json({error:'Запит завеликий.'},{status:413});
  let body:{orderReference?:unknown;reason?:unknown;confirmation?:unknown};try{body=JSON.parse(raw) as typeof body}catch{return Response.json({error:'Некоректний JSON.'},{status:400})}
  const reference=typeof body.orderReference==='string'?body.orderReference.trim():'';
  const reason=typeof body.reason==='string'?body.reason.trim().replace(/[\r\n\t]+/g,' ').slice(0,250):'';
  if(!/^sift_[a-f\d]{32}$/i.test(reference)||body.confirmation!=='ПОВЕРНУТИ'||reason.length<8)return Response.json({error:'Вкажіть замовлення, причину повернення та підтвердження «ПОВЕРНУТИ».'},{status:400});
  const order=await getPaymentOrder(reference);
  if(!order||order.status!=='paid'||order.test_mode!==0)return Response.json({error:'Повернення доступне лише для успішної реальної оплати.'},{status:409});
  const config=wayForPayConfig();if(!config.merchantAccount||!config.secret)return Response.json({error:'WayForPay не налаштовано на сервері.'},{status:503});
  const now=new Date().toISOString(),id=crypto.randomUUID();
  try{
    await d1().prepare(`INSERT INTO support_refunds(id,order_reference,actor_user_id,amount_uah,reason,status,created_at,updated_at) VALUES(?,?,?,?,?,'processing',?,?)`).bind(id,reference,auth.user.id,order.amount_uah,reason,now,now).run();
  }catch{
    return Response.json({error:'Для цього платежу вже є повернення або запит, що очікує перевірки. Перегляньте журнал перед повторною дією.'},{status:409});
  }
  await writeSupportAudit({actorUserId:auth.user.id,action:'refund_started',targetUserId:order.user_id,orderReference:reference,details:{amountUah:order.amount_uah,reason}});
  try{
    if(order.plan==='pro'){
      const sub=await d1().prepare(`SELECT id,recurring_order_reference,cancel_at_period_end FROM subscriptions WHERE user_id=? AND plan='pro' AND (id=? OR recurring_order_reference=?) AND status IN ('trialing','active','past_due') ORDER BY created_at DESC LIMIT 1`).bind(order.user_id,reference,reference).first<{id:string;recurring_order_reference:string|null;cancel_at_period_end:number}>();
      if(sub?.recurring_order_reference&&!sub.cancel_at_period_end)await cancelRecurring(sub.recurring_order_reference);
    }
  }catch(error){
    await d1().prepare(`UPDATE support_refunds SET status='failed',provider_reason_code='recurring_cancel_failed',updated_at=? WHERE id=?`).bind(new Date().toISOString(),id).run();
    await writeSupportAudit({actorUserId:auth.user.id,action:'refund_failed',targetUserId:order.user_id,orderReference:reference,details:{reason:'recurring_cancel_failed'}});
    return Response.json({error:error instanceof Error?error.message:'Не вдалося зупинити автопродовження; повернення не надіслано.'},{status:503});
  }
  const signature=sign(`${config.merchantAccount};${reference};${order.amount_uah};UAH`,config.secret);
  let response:Response;
  try{
    response=await fetch('https://api.wayforpay.com/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({transactionType:'REFUND',merchantAccount:config.merchantAccount,orderReference:reference,amount:order.amount_uah,currency:'UAH',comment:`Sift support: ${reason}`,merchantSignature:signature,apiVersion:1})});
    if(!response.ok)throw new Error('WayForPay HTTP error');
  }catch{
    await d1().prepare(`UPDATE support_refunds SET status='pending',provider_reason_code='provider_unavailable',updated_at=? WHERE id=?`).bind(new Date().toISOString(),id).run();
    await writeSupportAudit({actorUserId:auth.user.id,action:'refund_pending',targetUserId:order.user_id,orderReference:reference,details:{reason:'provider_unavailable'}});
    return Response.json({error:'WayForPay не підтвердив результат запиту. Статус залишено «очікує перевірки»; повторне повернення заблоковано, щоб уникнути подвійного списання.'},{status:202});
  }
  let result:Record<string,unknown>;
  try{result=await response.json() as Record<string,unknown>}catch{result={}}
  const refundSignature=[result.merchantAccount,result.orderReference,result.transactionStatus,result.reasonCode].map(value=>value===undefined||value===null?'':String(value)).join(';');
  const valid=result.merchantAccount===config.merchantAccount&&result.orderReference===reference&&typeof result.transactionStatus==='string'&&signatureMatches(refundSignature,result.merchantSignature);
  if(!valid){
    await d1().prepare(`UPDATE support_refunds SET status='pending',provider_reason_code='invalid_provider_response',updated_at=? WHERE id=?`).bind(new Date().toISOString(),id).run();
    await writeSupportAudit({actorUserId:auth.user.id,action:'refund_pending',targetUserId:order.user_id,orderReference:reference,details:{reason:'invalid_provider_response'}});
    return Response.json({error:'Відповідь WayForPay не пройшла перевірку підпису. Запит зафіксовано для ручної звірки, повтор заблоковано.'},{status:202});
  }
  const providerStatus=String(result.transactionStatus).toLowerCase(),reasonCode=String(result.reasonCode??'').slice(0,40),updatedAt=new Date().toISOString();
  if(providerStatus==='refunded'||providerStatus==='voided'){
    await d1().batch([
      d1().prepare(`UPDATE support_refunds SET status='refunded',provider_reason_code=?,updated_at=? WHERE id=?`).bind(reasonCode,updatedAt,id),
      d1().prepare(`UPDATE payment_orders SET status='refunded',updated_at=? WHERE order_reference=? AND status='paid'`).bind(updatedAt,reference),
      d1().prepare(`UPDATE subscriptions SET status='expired',credits=0,cancel_at_period_end=1,canceled_at=COALESCE(canceled_at,?),expires_at=?,updated_at=? WHERE user_id=? AND ((plan='one' AND id=?) OR (plan='pro' AND (id=? OR recurring_order_reference=?)))`).bind(updatedAt,updatedAt,updatedAt,order.user_id,reference,reference,reference),
    ]);
    await writeSupportAudit({actorUserId:auth.user.id,action:'refund_completed',targetUserId:order.user_id,orderReference:reference,details:{amountUah:order.amount_uah,providerStatus,reasonCode}});
    return Response.json({ok:true,status:'refunded',amountUah:order.amount_uah,message:'WayForPay підтвердив повернення. Доступ, пов’язаний із цим платежем, відкликано.'});
  }
  if(providerStatus==='declined'){
    await d1().prepare(`UPDATE support_refunds SET status='declined',provider_reason_code=?,updated_at=? WHERE id=?`).bind(reasonCode,updatedAt,id).run();
    await writeSupportAudit({actorUserId:auth.user.id,action:'refund_declined',targetUserId:order.user_id,orderReference:reference,details:{reasonCode}});
    return Response.json({error:`WayForPay відхилив повернення (${reasonCode||String(result.reason||'невідома причина')}).`},{status:409});
  }
  await d1().prepare(`UPDATE support_refunds SET status='pending',provider_reason_code=?,updated_at=? WHERE id=?`).bind(reasonCode||providerStatus,updatedAt,id).run();
  await writeSupportAudit({actorUserId:auth.user.id,action:'refund_pending',targetUserId:order.user_id,orderReference:reference,details:{providerStatus,reasonCode}});
  return Response.json({error:`WayForPay повернув статус «${providerStatus}». Результат потребує звірки; повторне повернення заблоковано.`},{status:202});
}
