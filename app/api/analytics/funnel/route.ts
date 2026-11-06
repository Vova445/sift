import {env} from 'cloudflare:workers';
import {requireSupportAdmin} from '../../../../lib/support-admin';
import {ANALYTICS_MIN_DAYS,ANALYTICS_MIN_SAMPLE,isAnalyticsMature} from '../../../../lib/analytics-statistics.js';
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
        MIN(CASE WHEN stage='pay' THEN created_at END) AS pay_at,
        MIN(CASE WHEN stage='visit' THEN created_at END) AS first_visit_at
      FROM analytics_events WHERE created_at>=? GROUP BY session_hash
    )
    SELECT
      SUM(CASE WHEN visit_at IS NOT NULL THEN 1 ELSE 0 END) AS visits,
      SUM(CASE WHEN visit_at IS NOT NULL AND analyze_at>=visit_at THEN 1 ELSE 0 END) AS analyzes,
      SUM(CASE WHEN visit_at IS NOT NULL AND analyze_at>=visit_at AND signup_at>=analyze_at THEN 1 ELSE 0 END) AS signups,
      SUM(CASE WHEN visit_at IS NOT NULL AND analyze_at>=visit_at AND signup_at>=analyze_at AND paywall_at>=signup_at THEN 1 ELSE 0 END) AS paywalls,
      SUM(CASE WHEN visit_at IS NOT NULL AND analyze_at>=visit_at AND signup_at>=analyze_at AND paywall_at>=signup_at AND pay_at>=paywall_at THEN 1 ELSE 0 END) AS pays,
      MIN(first_visit_at) AS first_visit_at
    FROM stages`).bind(since).first<{visits:number|null;analyzes:number|null;signups:number|null;paywalls:number|null;pays:number|null;first_visit_at:string|null}>();
    const funnel={visit:counts?.visits||0,analyze:counts?.analyzes||0,signup:counts?.signups||0,paywall:counts?.paywalls||0,pay:counts?.pays||0};
    const firstVisitAt=counts?.first_visit_at||null;
    const observedDays=firstVisitAt?Math.min(30,Math.max(1,Math.floor((Date.now()-Date.parse(firstVisitAt))/86_400_000)+1)):0;
    const maturity=(observations:number)=>({mature:isAnalyticsMature({observations,observedDays}),observations,minimumObservations:ANALYTICS_MIN_SAMPLE,observedDays,minimumDays:ANALYTICS_MIN_DAYS});
    const metrics={visit:maturity(funnel.visit),analyze:maturity(funnel.visit),signup:maturity(funnel.analyze),paywall:maturity(funnel.signup),pay:maturity(funnel.paywall)};
    return Response.json({funnel,metrics,maturity:maturity(funnel.visit),periodDays:30,generatedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return Response.json({error:'Не вдалося завантажити аналітику.'},{status:503})}
}
