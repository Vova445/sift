import {currentUser} from '../../../../../lib/auth';
import {createPaymentOrder,purchaseSignature,sandboxAllowed,wayForPayConfig} from '../../../../../lib/wayforpay';
import {addCalendarMonth,wayForPayDate} from '../../../../../lib/subscription-lifecycle';
import {env} from 'cloudflare:workers';
import {canonicalAppUrl,checkoutDescriptor,merchantDomainMatches,sameOriginBillingRequest} from '../../../../../lib/billing-security.js';
import {checkoutLegalConsent} from '../../../../../lib/legal-consent-policy.js';
import {hashFunnelSession,recordFunnelEventSafely} from '../../../../../lib/funnel-analytics';

export async function POST(req:Request){
 try{
  const user=await currentUser(req);if(!user)return Response.json({error:'Увійдіть у Sift, щоб продовжити оплату.'},{status:401});
  if(!user.emailVerified)return Response.json({error:'Підтвердіть email перед оплатою.'},{status:403});
  const config=wayForPayConfig(),testMode=config.mode==='sandbox',appUrl=canonicalAppUrl(config.appBaseUrl,testMode);
  if(!appUrl)return Response.json({error:'Платежі тимчасово недоступні: серверний APP_BASE_URL не налаштовано коректно.'},{status:503});
  if(!sameOriginBillingRequest(req,appUrl))return Response.json({error:'Запит оплати має надійти з офіційного сайту Sift.'},{status:403});
  let body:{plan?:unknown;legalConsent?:unknown;analyticsSessionId?:unknown};try{body=await req.json() as {plan?:unknown;legalConsent?:unknown;analyticsSessionId?:unknown}}catch{return Response.json({error:'Некоректний запит.'},{status:400})}
  const legalConsent=checkoutLegalConsent(body.legalConsent);
  if(!legalConsent)return Response.json({error:'Для оплати прийміть Умови й Політику повернення, підтвердьте ознайомлення з приватністю та негайний початок послуги.'},{status:400});
  const reference=`sift_${crypto.randomUUID().replaceAll('-','')}`,orderDate=Math.floor(Date.now()/1000),descriptor=checkoutDescriptor(body,user.id,reference,orderDate,appUrl);
  if(!descriptor)return Response.json({error:'Оберіть доступний тариф.'},{status:400});
  const {plan,amount,details}=descriptor;
  if(!config.merchantAccount||!config.secret)return Response.json({error:'WayForPay ще не налаштовано на сервері.'},{status:503});
  if(testMode&&!sandboxAllowed(user.email))return Response.json({error:'Sandbox checkout обмежено тестовим списком акаунтів.'},{status:403});
  if(plan==='pro'){
    const existing=await env.DB.prepare(`SELECT id FROM subscriptions WHERE user_id=? AND plan='pro' AND ((status IN ('trialing','active','past_due','canceled') AND expires_at>?) OR (recurring_order_reference IS NOT NULL AND cancel_at_period_end=0 AND status IN ('active','past_due','expired'))) LIMIT 1`).bind(user.id,new Date().toISOString()).first();
    if(existing)return Response.json({error:'У вас уже є підписка або очікується її автопродовження. Керуйте нею в Dashboard.'},{status:409});
  }
  const domain=config.domain;
  if(!merchantDomainMatches(domain,appUrl))return Response.json({error:'Налаштуйте WAYFORPAY_MERCHANT_DOMAIN відповідно до APP_BASE_URL.'},{status:503});
  const analyticsSessionHash=await hashFunnelSession(body.analyticsSessionId);
  await createPaymentOrder({reference,userId:user.id,plan,amount,testMode,legalConsent,analyticsSessionHash});
  await recordFunnelEventSafely(body.analyticsSessionId,'paywall');
  const fields={merchantAccount:config.merchantAccount,merchantDomainName:domain,orderReference:reference,orderDate,amount,currency:'UAH',productName:[details.label],productCount:[1],productPrice:[amount]};
  const form={...fields,merchantAuthType:'SimpleSignature',merchantTransactionSecureType:'AUTO',merchantSignature:purchaseSignature(fields),apiVersion:1,language:'UA',returnUrl:descriptor.returnUrl,serviceUrl:descriptor.serviceUrl,orderTimeout:3600,alternativeAmount:details.usd,alternativeCurrency:'USD',clientAccountId:user.id,...(plan==='pro'?{regularMode:'monthly',regularBehavior:'preset',regularAmount:details.uah,dateNext:wayForPayDate(addCalendarMonth(new Date())),regularOn:1}:{})};
  return Response.json({action:'https://secure.wayforpay.com/pay',fields:form,plan,price:{uah:details.uah,usd:details.usd},testMode});
 }catch(error){
  console.error('[wayforpay] checkout creation failed',error instanceof Error?error.message:'unknown error');
  return Response.json({error:'Не вдалося створити платіж. Спробуйте ще раз трохи пізніше.'},{status:500,headers:{'Cache-Control':'no-store'}});
 }
}
