import {env} from 'cloudflare:workers';
import {featureFlagEnabled} from '../../../../lib/support-tools-db';
import {processSubscriptionRadarReminders} from '../../../../lib/subscription-radar';

export async function POST(req:Request){
  const secret=(env as unknown as Record<string,string|undefined>).DUNNING_CRON_SECRET||'';
  if(!secret||(req.headers.get('authorization')||'')!==`Bearer ${secret}`)return Response.json({error:'Not found'},{status:404});
  if(!await featureFlagEnabled('subscription_radar'))return Response.json({due:0,sent:0,failed:0,skipped:0,email:'feature_disabled'});
  try{
    const result=await processSubscriptionRadarReminders();
    return Response.json(result,{status:result.email==='not_configured'||result.failed>0||('exhausted'in result&&(result.exhausted||0)>0)?503:200});
  }catch{return Response.json({error:'Subscription Radar reminder sweep failed. Inspect the Worker log; the next hourly run will retry.'},{status:503})}
}
