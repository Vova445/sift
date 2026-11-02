import {env} from 'cloudflare:workers';
import {processBillingDunning} from '../../../../lib/billing-dunning';

export async function POST(req:Request){
  const secret=(env as unknown as Record<string,string|undefined>).DUNNING_CRON_SECRET||'',provided=req.headers.get('authorization')||'';
  if(!secret||provided!==`Bearer ${secret}`)return Response.json({error:'Not found'},{status:404});
  try{const result=await processBillingDunning();return Response.json(result,{status:result.email==='not_configured'?503:200})}
  catch{return Response.json({error:'Dunning sweep failed. Inspect the Worker log; the next hourly run will try again.'},{status:503})}
}
