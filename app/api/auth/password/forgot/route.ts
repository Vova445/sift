import {requestPasswordReset} from '../../../../../lib/password-reset';
import {verifyRequestTurnstile} from '../../../../../lib/turnstile';
import {AUTH_REQUESTS_PER_MINUTE,enforceRateLimit,rateLimitAccountIdentity,rateLimitIdentities,rateLimitedResponse} from '../../../../../lib/request-rate-limit';

const generic=()=>Response.json({ok:true,message:'Якщо акаунт із такою адресою існує, ми надішлемо інструкцію зі скидання пароля.'});

export async function POST(req:Request){
  let ipLimit;
  try{ipLimit=await enforceRateLimit('auth:password:forgot:ip',rateLimitIdentities(req),AUTH_REQUESTS_PER_MINUTE)}catch{return Response.json({error:'Відновлення пароля тимчасово недоступне.'},{status:503})}
  if(!ipLimit.allowed)return rateLimitedResponse('Забагато запитів на скидання пароля. Спробуйте пізніше.',ipLimit.retryAfter);
  let body:{email?:unknown;turnstileToken?:unknown};
  try{body=await req.json() as {email?:unknown;turnstileToken?:unknown}}catch{return generic()}
  if(typeof body.email!=='string')return generic();
  const email=body.email.trim().toLowerCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return generic();
  let accountLimit;
  try{accountLimit=await enforceRateLimit('auth:password:forgot:account',rateLimitAccountIdentity(req,email),AUTH_REQUESTS_PER_MINUTE)}catch{return Response.json({error:'Відновлення пароля тимчасово недоступне.'},{status:503})}
  if(!accountLimit.allowed)return rateLimitedResponse('Забагато запитів на скидання пароля. Спробуйте пізніше.',accountLimit.retryAfter);
  const challenge=await verifyRequestTurnstile(req,body.turnstileToken,'password_reset');
  if(!challenge.ok)return Response.json({error:challenge.message},{status:challenge.status,headers:challenge.retryAfter?{'Retry-After':String(challenge.retryAfter)}:{}});
  try{if(!await requestPasswordReset(req,email))return rateLimitedResponse('Ліміт запитів на скидання пароля вичерпано. Спробуйте пізніше.',3600)}catch{/* Preserve the same response for existing and unknown email addresses. */}
  return generic();
}
