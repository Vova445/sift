import {resetPasswordWithToken} from '../../../../../lib/password-reset';
import {allowPasswordResetAttempt} from '../../../../../lib/auth-rate-limit';
import {verifyRequestTurnstile} from '../../../../../lib/turnstile';
import {AUTH_REQUESTS_PER_MINUTE,enforceRateLimit,rateLimitIdentities,rateLimitedResponse} from '../../../../../lib/request-rate-limit';

export async function POST(req:Request){
  try{const ipLimit=await enforceRateLimit('auth:password:reset:ip',rateLimitIdentities(req),AUTH_REQUESTS_PER_MINUTE);if(!ipLimit.allowed)return rateLimitedResponse('Забагато запитів на зміну пароля. Спробуйте пізніше.',ipLimit.retryAfter)}catch{return Response.json({error:'Зміна пароля тимчасово недоступна.'},{status:503})}
  let body:{token?:unknown;password?:unknown;turnstileToken?:unknown};
  try{body=await req.json() as {token?:unknown;password?:unknown;turnstileToken?:unknown}}catch{return Response.json({error:'Некоректний запит.'},{status:400})}
  const resetLimit=await enforceRateLimit('auth:password:reset:token',rateLimitIdentities(req,undefined,typeof body.token==='string'?body.token:'invalid'),AUTH_REQUESTS_PER_MINUTE);
  if(!resetLimit.allowed)return rateLimitedResponse('Забагато спроб зміни пароля. Спробуйте пізніше.',resetLimit.retryAfter);
  const challenge=await verifyRequestTurnstile(req,body.turnstileToken,'password_reset');
  if(!challenge.ok)return Response.json({error:challenge.message},{status:challenge.status,headers:challenge.retryAfter?{'Retry-After':String(challenge.retryAfter)}:{}});
  if(!await allowPasswordResetAttempt(req))return rateLimitedResponse('Забагато спроб. Запросіть нове посилання пізніше.',900);
  const result=await resetPasswordWithToken(body.token,body.password);
  if(result.ok)return Response.json({ok:true,message:'Пароль змінено. Увійдіть з новим паролем; попередні сесії завершено.'});
  if(result.reason==='password')return Response.json({error:'Новий пароль має містити від 8 до 1024 символів.'},{status:400});
  return Response.json({error:'Посилання недійсне, прострочене або вже використане. Запросіть нове.'},{status:400});
}
