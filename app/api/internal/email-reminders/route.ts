import {env} from 'cloudflare:workers';
import {processEmailReminders} from '../../../../lib/email-reminders';

export async function POST(req:Request){
  const secret=(env as unknown as Record<string,string|undefined>).DUNNING_CRON_SECRET||'';
  if(!secret||(req.headers.get('authorization')||'')!==`Bearer ${secret}`)return Response.json({error:'Not found'},{status:404});
  try{
    const result=await processEmailReminders();
    return Response.json(result,{status:result.email==='not_configured'||result.failed>0||('exhausted' in result&&result.exhausted>0)?503:200});
  }catch{return Response.json({error:'Email reminder sweep failed. Inspect the Worker log; the next hourly run will retry.'},{status:503})}
}
