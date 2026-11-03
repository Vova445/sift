import {env} from 'cloudflare:workers';
import {currentUser} from '../../../lib/auth';
import {accessFor,limitHistory,quotaIpKey,scanHistory} from '../../../lib/db';
import {subscriptionFor} from '../../../lib/wayforpay';
import {can} from '../../../lib/entitlements';
import {sessionCookie,verifyUser} from '../../../lib/auth';
import {deleteAccountData} from '../../../lib/account-deletion';
import {canonicalAppUrl,sameOriginBillingRequest} from '../../../lib/billing-security.js';
import {wayForPayConfig} from '../../../lib/wayforpay';

export async function GET(req:Request){
 const user=await currentUser(req);
 if(!user)return Response.json({error:'Увійдіть в акаунт'},{status:401});
 const deviceId=new URL(req.url).searchParams.get('deviceId')||'';
 const access=await accessFor(user.id,'',undefined,await quotaIpKey(req));
 const history:Awaited<ReturnType<typeof scanHistory>>=await scanHistory(deviceId,user.id),subscription=await subscriptionFor(user.id);
 const payments=await env.DB.prepare(`SELECT order_reference,status,amount_uah,period_start,period_end,created_at,paid_at FROM subscription_payments WHERE user_id=? ORDER BY created_at DESC LIMIT 24`).bind(user.id).all();
 const visibleHistory=await Promise.all(history.map(async item=>await can(user,'full_evidence',{access,translationPlan:item.result.translationPlan})?item:limitHistory([item],'free')[0]));
 const analyticsAdmin=(env as unknown as Record<string,string|undefined>).ANALYTICS_ADMIN_EMAIL?.trim().toLowerCase();
 return Response.json({user,access,subscription,payments:payments.results||[],history:visibleHistory,canViewAnalytics:Boolean(user.emailVerified&&analyticsAdmin&&user.email.toLowerCase()===analyticsAdmin)});
}

export async function DELETE(req:Request){
 const user=await currentUser(req);
 if(!user)return Response.json({error:'Увійдіть у акаунт, щоб видалити його.'},{status:401});
 const config=wayForPayConfig(),appUrl=canonicalAppUrl(config.appBaseUrl,config.mode==='sandbox');
 if(!appUrl)return Response.json({error:'Видалення тимчасово недоступне: серверний APP_BASE_URL не налаштовано.'},{status:503});
 if(!sameOriginBillingRequest(req,appUrl))return Response.json({error:'Запит відхилено.'},{status:403});
 let body:{password?:unknown;confirmation?:unknown};
 try{body=await req.json() as {password?:unknown;confirmation?:unknown}}catch{return Response.json({error:'Некоректний запит.'},{status:400})}
 if(body.confirmation!=='ВИДАЛИТИ'||typeof body.password!=='string'||body.password.length<1||body.password.length>1024)return Response.json({error:'Підтвердіть видалення й введіть пароль.'},{status:400});
 try{await verifyUser(user.email,body.password)}catch{return Response.json({error:'Неправильний пароль. Акаунт не видалено.'},{status:401})}
 try{await deleteAccountData(user);return Response.json({ok:true,message:'Акаунт і дані Sift видалено. Регулярні платежі скасовано.'},{headers:{'Set-Cookie':sessionCookie('',0),'Cache-Control':'no-store'}})}
 catch(error){return Response.json({error:error instanceof Error?error.message:'Не вдалося видалити акаунт. Дані збережено.'},{status:409})}
}
