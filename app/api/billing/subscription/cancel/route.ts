import {currentUser} from '../../../../../lib/auth';
import {accessFor} from '../../../../../lib/db';
import {cancelProSubscription,wayForPayConfig} from '../../../../../lib/wayforpay';
import {canonicalAppUrl,sameOriginBillingRequest} from '../../../../../lib/billing-security.js';
import {trackEvent} from '../../../../../lib/event-bus';

export async function POST(req:Request){
  const user=await currentUser(req);if(!user)return Response.json({error:'Увійдіть у акаунт, щоб керувати підпискою.'},{status:401});
  const config=wayForPayConfig(),appUrl=canonicalAppUrl(config.appBaseUrl,config.mode==='sandbox');
  if(!appUrl)return Response.json({error:'Керування оплатою тимчасово недоступне: серверний APP_BASE_URL не налаштовано.'},{status:503});
  if(!sameOriginBillingRequest(req,appUrl))return Response.json({error:'Запит відхилено.'},{status:403});
  try{const subscription=await cancelProSubscription(user.id);await trackEvent({userId:user.id,type:'subscription_canceled',sourceId:subscription.subscriptionId,payload:{subscriptionId:subscription.subscriptionId,status:subscription.status,expiresAt:subscription.expiresAt}});const access=await accessFor(user.id);return Response.json({subscription,access,message:'Автопродовження скасовано. Sift Pro працюватиме до кінця оплаченого періоду.'})}
  catch(error){return Response.json({error:error instanceof Error?error.message:'Не вдалося скасувати підписку.'},{status:409})}
}
