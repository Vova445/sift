import {createUser,newSession,sessionCookie} from '../../../../lib/auth';
import type {ClientPasswordCredentials} from '../../../../lib/password-protocol';
import {signupLegalConsent} from '../../../../lib/legal-consent-policy.js';
import {sendVerificationEmail} from '../../../../lib/email-verification';
import {verifyRequestTurnstile} from '../../../../lib/turnstile';
import {AUTH_REQUESTS_PER_MINUTE,enforceRateLimit,rateLimitAccountIdentity,rateLimitIdentities,rateLimitedResponse} from '../../../../lib/request-rate-limit';
import {recordFunnelEventSafely} from '../../../../lib/funnel-analytics';
import {attributeReferralSignup} from '../../../../lib/referrals';

export async function POST(req:Request){
  try{const ipLimit=await enforceRateLimit('auth:signup:ip',rateLimitIdentities(req),AUTH_REQUESTS_PER_MINUTE);if(!ipLimit.allowed)return rateLimitedResponse('Забагато реєстрацій із цієї мережі. Спробуйте пізніше.',ipLimit.retryAfter)}catch{return Response.json({error:'Реєстрація тимчасово недоступна.'},{status:503})}
  try{
    const body=await req.json() as {email?:unknown;passwordCredentials?:ClientPasswordCredentials;turnstileToken?:unknown;legalConsent?:unknown;analyticsSessionId?:unknown;referralToken?:unknown;deviceId?:unknown};
    if(typeof body.email!=='string'||!body.passwordCredentials)return Response.json({error:'Вкажіть email і пароль.'},{status:400});
    const consent=signupLegalConsent(body.legalConsent);
    if(!consent)return Response.json({error:'Потрібно прийняти Умови користування та підтвердити ознайомлення з Політикою приватності.'},{status:400});
    const email=body.email.trim().toLowerCase();
    const accountLimit=await enforceRateLimit('auth:signup:account',rateLimitAccountIdentity(req,email),AUTH_REQUESTS_PER_MINUTE);
    if(!accountLimit.allowed)return rateLimitedResponse('Забагато спроб реєстрації для цієї адреси. Спробуйте пізніше.',accountLimit.retryAfter);
    const challenge=await verifyRequestTurnstile(req,body.turnstileToken,'signup');
    if(!challenge.ok)return Response.json({error:challenge.message},{status:challenge.status,headers:challenge.retryAfter?{'Retry-After':String(challenge.retryAfter)}:{}});
    const user=await createUser(email,body.passwordCredentials,consent);
    if(typeof body.referralToken==='string')await attributeReferralSignup(user.id,body.referralToken,req,body.deviceId).catch(()=>false);
    const session=await newSession(user.id),verification=await sendVerificationEmail(user);
    await recordFunnelEventSafely(body.analyticsSessionId,'signup');
    return Response.json({user,verification},{status:201,headers:{'Set-Cookie':sessionCookie(session.token)}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:'Не вдалося створити акаунт'},{status:400})}
}
