import {currentUser} from '../../../../../lib/auth';
import {accessFor} from '../../../../../lib/db';
import {cancelProSubscription} from '../../../../../lib/wayforpay';

export async function POST(req:Request){
  const user=await currentUser(req);if(!user)return Response.json({error:'Увійдіть у акаунт, щоб керувати підпискою.'},{status:401});
  const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return Response.json({error:'Запит відхилено.'},{status:403});
  try{const subscription=await cancelProSubscription(user.id),access=await accessFor(user.id);return Response.json({subscription,access,message:'Автопродовження скасовано. Sift Pro працюватиме до кінця оплаченого періоду.'})}
  catch(error){return Response.json({error:error instanceof Error?error.message:'Не вдалося скасувати підписку.'},{status:409})}
}
