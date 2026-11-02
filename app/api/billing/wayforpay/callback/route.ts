import {ackSignature,callbackSignatureFields,getPaymentOrder,providerAmountMatches,setPaymentStatus,wayForPayConfig,signatureMatches,type WayForPayPayload} from '../../../../../lib/wayforpay';

export async function POST(req:Request){
  const config=wayForPayConfig();let data:WayForPayPayload;
  try{data=await req.json() as WayForPayPayload}catch{return Response.json({error:'Invalid callback'},{status:400})}
  const reference=typeof data.orderReference==='string'?data.orderReference:'';
  if(!config.merchantAccount||data.merchantAccount!==config.merchantAccount||!reference||!signatureMatches(callbackSignatureFields(data),data.merchantSignature))return Response.json({error:'Invalid signature'},{status:401});
  const order=await getPaymentOrder(reference);
  if(!order||!providerAmountMatches(order,data.amount,data.currency))return Response.json({error:'Order mismatch'},{status:400});
  if(data.transactionStatus==='Approved')await setPaymentStatus(order,'paid');
  else if(data.transactionStatus==='Declined'&&order.status==='pending')await setPaymentStatus(order,'declined');
  const time=Math.floor(Date.now()/1000),status='accept';
  return Response.json({orderReference:reference,status,time,signature:ackSignature(reference,status,time)});
}
