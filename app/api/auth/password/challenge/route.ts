import {issuePasswordChallenge,type PasswordPurpose} from '../../../../../lib/password-protocol';
import {AUTH_REQUESTS_PER_MINUTE,enforceRateLimit,rateLimitAccountIdentity,rateLimitIdentities,rateLimitedResponse} from '../../../../../lib/request-rate-limit';

export async function POST(req:Request){
  try{
    const body=await req.json() as {email?:unknown;purpose?:unknown};
    if(typeof body.email!=='string'||typeof body.purpose!=='string'||!['login','change','delete'].includes(body.purpose))return Response.json({error:'Некоректний запит.'},{status:400});
    const email=body.email.trim().toLowerCase();
    const ip=await enforceRateLimit('auth:password:challenge:ip',rateLimitIdentities(req),AUTH_REQUESTS_PER_MINUTE);
    if(!ip.allowed)return rateLimitedResponse('Забагато спроб. Спробуйте пізніше.',ip.retryAfter);
    const account=await enforceRateLimit(`auth:password:challenge:${body.purpose}:account`,rateLimitAccountIdentity(req,email),AUTH_REQUESTS_PER_MINUTE);
    if(!account.allowed)return rateLimitedResponse('Забагато спроб для цього акаунта. Спробуйте пізніше.',account.retryAfter);
    return Response.json(await issuePasswordChallenge(email,body.purpose as PasswordPurpose),{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if(error instanceof Error&&/email/i.test(error.message))return Response.json({error:error.message},{status:400});
    console.error('[auth:password:challenge] unavailable',error instanceof Error?error.message:'unknown');
    return Response.json({error:'Захищена перевірка пароля тимчасово недоступна.'},{status:503});
  }
}
