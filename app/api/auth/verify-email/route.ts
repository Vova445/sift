import {consumeVerificationToken} from '../../../../lib/email-verification';
import {AUTH_REQUESTS_PER_MINUTE,enforceRateLimit,rateLimitIdentities,rateLimitedResponse} from '../../../../lib/request-rate-limit';

export async function POST(req:Request){
  try{const ipLimit=await enforceRateLimit('auth:email-verification:ip',rateLimitIdentities(req),AUTH_REQUESTS_PER_MINUTE);if(!ipLimit.allowed)return rateLimitedResponse('Забагато спроб підтвердження email.',ipLimit.retryAfter)}catch{return Response.json({error:'Підтвердження email тимчасово недоступне.'},{status:503})}
  let body:{token?:unknown};
  try{body=await req.json() as {token?:unknown}}catch{return Response.json({error:'Некоректне посилання підтвердження.'},{status:400})}
  try{const tokenLimit=await enforceRateLimit('auth:email-verification:token',rateLimitIdentities(req,undefined,typeof body.token==='string'?body.token:'invalid'),AUTH_REQUESTS_PER_MINUTE);if(!tokenLimit.allowed)return rateLimitedResponse('Забагато спроб із цим посиланням.',tokenLimit.retryAfter)}catch{return Response.json({error:'Підтвердження email тимчасово недоступне.'},{status:503})}
  const result=await consumeVerificationToken(body.token);
  if(result.ok)return Response.json({verified:true,message:'Email підтверджено. Тепер доступні платні можливості Sift.'});
  if(result.reason==='expired')return Response.json({error:'Посилання підтвердження прострочене. Увійдіть і надішліть нове.'},{status:410});
  if(result.reason==='used')return Response.json({error:'Це посилання вже використане. Якщо email підтверджений, увійдіть у Sift.'},{status:409});
  return Response.json({error:'Посилання недійсне. Увійдіть і надішліть нове.'},{status:400});
}
