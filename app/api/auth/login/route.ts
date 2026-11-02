import {newSession,sessionCookie,verifyUser} from '../../../../lib/auth';
import {clearAccountLoginFailures,loginIsThrottled,recordLoginFailure} from '../../../../lib/auth-rate-limit';
import {AUTH_REQUESTS_PER_MINUTE,enforceRateLimit,rateLimitAccountIdentity,rateLimitIdentities,rateLimitedResponse} from '../../../../lib/request-rate-limit';

export async function POST(req:Request){
  try{const ipLimit=await enforceRateLimit('auth:login:ip',rateLimitIdentities(req),AUTH_REQUESTS_PER_MINUTE);if(!ipLimit.allowed)return rateLimitedResponse('Забагато спроб входу з цієї мережі. Спробуйте пізніше.',ipLimit.retryAfter)}catch(error){console.error('[auth:login] rate limit unavailable',error);return Response.json({error:'Сервіс входу тимчасово недоступний.'},{status:503})}
  let email='';
  try{
    const body=await req.json() as {email?:unknown;password?:unknown};
    if(typeof body.email!=='string'||typeof body.password!=='string')return Response.json({error:'Введіть email і пароль.'},{status:400});
    email=body.email.trim().toLowerCase();
    const accountLimit=await enforceRateLimit('auth:login:account',rateLimitAccountIdentity(req,email),AUTH_REQUESTS_PER_MINUTE);
    if(!accountLimit.allowed)return rateLimitedResponse('Забагато спроб входу для цього акаунта. Спробуйте пізніше.',accountLimit.retryAfter);
    if(await loginIsThrottled(req,email))return rateLimitedResponse('Забагато невдалих входів. Спробуйте через 15 хвилин.',900);
    const user=await verifyUser(email,body.password),session=await newSession(user.id);
    await clearAccountLoginFailures(req,email);
    return Response.json({user},{headers:{'Set-Cookie':sessionCookie(session.token)}});
  }catch{try{if(email)await recordLoginFailure(req,email)}catch{}return Response.json({error:'Неправильний email або пароль.'},{status:401})}
}
