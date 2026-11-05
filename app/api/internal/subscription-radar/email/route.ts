import {env} from 'cloudflare:workers';
import {processSubscriptionRadarEmail} from '../../../../../lib/subscription-radar';

export async function POST(req:Request){
  const secret=(env as unknown as Record<string,string|undefined>).DUNNING_CRON_SECRET||'';
  if(!secret||(req.headers.get('authorization')||'')!==`Bearer ${secret}`)return Response.json({error:'Not found'},{status:404});
  const recipient=req.headers.get('x-radar-recipient')||'',authenticationResults=req.headers.get('x-radar-auth-results')||'';
  if(!req.body||!recipient)return Response.json({error:'Некоректний email event.'},{status:400});
  const contentLength=Number(req.headers.get('content-length')||0);if(contentLength>1_048_576)return Response.json({error:'Лист завеликий.'},{status:413});
  try{
    const result=await processSubscriptionRadarEmail({raw:req.body,recipient,authenticationResults});
    if(result.retryable)return Response.json({error:'Тимчасова помилка обробки листа.'},{status:503});
    if(result.status==='rejected')return Response.json({error:'Лист не пройшов перевірку отримувача або відправника.',reason:result.reason},{status:422});
    return Response.json({status:result.status,duplicate:result.duplicate===true},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Не вдалося обробити лист. Спробуйте переслати його ще раз.'},{status:503})}
}
