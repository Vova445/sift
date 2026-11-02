import {currentUser} from '../../../../../lib/auth';
import {accessFor} from '../../../../../lib/db';
import {callbackSignatureFields,getPaymentOrder,planDetails,providerAmountMatches,setPaymentStatus,signatureMatches,wayForPayConfig} from '../../../../../lib/wayforpay';

export async function GET(req:Request){
  const user=await currentUser(req);if(!user)return Response.json({error:'Увійдіть в акаунт.'},{status:401});
  const reference=new URL(req.url).searchParams.get('reference')||'';if(!/^sift_[a-f\d]{32}$/.test(reference))return Response.json({error:'Некоректний номер платежу.'},{status:400});
  const order=await getPaymentOrder(reference,user.id);if(!order)return Response.json({error:'Платіж не знайдено.'},{status:404});
  if(order.status==='pending'&&Date.parse(order.expires_at)>Date.now()){
    const config=wayForPayConfig();if(!config.merchantAccount||!config.secret)return Response.json({error:'WayForPay не налаштовано.'},{status:503});
    const request={transactionType:'CHECK_STATUS',merchantAccount:config.merchantAccount,orderReference:reference,merchantSignature:(await import('node:crypto')).createHmac('md5',config.secret).update(`${config.merchantAccount};${reference}`).digest('hex'),apiVersion:1};
    try{
      const response=await fetch('https://api.wayforpay.com/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});
      if(response.ok){const status=await response.json() as Record<string,unknown>;
        if(status.merchantAccount===config.merchantAccount&&status.orderReference===reference&&providerAmountMatches(order,status.amount,status.currency)&&signatureMatches(callbackSignatureFields(status),status.merchantSignature)){
          if(status.transactionStatus==='Approved')await setPaymentStatus(order,'paid');
          else if(status.transactionStatus==='Declined')await setPaymentStatus(order,'declined');
        }
      }
    }catch{/* status remains pending; the signed service callback can still arrive */}
  }else if(order.status==='pending')await setPaymentStatus(order,'expired');
  const latest=await getPaymentOrder(reference,user.id),access=await accessFor(user.id);
  return Response.json({status:latest?.status||'pending',plan:latest?.plan,testMode:latest?.test_mode===1,access,price:latest?planDetails(latest.plan):undefined});
}
