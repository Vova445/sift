import {createUser,newSession,sessionCookie} from '../../../../lib/auth';
import {signupLegalConsent} from '../../../../lib/legal-consent-policy.js';
import {sendVerificationEmail} from '../../../../lib/email-verification';
import {verifyRequestTurnstile} from '../../../../lib/turnstile';
import {AUTH_REQUESTS_PER_MINUTE,enforceRateLimit,rateLimitAccountIdentity,rateLimitIdentities,rateLimitedResponse} from '../../../../lib/request-rate-limit';

export async function POST(req:Request){
  try{const ipLimit=await enforceRateLimit('auth:signup:ip',rateLimitIdentities(req),AUTH_REQUESTS_PER_MINUTE);if(!ipLimit.allowed)return rateLimitedResponse('Забагато реєстрацій із цієї мережі. Спробуйте пізніше.',ipLimit.retryAfter)}catch{return Response.json({error:'Реєстрація тимчасово недоступна.'},{status:503})}
  try{
    const body=await req.json() as {email?:unknown;password?:unknown;turnstileToken?:unknown;legalConsent?:unknown};
    if(typeof body.email!=='string'||typeof body.password!=='string')return Response.json({error:'Вкажіть email і пароль.'},{status:400});
    const consent=signupLegalConsent(body.legalConsent);
    if(!consent)return Response.json({error:'Потрібно прийняти Умови користування та підтвердити ознайомлення з Політикою приватності.'},{status:400});
    const email=body.email.trim().toLowerCase();
    const accountLimit=await enforceRateLimit('auth:signup:account',rateLimitAccountIdentity(req,email),AUTH_REQUESTS_PER_MINUTE);
    if(!accountLimit.allowed)return rateLimitedResponse('Забагато спроб реєстрації для цієї адреси. Спробуйте пізніше.',accountLimit.retryAfter);
    const challenge=await verifyRequestTurnstile(req,body.turnstileToken,'signup');
    if(!challenge.ok)return Response.json({error:challenge.message},{status:challenge.status,headers:challenge.retryAfter?{'Retry-After':String(challenge.retryAfter)}:{}});
    const user=await createUser(email,body.password,consent),session=await newSession(user.id),verification=await sendVerificationEmail(user);
    return Response.json({user,verification},{status:201,headers:{'Set-Cookie':sessionCookie(session.token)}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:'Не вдалося створити акаунт'},{status:400})}
}
