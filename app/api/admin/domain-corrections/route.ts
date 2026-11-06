import {requireSupportAdmin,supportSameOrigin} from '../../../../lib/support-admin';
import {pendingDomainCorrections,reviewDomainCorrection} from '../../../../lib/domain-index';
import {writeSupportAudit} from '../../../../lib/support-tools-db';
import {enforceRateLimit,rateLimitIdentities,rateLimitedResponse} from '../../../../lib/request-rate-limit';

const noStore={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};

export async function GET(req:Request){
  const auth=await requireSupportAdmin(req);if('response'in auth)return auth.response;
  const limited=await enforceRateLimit('domain-corrections:read',rateLimitIdentities(req,auth.user.id),30);
  if(!limited.allowed)return rateLimitedResponse('Забагато запитів до черги звернень.',limited.retryAfter);
  try{return Response.json({requests:await pendingDomainCorrections()},{headers:noStore})}
  catch{return Response.json({error:'Не вдалося завантажити звернення.'},{status:503,headers:noStore})}
}

export async function POST(req:Request){
  const auth=await requireSupportAdmin(req);if('response'in auth)return auth.response;
  if(!supportSameOrigin(req))return Response.json({error:'Запит має надійти з цього сайту.'},{status:403,headers:noStore});
  const limited=await enforceRateLimit('domain-corrections:review',rateLimitIdentities(req,auth.user.id),12);
  if(!limited.allowed)return rateLimitedResponse('Забагато дій у черзі звернень.',limited.retryAfter);
  const raw=await req.text();if(raw.length>8_000)return Response.json({error:'Запит завеликий.'},{status:413,headers:noStore});
  let body:{id?:unknown;action?:unknown;response?:unknown;ownerVerified?:unknown;sourceVerified?:unknown;confirmReject?:unknown};try{body=JSON.parse(raw) as typeof body}catch{return Response.json({error:'Некоректний запит.'},{status:400,headers:noStore})}
  if(typeof body.id!=='string'||!/^[-\da-f]{36}$/i.test(body.id)||(body.action!=='publish'&&body.action!=='reject'))return Response.json({error:'Оберіть звернення та дію.'},{status:400,headers:noStore});
  const result=await reviewDomainCorrection({id:body.id,action:body.action,response:typeof body.response==='string'?body.response:undefined,ownerVerified:body.ownerVerified===true,sourceVerified:body.sourceVerified===true,confirmReject:body.confirmReject===true,reviewerId:auth.user.id});
  if(result.kind==='missing')return Response.json({error:'Звернення вже оброблено або не знайдено.'},{status:404,headers:noStore});
  if(result.kind==='invalid_response')return Response.json({error:'Відповідь має містити від 20 до 3000 символів.'},{status:400,headers:noStore});
  if(result.kind==='verification_required')return Response.json({error:'Підтвердіть окремо перевірку повноважень і офіційного джерела.'},{status:400,headers:noStore});
  if(result.kind==='rejection_confirmation_required')return Response.json({error:'Підтвердіть відхилення звернення.'},{status:400,headers:noStore});
  await writeSupportAudit({actorUserId:auth.user.id,action:result.kind==='published'?'publish_domain_owner_response':'reject_domain_correction',details:{domain:result.domain,requestId:body.id,ownerVerified:body.ownerVerified===true,sourceVerified:body.sourceVerified===true,confirmed:body.confirmReject===true}});
  return Response.json({ok:true,kind:result.kind,message:result.kind==='published'?'Відповідь опубліковано після перевірки.':'Звернення відхилено.'},{headers:noStore});
}
