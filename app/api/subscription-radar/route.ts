import {currentUser} from '../../../lib/auth';
import {accessFor} from '../../../lib/db';
import {guardFeature} from '../../../lib/entitlements';
import {createSubscriptionRadarAddress,deleteSubscriptionRadarData,deleteSubscriptionRadarItem,setSubscriptionRadarEnabled,subscriptionRadarForUser} from '../../../lib/subscription-radar';
import {setEmailReminderPreferences} from '../../../lib/email-reminders';
import {featureFlagEnabled} from '../../../lib/support-tools-db';

function sameOrigin(req:Request){const origin=req.headers.get('origin');if(!origin)return false;try{return new URL(origin).origin===new URL(req.url).origin}catch{return false}}

async function authorize(req:Request){
  const user=await currentUser(req);
  if(!user)return{response:Response.json({error:'Увійдіть до Sift, щоб налаштувати Subscription Radar.'},{status:401,headers:{'Cache-Control':'no-store'}})};
  const access=await accessFor(user.id),denied=await guardFeature(user,'purchase_planner',{access,message:'Subscription Radar доступний у Sift Pro'});
  if(denied)return{response:denied};
  if(!await featureFlagEnabled('subscription_radar'))return{response:Response.json({error:'Subscription Radar тимчасово вимкнений.'},{status:503,headers:{'Cache-Control':'no-store'}})};
  return{user};
}

export async function GET(req:Request){
  const auth=await authorize(req);if('response'in auth)return auth.response;
  const data=await subscriptionRadarForUser(auth.user.id);
  return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
}

export async function POST(req:Request){
  const auth=await authorize(req);if('response'in auth)return auth.response;
  if(!sameOrigin(req))return Response.json({error:'Запит має надійти з цього сайту.'},{status:403});
  let body:{action?:unknown;enabled?:unknown};try{body=await req.json() as {action?:unknown;enabled?:unknown}}catch{return Response.json({error:'Некоректний запит.'},{status:400})}
  if(body.action==='create'||body.action==='rotate'){
    const result=await createSubscriptionRadarAddress(auth.user.id,body.action==='rotate');
    if(!result)return Response.json({error:'Домен для пересилання ще не налаштований. Адміністратор має підключити домен у Cloudflare Email Routing.'},{status:503});
    return Response.json({...await subscriptionRadarForUser(auth.user.id),notice:body.action==='rotate'?'Стару адресу вимкнено. Використовуйте нову адресу для наступних листів.':'Адресу для пересилання створено.'},{headers:{'Cache-Control':'private, no-store'}});
  }
  if(body.action==='set_reminders'){
    if(typeof body.enabled!=='boolean')return Response.json({error:'Вкажіть стан нагадувань.'},{status:400});
    await setEmailReminderPreferences(auth.user.id,body.enabled);
    return Response.json(await subscriptionRadarForUser(auth.user.id),{headers:{'Cache-Control':'private, no-store'}});
  }
  return Response.json({error:'Невідома дія.'},{status:400});
}

export async function DELETE(req:Request){
  const auth=await authorize(req);if('response'in auth)return auth.response;
  if(!sameOrigin(req))return Response.json({error:'Запит має надійти з цього сайту.'},{status:403});
  let body:{itemId?:unknown;action?:unknown};try{body=await req.json() as {itemId?:unknown;action?:unknown}}catch{return Response.json({error:'Некоректний запит.'},{status:400})}
  if(typeof body.itemId==='string'&&body.itemId.length<=100){const removed=await deleteSubscriptionRadarItem(auth.user.id,body.itemId);if(!removed)return Response.json({error:'Запис не знайдено.'},{status:404})}
  else if(body.action==='purge_data')await deleteSubscriptionRadarData(auth.user.id);
  else if(body.action==='disable')await setSubscriptionRadarEnabled(auth.user.id,false);
  else return Response.json({error:'Оберіть запис або дію.'},{status:400});
  return Response.json(await subscriptionRadarForUser(auth.user.id),{headers:{'Cache-Control':'private, no-store'}});
}
