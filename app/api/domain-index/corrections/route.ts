import {submitDomainCorrection} from '../../../../lib/domain-index';
import {enforceRateLimit,rateLimitIdentities,rateLimitedResponse} from '../../../../lib/request-rate-limit';

const noStore={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function sameOrigin(req:Request){const origin=req.headers.get('origin');if(!origin)return false;try{return new URL(origin).origin===new URL(req.url).origin}catch{return false}}

export async function POST(req:Request){
  if(!sameOrigin(req))return Response.json({error:'Запит має надійти з цього сайту.'},{status:403,headers:noStore});
  const limited=await enforceRateLimit('domain-index-correction',rateLimitIdentities(req),5);
  if(!limited.allowed)return rateLimitedResponse('Забагато звернень. Спробуйте пізніше.',limited.retryAfter);
  const raw=await req.text();if(raw.length>12_000)return Response.json({error:'Форма завелика.'},{status:413,headers:noStore});
  let body:unknown;try{body=JSON.parse(raw)}catch{return Response.json({error:'Некоректний запит.'},{status:400,headers:noStore})}
  try{
    const result=await submitDomainCorrection(body);
    if(!result.ok)return Response.json({error:result.error},{status:400,headers:noStore});
    return Response.json({ok:true,domain:result.domain,message:'Звернення на модерації. Публікація не автоматична: команда Sift спочатку перевірить повноваження та надані докази.'},{status:201,headers:noStore});
  }catch{return Response.json({error:'Не вдалося надіслати звернення. Спробуйте пізніше.'},{status:503,headers:noStore})}
}
