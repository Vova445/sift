import {publicDomainProfiles} from '../../../lib/domain-index';
import {enforceRateLimit,rateLimitIdentities,rateLimitedResponse} from '../../../lib/request-rate-limit';

export async function GET(req:Request){
  const limited=await enforceRateLimit('domain-index-read',rateLimitIdentities(req),120);
  if(!limited.allowed)return rateLimitedResponse('Забагато запитів до індексу. Спробуйте пізніше.',limited.retryAfter);
  try{return Response.json({domains:await publicDomainProfiles()},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
  catch{return Response.json({error:'Індекс тимчасово недоступний.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
