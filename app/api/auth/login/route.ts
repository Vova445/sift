import {env} from 'cloudflare:workers';
import {newSession,sessionCookie} from '../../../../lib/auth';
import {verifyPasswordProofForEmail,type ClientPasswordCredentials} from '../../../../lib/password-protocol';
import {clearAccountLoginFailures,loginIsThrottled,recordLoginFailure} from '../../../../lib/auth-rate-limit';
import {AUTH_REQUESTS_PER_MINUTE,enforceRateLimit,rateLimitIdentities,rateLimitedResponse} from '../../../../lib/request-rate-limit';

export async function POST(req:Request){
  try{const ipLimit=await enforceRateLimit('auth:login:ip',rateLimitIdentities(req),AUTH_REQUESTS_PER_MINUTE);if(!ipLimit.allowed)return rateLimitedResponse('Забагато спроб входу з цієї мережі. Спробуйте пізніше.',ipLimit.retryAfter)}catch(error){console.error('[auth:login] rate limit unavailable',error);return Response.json({error:'Сервіс входу тимчасово недоступний.'},{status:503})}
  let email='';
  try{
    const body=await req.json() as {email?:unknown;challengeId?:unknown;proof?:unknown;upgrade?:ClientPasswordCredentials;upgradeProof?:unknown};
    if(typeof body.email!=='string'||typeof body.challengeId!=='string'||typeof body.proof!=='string')return Response.json({error:'Оновіть сторінку й повторіть вхід.'},{status:400});
    email=body.email.trim().toLowerCase();
    if(await loginIsThrottled(req,email))return rateLimitedResponse('Забагато невдалих входів. Спробуйте через 15 хвилин.',900);
    const verified=await verifyPasswordProofForEmail(email,'login',body.challengeId,body.proof,body.upgrade,body.upgradeProof),user=await (async()=>{
      const row=await env.DB.prepare('SELECT email_verification_status.verified_at AS email_verified_at FROM email_verification_status WHERE user_id=?').bind(verified.id).first<{email_verified_at:string|null}>();
      return{id:verified.id,email:verified.email,emailVerified:!!row?.email_verified_at,emailVerifiedAt:row?.email_verified_at||null};
    })(),session=await newSession(user.id);
    await clearAccountLoginFailures(req,email);
    return Response.json({user},{headers:{'Set-Cookie':sessionCookie(session.token)}});
  }catch{try{if(email)await recordLoginFailure(req,email)}catch{}return Response.json({error:'Неправильний email або пароль.'},{status:401})}
}
