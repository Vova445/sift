import {env} from 'cloudflare:workers';
import {ensureDb} from './db';
import {syncWayForPaySubscription} from './wayforpay-recurring';

const HOUR=60*60*1000;

export async function processBillingDunning(){
  await ensureDb();
  const now=new Date(),nowIso=now.toISOString();
  const deletedRefsPurged=await env.DB.prepare(`DELETE FROM deleted_billing_refs WHERE expires_at<=?`).bind(nowIso).run();
  const subscriptions=await env.DB.prepare(`SELECT user_id FROM subscriptions WHERE plan='pro' AND status IN ('active','trialing','past_due') AND recurring_order_reference IS NOT NULL AND cancel_at_period_end=0 ORDER BY user_id`).all<{user_id:string}>();
  for(const row of subscriptions.results||[])await syncWayForPaySubscription(row.user_id);

  const expired=await env.DB.prepare(`UPDATE subscriptions SET status='expired',updated_at=? WHERE plan='pro' AND status='past_due' AND grace_until IS NOT NULL AND grace_until<=?`).bind(nowIso,nowIso).run();

  const cfg=env as unknown as Record<string,string|undefined>,apiKey=cfg.RESEND_API_KEY||'',from=cfg.DUNNING_FROM_EMAIL||'';
  if(!apiKey||!from)return {expired:expired.meta?.changes||0,deletedRefsPurged:deletedRefsPurged.meta?.changes||0,email:'not_configured'};

  const due=await env.DB.prepare(`SELECT s.id,s.user_id,s.grace_until,u.email FROM subscriptions s JOIN users u ON u.id=s.user_id WHERE s.plan='pro' AND s.status='past_due' AND s.cancel_at_period_end=0 AND s.grace_until>? AND s.dunning_email_sent_at IS NULL AND s.dunning_email_attempts<8 AND (s.dunning_email_last_attempt_at IS NULL OR s.dunning_email_last_attempt_at<?) ORDER BY s.grace_until LIMIT 100`).bind(nowIso,new Date(now.getTime()-HOUR).toISOString()).all<{id:string;user_id:string;grace_until:string;email:string}>();
  let sent=0,failed=0;
  for(const row of due.results||[]){
    const attemptAt=new Date().toISOString(),claim=await env.DB.prepare(`UPDATE subscriptions SET dunning_email_attempts=dunning_email_attempts+1,dunning_email_last_attempt_at=?,dunning_email_error=NULL WHERE id=? AND status='past_due' AND grace_until>? AND dunning_email_sent_at IS NULL AND dunning_email_attempts<8 AND (dunning_email_last_attempt_at IS NULL OR dunning_email_last_attempt_at<?)`).bind(attemptAt,row.id,attemptAt,new Date(Date.parse(attemptAt)-HOUR).toISOString()).run();
    if(!(claim.meta?.changes||0))continue;
    const deadline=new Date(row.grace_until).toLocaleString('uk-UA',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Kyiv'}),subject='Потрібно оновити оплату Sift Pro',html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#11150f"><p style="font-size:12px;letter-spacing:2px;font-weight:bold">SIFT · ОПЛАТА</p><h1 style="font-size:26px">Не вдалося списати оплату за Sift Pro</h1><p>Ми не отримали оплату за підписку. Щоб зберегти Pro, оновіть картку в особистому кабінеті WayForPay.</p><p>Ваш Pro залишиться доступним до <strong>${deadline}</strong>. Після цього акаунт автоматично перейде на безкоштовний план. Звіти та історія залишаться у вашому акаунті.</p><p><a href="https://m.wayforpay.com/account/site/login?language=uk&to=personal" style="display:inline-block;background:#b7f55f;color:#11150f;text-decoration:none;padding:14px 18px;border-radius:8px;font-weight:bold">Оновити спосіб оплати</a></p><p style="font-size:12px;color:#697168">Увійдіть у WayForPay за номером телефону та кодом із SMS.</p></div>`;
    try{
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`sift-dunning-${row.id}-${Date.parse(row.grace_until)}`},body:JSON.stringify({from,to:[row.email],subject,html})});
      if(!response.ok){const body=await response.text();throw new Error(`Resend HTTP ${response.status}: ${body.slice(0,220)}`)}
      await env.DB.prepare(`UPDATE subscriptions SET dunning_email_sent_at=?,dunning_email_error=NULL WHERE id=? AND dunning_email_sent_at IS NULL`).bind(new Date().toISOString(),row.id).run();sent++;
    }catch(error){await env.DB.prepare(`UPDATE subscriptions SET dunning_email_error=? WHERE id=? AND dunning_email_sent_at IS NULL`).bind(error instanceof Error?error.message.slice(0,300):'Email delivery failed',row.id).run();failed++}
  }
  return {expired:expired.meta?.changes||0,deletedRefsPurged:deletedRefsPurged.meta?.changes||0,sent,failed};
}
