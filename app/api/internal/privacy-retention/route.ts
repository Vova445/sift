import {env} from 'cloudflare:workers';
import {ensureDomainIndexDb} from '../../../../lib/domain-index';
import {deleteExpiredAchievementExperimentAssignments} from '../../../../lib/achievement-experiments';

const GUEST_REPORT_RETENTION_DAYS=90;

export async function POST(req:Request){
  const secret=(env as unknown as Record<string,string|undefined>).DUNNING_CRON_SECRET||'';
  if(!secret||(req.headers.get('authorization')||'')!==`Bearer ${secret}`)return Response.json({error:'Not found'},{status:404});
  const cutoff=new Date(Date.now()-GUEST_REPORT_RETENTION_DAYS*24*60*60*1000).toISOString();
  try{
    await ensureDomainIndexDb();
    const [result,analytics,staleCheckoutLinks,domainCorrections,experimentAssignments]=await Promise.all([
      env.DB.prepare(`DELETE FROM scans WHERE user_id IS NULL AND created_at<?`).bind(cutoff).run(),
      env.DB.prepare(`DELETE FROM analytics_events WHERE created_at<?`).bind(cutoff).run(),
      env.DB.prepare(`UPDATE payment_orders SET analytics_session_hash=NULL WHERE analytics_session_hash IS NOT NULL AND (status!='pending' OR expires_at<=?)`).bind(new Date().toISOString()).run(),
      env.DB.prepare(`DELETE FROM domain_correction_requests WHERE expires_at<=?`).bind(new Date().toISOString()).run(),
      deleteExpiredAchievementExperimentAssignments(),
    ]);
    const domainObservations=await env.DB.prepare(`DELETE FROM domain_index_observations WHERE last_seen_at<?`).bind(new Date(Date.now()-365*24*60*60*1000).toISOString()).run();
    return Response.json({deleted:result.meta?.changes||0,analyticsDeleted:analytics.meta?.changes||0,staleCheckoutLinksCleared:staleCheckoutLinks.meta?.changes||0,domainCorrectionsDeleted:domainCorrections.meta?.changes||0,domainObservationsDeleted:domainObservations.meta?.changes||0,experimentAssignmentsDeleted:experimentAssignments,retentionDays:GUEST_REPORT_RETENTION_DAYS,experimentAssignmentRetentionDays:90,domainCorrectionRetentionDays:180,domainObservationRetentionDays:365});
  }catch{return Response.json({error:'Guest report retention sweep failed.'},{status:503})}
}
