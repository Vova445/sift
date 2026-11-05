import {env} from 'cloudflare:workers';
import {requireSupportAdmin} from '../../../../lib/support-admin';
import {ensureFunnelAnalyticsDb} from '../../../../lib/funnel-analytics';

export async function GET(req:Request){
  const auth=await requireSupportAdmin(req);
  if('response'in auth)return auth.response;
  try{
    await ensureFunnelAnalyticsDb();
    const since=new Date(Date.now()-30*864e5).toISOString();
    const counts=await env.DB.prepare(`WITH stages AS (
      SELECT session_hash,
        MIN(CASE WHEN stage='visit' THEN created_at END) AS visit_at,
        MIN(CASE WHEN stage='analyze' THEN created_at END) AS analyze_at,
        MIN(CASE WHEN stage='signup' THEN created_at END) AS signup_at,
        MIN(CASE WHEN stage='paywall' THEN created_at END) AS paywall_at,
        MIN(CASE WHEN stage='pay' THEN created_at END) AS pay_at
      FROM analytics_events WHERE created_at>=? GROUP BY session_hash
    )
    SELECT
      SUM(CASE WHEN visit_at IS NOT NULL THEN 1 ELSE 0 END) AS visits,
      SUM(CASE WHEN visit_at IS NOT NULL AND analyze_at>=visit_at THEN 1 ELSE 0 END) AS analyzes,
      SUM(CASE WHEN visit_at IS NOT NULL AND analyze_at>=visit_at AND signup_at>=analyze_at THEN 1 ELSE 0 END) AS signups,
      SUM(CASE WHEN visit_at IS NOT NULL AND analyze_at>=visit_at AND signup_at>=analyze_at AND paywall_at>=signup_at THEN 1 ELSE 0 END) AS paywalls,
      SUM(CASE WHEN visit_at IS NOT NULL AND analyze_at>=visit_at AND signup_at>=analyze_at AND paywall_at>=signup_at AND pay_at>=paywall_at THEN 1 ELSE 0 END) AS pays
    FROM stages`).bind(since).first<{visits:number|null;analyzes:number|null;signups:number|null;paywalls:number|null;pays:number|null}>();
    const funnel={visit:counts?.visits||0,analyze:counts?.analyzes||0,signup:counts?.signups||0,paywall:counts?.paywalls||0,pay:counts?.pays||0};
    return Response.json({funnel,periodDays:30,generatedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return Response.json({error:'Не вдалося завантажити аналітику.'},{status:503})}
}
