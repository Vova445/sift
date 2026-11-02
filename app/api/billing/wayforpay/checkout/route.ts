import {currentUser} from '../../../../../lib/auth';
import {createPaymentOrder,planDetails,purchaseSignature,sandboxAllowed,wayForPayConfig,type PaidPlan} from '../../../../../lib/wayforpay';

export async function POST(req:Request){
  const user=await currentUser(req);if(!user)return Response.json({error:'Увійдіть у Sift, щоб продовжити оплату.'},{status:401});
  let body:{plan?:unknown};try{body=await req.json() as {plan?:unknown}}catch{return Response.json({error:'Некоректний запит.'},{status:400})}
  if(body.plan!=='one'&&body.plan!=='pro')return Response.json({error:'Оберіть доступний тариф.'},{status:400});
  const plan=body.plan as PaidPlan,config=wayForPayConfig(),testMode=config.mode==='sandbox';
  if(!config.merchantAccount||!config.secret)return Response.json({error:'WayForPay ще не налаштовано на сервері.'},{status:503});
  if(testMode&&!sandboxAllowed(user.email))return Response.json({error:'Sandbox checkout обмежено тестовим списком акаунтів.'},{status:403});
  const url=new URL(req.url),domain=config.domain||(testMode?url.hostname:'');
  if(!domain||domain.includes('/')||domain.includes(':'))return Response.json({error:'Налаштуйте WAYFORPAY_MERCHANT_DOMAIN.'},{status:503});
  const details=planDetails(plan),reference=`sift_${crypto.randomUUID().replaceAll('-','')}`,orderDate=Math.floor(Date.now()/1000),amount=details.uah;
  await createPaymentOrder({reference,userId:user.id,plan,amount,testMode});
  const fields={merchantAccount:config.merchantAccount,merchantDomainName:domain,orderReference:reference,orderDate,amount,currency:'UAH',productName:[details.label],productCount:[1],productPrice:[amount]};
  const origin=url.origin;
  const form={...fields,merchantAuthType:'SimpleSignature',merchantTransactionSecureType:'AUTO',merchantSignature:purchaseSignature(fields),apiVersion:1,language:'UA',returnUrl:`${origin}/?payment=${encodeURIComponent(reference)}&plan=${plan}#pricing`,serviceUrl:`${origin}/api/billing/wayforpay/callback`,orderTimeout:3600,alternativeAmount:details.usd,alternativeCurrency:'USD',clientAccountId:user.id};
  return Response.json({action:'https://secure.wayforpay.com/pay',fields:form,plan,price:{uah:details.uah,usd:details.usd},testMode});
}
