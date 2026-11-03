import {ensureFunnelAnalyticsDb,recordFunnelEvent} from '../../../../lib/funnel-analytics';
import {enforceRateLimit,rateLimitIdentities,rateLimitedResponse} from '../../../../lib/request-rate-limit';

const ANALYTICS_REQUESTS_PER_MINUTE=60;

export async function POST(req:Request){
  if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Запит відхилено.'},{status:403});
  const length=Number(req.headers.get('content-length')||0);if(length>2048)return Response.json({error:'Запит завеликий.'},{status:413});
  try{const limit=await enforceRateLimit('analytics:event',rateLimitIdentities(req),ANALYTICS_REQUESTS_PER_MINUTE);if(!limit.allowed)return rateLimitedResponse('Забагато запитів аналітики.',limit.retryAfter)}catch{return Response.json({error:'Аналітика тимчасово недоступна.'},{status:503})}
  try{
    const raw=await req.text();if(raw.length>2048)return Response.json({error:'Запит завеликий.'},{status:413});
    const body=JSON.parse(raw) as {stage?:unknown;sessionId?:unknown};
    if(body.stage!=='visit'&&body.stage!=='paywall')return Response.json({error:'Невідома подія.'},{status:400});
    if(typeof body.sessionId!=='string'||body.sessionId.length>64)return Response.json({error:'Некоректний ідентифікатор сесії.'},{status:400});
    await ensureFunnelAnalyticsDb();
    const accepted=await recordFunnelEvent(body.sessionId,body.stage);
    if(!accepted)return Response.json({error:'Некоректний ідентифікатор сесії.'},{status:400});
    return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Не вдалося записати подію.'},{status:503})}
}
