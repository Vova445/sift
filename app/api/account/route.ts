import {env} from 'cloudflare:workers';
import {currentUser} from '../../../lib/auth';
import {accessFor,limitHistory,quotaIpKey,scanHistory} from '../../../lib/db';
import {subscriptionFor} from '../../../lib/wayforpay';

export async function GET(req:Request){
 const user=await currentUser(req);
 if(!user)return Response.json({error:'Увійдіть в акаунт'},{status:401});
 const deviceId=new URL(req.url).searchParams.get('deviceId')||'';
 const access=await accessFor(user.id,'',undefined,await quotaIpKey(req));
 const history=await scanHistory(deviceId,user.id),subscription=await subscriptionFor(user.id);
 const payments=await env.DB.prepare(`SELECT order_reference,status,amount_uah,period_start,period_end,created_at,paid_at FROM subscription_payments WHERE user_id=? ORDER BY created_at DESC LIMIT 24`).bind(user.id).all();
 return Response.json({user,access,subscription,payments:payments.results||[],history:limitHistory(history,access.plan)});
}
