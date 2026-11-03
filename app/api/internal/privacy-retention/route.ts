import {env} from 'cloudflare:workers';

const GUEST_REPORT_RETENTION_DAYS=90;

export async function POST(req:Request){
  const secret=(env as unknown as Record<string,string|undefined>).DUNNING_CRON_SECRET||'';
  if(!secret||(req.headers.get('authorization')||'')!==`Bearer ${secret}`)return Response.json({error:'Not found'},{status:404});
  const cutoff=new Date(Date.now()-GUEST_REPORT_RETENTION_DAYS*24*60*60*1000).toISOString();
  try{
    const [result,analytics,staleCheckoutLinks]=await Promise.all([
      env.DB.prepare(`DELETE FROM scans WHERE user_id IS NULL AND created_at<?`).bind(cutoff).run(),
      env.DB.prepare(`DELETE FROM analytics_events WHERE created_at<?`).bind(cutoff).run(),
      env.DB.prepare(`UPDATE payment_orders SET analytics_session_hash=NULL WHERE analytics_session_hash IS NOT NULL AND (status!='pending' OR expires_at<=?)`).bind(new Date().toISOString()).run(),
    ]);
    return Response.json({deleted:result.meta?.changes||0,analyticsDeleted:analytics.meta?.changes||0,staleCheckoutLinksCleared:staleCheckoutLinks.meta?.changes||0,retentionDays:GUEST_REPORT_RETENTION_DAYS});
  }catch{return Response.json({error:'Guest report retention sweep failed.'},{status:503})}
}
