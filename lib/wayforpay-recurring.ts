import {env} from 'cloudflare:workers';
import {addCalendarMonth,gracePeriodEnd} from './subscription-lifecycle';

type Subscription={id:string;user_id:string;status:string;expires_at:string;recurring_order_reference:string|null;last_payment_at:string|null;last_provider_sync_at:string|null;cancel_at_period_end:number};

export async function syncWayForPaySubscription(userId:string){
  const vars=env as unknown as Record<string,string|undefined>,account=vars.WAYFORPAY_MERCHANT_ACCOUNT||'',password=vars.WAYFORPAY_MERCHANT_PASSWORD||'';
  if(!account||!password)return;
  const now=new Date(),row=await env.DB.prepare(`SELECT id,user_id,status,expires_at,recurring_order_reference,last_payment_at,last_provider_sync_at,cancel_at_period_end FROM subscriptions WHERE user_id=? AND plan='pro' ORDER BY created_at DESC LIMIT 1`).bind(userId).first<Subscription>();
  if(!row?.recurring_order_reference||row.cancel_at_period_end||row.status==='canceled')return;
  if(row.last_provider_sync_at&&now.getTime()-Date.parse(row.last_provider_sync_at)<10*60*1000)return;
  try{
    const response=await fetch('https://api.wayforpay.com/regularApi',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestType:'STATUS',merchantAccount:account,merchantPassword:password,orderReference:row.recurring_order_reference})});
    if(!response.ok)return;
    const data=await response.json() as {reasonCode?:number|string;orderReference?:string;lastPayedDate?:number|string|null;lastPayedStatus?:string|null};
    if(Number(data.reasonCode)!==4100||data.orderReference!==row.recurring_order_reference)return;
    const syncedAt=now.toISOString(),raw=data.lastPayedDate;
    if(raw!==null&&raw!==undefined&&raw!==''){
      const ms=typeof raw==='number'?raw*1000:Date.parse(raw),paidAt=new Date(ms);
      if(Number.isFinite(ms)&&(!row.last_payment_at||paidAt.getTime()>Date.parse(row.last_payment_at))){
        const success=(data.lastPayedStatus||'').toLowerCase()==='approved';
        if(success){
          const periodStart=new Date(Math.max(Date.parse(row.expires_at),paidAt.getTime())),periodEnd=addCalendarMonth(periodStart),ledgerRef=`w4p_${row.id}_${paidAt.getTime()}`;
          const insert=await env.DB.prepare(`INSERT OR IGNORE INTO subscription_payments(order_reference,subscription_id,user_id,amount_uah,status,period_start,period_end,created_at,paid_at) VALUES(?,?,?,279,'paid',?,?,?,?)`).bind(ledgerRef,row.id,userId,periodStart.toISOString(),periodEnd.toISOString(),syncedAt,paidAt.toISOString()).run();
          if((insert.meta?.changes||0)>0)await env.DB.prepare(`UPDATE subscriptions SET status='active',expires_at=?,last_payment_at=?,last_provider_sync_at=?,updated_at=?,past_due_at=NULL,grace_until=NULL,dunning_email_sent_at=NULL,dunning_email_attempts=0,dunning_email_last_attempt_at=NULL,dunning_email_error=NULL WHERE id=? AND status IN ('trialing','active','past_due','expired')`).bind(periodEnd.toISOString(),paidAt.toISOString(),syncedAt,syncedAt,row.id).run();
        }else{
          const ledgerRef=`w4p_${row.id}_${paidAt.getTime()}`;
          await env.DB.prepare(`INSERT OR IGNORE INTO subscription_payments(order_reference,subscription_id,user_id,amount_uah,status,created_at,paid_at) VALUES(?,?,?,279,'declined',?,?)`).bind(ledgerRef,row.id,userId,syncedAt,paidAt.toISOString()).run();
          const graceStart=new Date(Math.max(now.getTime(),Date.parse(row.expires_at))),graceUntil=gracePeriodEnd(graceStart.toISOString(),row.expires_at).toISOString();
          await env.DB.prepare(`UPDATE subscriptions SET status='past_due',last_payment_at=?,last_provider_sync_at=?,updated_at=?,past_due_at=COALESCE(past_due_at,?),grace_until=COALESCE(grace_until,?) WHERE id=? AND status IN ('trialing','active','past_due')`).bind(paidAt.toISOString(),syncedAt,syncedAt,graceStart.toISOString(),graceUntil,row.id).run();
        }
      }else await env.DB.prepare(`UPDATE subscriptions SET last_provider_sync_at=? WHERE id=?`).bind(syncedAt,row.id).run();
    }else await env.DB.prepare(`UPDATE subscriptions SET last_provider_sync_at=? WHERE id=?`).bind(syncedAt,row.id).run();
  }catch{/* Provider outages leave the last confirmed entitlement state intact. */}
}
