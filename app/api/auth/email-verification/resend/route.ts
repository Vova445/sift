import {currentUser} from '../../../../../lib/auth';
import {sendVerificationEmail} from '../../../../../lib/email-verification';
import {canonicalAppUrl,sameOriginBillingRequest} from '../../../../../lib/billing-security.js';
import {wayForPayConfig} from '../../../../../lib/wayforpay';
import {AUTH_REQUESTS_PER_MINUTE,enforceRateLimit,rateLimitIdentities,rateLimitedResponse} from '../../../../../lib/request-rate-limit';

export async function POST(req:Request){
  const user=await currentUser(req);
  if(!user)return Response.json({error:'Увійдіть, щоб надіслати лист підтвердження.'},{status:401});
  try{const limit=await enforceRateLimit('auth:verification:resend',rateLimitIdentities(req,user.email),AUTH_REQUESTS_PER_MINUTE);if(!limit.allowed)return rateLimitedResponse('Забагато запитів на лист підтвердження.',limit.retryAfter)}catch{return Response.json({error:'Сервіс підтвердження тимчасово недоступний.'},{status:503})}
  const config=wayForPayConfig(),appUrl=canonicalAppUrl(config.appBaseUrl,config.mode==='sandbox');
  if(!appUrl)return Response.json({error:'Пошту не налаштовано: відсутній коректний APP_BASE_URL.'},{status:503});
  if(!sameOriginBillingRequest(req,appUrl))return Response.json({error:'Запит відхилено.'},{status:403});
  const result=await sendVerificationEmail(user);
  if(result.sent)return Response.json({sent:true,message:`Лист надіслано на ${user.email}. Перевірте також папку «Спам».`});
  if(result.reason==='already_verified')return Response.json({sent:false,message:'Цю адресу вже підтверджено.'});
  if(result.reason==='rate_limited')return rateLimitedResponse('Зачекайте хвилину перед повторним надсиланням. Діє ліміт 5 листів на добу.',60);
  if(result.reason==='not_configured')return Response.json({error:'Відправлення листів ще не налаштовано на сервері.'},{status:503});
  return Response.json({error:'Не вдалося надіслати лист. Спробуйте пізніше.'},{status:503});
}
