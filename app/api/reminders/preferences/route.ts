import {currentUser} from '../../../../lib/auth';
import {accessFor} from '../../../../lib/db';
import {guardFeature} from '../../../../lib/entitlements';
import {getEmailReminderPreferences,setEmailReminderPreferences} from '../../../../lib/email-reminders';

async function authorize(req:Request){
  const user=await currentUser(req);
  if(!user)return{response:Response.json({error:'Увійдіть в акаунт'},{status:401})};
  const access=await accessFor(user.id),denied=await guardFeature(user,'purchase_planner',{access,message:'Email-нагадування доступні у Sift Pro'});
  if(denied)return{response:denied};
  return{user};
}

export async function GET(req:Request){
  const auth=await authorize(req);if('response' in auth)return auth.response;
  return Response.json(await getEmailReminderPreferences(auth.user.id),{headers:{'Cache-Control':'no-store, private'}});
}

export async function POST(req:Request){
  const auth=await authorize(req);if('response' in auth)return auth.response;
  let body:{enabled?:unknown};try{body=await req.json() as {enabled?:unknown}}catch{return Response.json({error:'Некоректний запит'},{status:400})}
  if(typeof body.enabled!=='boolean')return Response.json({error:'Вкажіть стан нагадувань'},{status:400});
  return Response.json(await setEmailReminderPreferences(auth.user.id,body.enabled),{headers:{'Cache-Control':'no-store, private'}});
}
