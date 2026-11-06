import {env} from 'cloudflare:workers';
import {currentUser,sessionCookie} from '../../../../../lib/auth';
import {storePasswordCredentials,verifyPasswordProofForEmail,type ClientPasswordCredentials} from '../../../../../lib/password-protocol';
import {clearAccountLoginFailures,loginIsThrottled,recordLoginFailure} from '../../../../../lib/auth-rate-limit';
import {canonicalAppUrl,sameOriginBillingRequest} from '../../../../../lib/billing-security.js';
import {wayForPayConfig} from '../../../../../lib/wayforpay';
import {AUTH_REQUESTS_PER_MINUTE,enforceRateLimit,rateLimitIdentities,rateLimitedResponse} from '../../../../../lib/request-rate-limit';

export async function POST(req:Request){
  const user=await currentUser(req);
  if(!user)return Response.json({error:'Увійдіть, щоб змінити пароль.'},{status:401});
  try{const limit=await enforceRateLimit('auth:password:change',rateLimitIdentities(req,user.email),AUTH_REQUESTS_PER_MINUTE);if(!limit.allowed)return rateLimitedResponse('Забагато спроб зміни пароля.',limit.retryAfter)}catch{return Response.json({error:'Керування паролем тимчасово недоступне.'},{status:503})}
  const config=wayForPayConfig(),app=canonicalAppUrl(config.appBaseUrl,config.mode==='sandbox');
  if(!app)return Response.json({error:'Керування паролем тимчасово недоступне: серверний APP_BASE_URL не налаштовано.'},{status:503});
  if(!sameOriginBillingRequest(req,app))return Response.json({error:'Запит відхилено.'},{status:403});
  let body:{currentChallengeId?:unknown;currentProof?:unknown;currentUpgrade?:ClientPasswordCredentials;currentUpgradeProof?:unknown;newPasswordCredentials?:ClientPasswordCredentials};
  try{body=await req.json() as {currentChallengeId?:unknown;currentProof?:unknown;currentUpgrade?:ClientPasswordCredentials;currentUpgradeProof?:unknown;newPasswordCredentials?:ClientPasswordCredentials}}catch{return Response.json({error:'Некоректний запит.'},{status:400})}
  if(typeof body.currentChallengeId!=='string'||typeof body.currentProof!=='string'||!body.newPasswordCredentials)return Response.json({error:'Оновіть сторінку й повторіть зміну пароля.'},{status:400});
  if(await loginIsThrottled(req,user.email))return rateLimitedResponse('Забагато невдалих спроб. Спробуйте через 15 хвилин.',900);
  try{await verifyPasswordProofForEmail(user.email,'change',body.currentChallengeId,body.currentProof,body.currentUpgrade,body.currentUpgradeProof)}catch{await recordLoginFailure(req,user.email);return Response.json({error:'Поточний пароль неправильний.'},{status:401})}
  const current=await env.DB.prepare(`SELECT password_hash FROM users WHERE id=?`).bind(user.id).first<{password_hash:string}>();
  if(!current)return Response.json({error:'Акаунт не знайдено.'},{status:404});
  let credentials;try{credentials=await storePasswordCredentials(body.newPasswordCredentials)}catch(error){return Response.json({error:error instanceof Error?error.message:'Некоректні дані нового пароля.'},{status:400})}
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE users SET password_hash=?,salt=?,password_iterations=? WHERE id=? AND password_hash=?`).bind(credentials.passwordHash,credentials.salt,credentials.passwordIterations,user.id,current.password_hash),
    env.DB.prepare(`DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND password_hash=?)`).bind(user.id,user.id,credentials.passwordHash)
  ]);
  if((results[0]?.meta?.changes||0)!==1)return Response.json({error:'Не вдалося змінити пароль. Спробуйте ще раз.'},{status:409});
  await clearAccountLoginFailures(req,user.email);
  return Response.json({ok:true,message:'Пароль змінено. Усі активні сесії завершено; увійдіть знову.'},{headers:{'Set-Cookie':sessionCookie('',0)}});
}
