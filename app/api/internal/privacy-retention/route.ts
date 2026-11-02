import {env} from 'cloudflare:workers';

const GUEST_REPORT_RETENTION_DAYS=90;

export async function POST(req:Request){
  const secret=(env as unknown as Record<string,string|undefined>).DUNNING_CRON_SECRET||'';
  if(!secret||(req.headers.get('authorization')||'')!==`Bearer ${secret}`)return Response.json({error:'Not found'},{status:404});
  const cutoff=new Date(Date.now()-GUEST_REPORT_RETENTION_DAYS*24*60*60*1000).toISOString();
  try{
    const result=await env.DB.prepare(`DELETE FROM scans WHERE user_id IS NULL AND created_at<?`).bind(cutoff).run();
    return Response.json({deleted:result.meta?.changes||0,retentionDays:GUEST_REPORT_RETENTION_DAYS});
  }catch{return Response.json({error:'Guest report retention sweep failed.'},{status:503})}
}
