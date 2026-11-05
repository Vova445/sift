import {publicDomainProfile} from '../../../../lib/domain-index';
import {enforceRateLimit,rateLimitIdentities,rateLimitedResponse} from '../../../../lib/request-rate-limit';

export async function GET(req:Request,{params}:{params:Promise<{domain:string}>}){
  const limited=await enforceRateLimit('domain-index-read',rateLimitIdentities(req),120);
  if(!limited.allowed)return rateLimitedResponse('Забагато запитів до індексу. Спробуйте пізніше.',limited.retryAfter);
  const {domain}=await params;
  try{
    const profile=await publicDomainProfile(domain);
    if(!profile)return Response.json({error:'Недостатньо незалежних згоджених перевірок для публічного профілю.'},{status:404,headers:{'Cache-Control':'no-store'}});
    return Response.json(profile,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return Response.json({error:'Індекс тимчасово недоступний.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
