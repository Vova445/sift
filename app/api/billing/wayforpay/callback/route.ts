import {billingEventKey,wayForPayEventKey} from '../../../../../lib/billing-event-key';
import {claimBillingEvent,finishBillingEvent,logInvalidBillingEvent} from '../../../../../lib/billing-events';
import {ackSignature,callbackSignatureFields,getPaymentOrder,providerAmountMatches,setPaymentStatus,wayForPayConfig,signatureMatches,type WayForPayPayload} from '../../../../../lib/wayforpay';

const safeString=(value:unknown,max=100)=>typeof value==='string'?value.slice(0,max):'';

export async function POST(req:Request){
  const config=wayForPayConfig();let raw='';
  try{raw=await req.text()}catch{return Response.json({error:'Некоректне тіло callback.'},{status:400})}
  if(raw.length>65_536)return Response.json({error:'Callback завеликий.'},{status:413});
  let data:WayForPayPayload;
  try{const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('bad payload');data=parsed as WayForPayPayload}
  catch{
    try{await logInvalidBillingEvent({eventKey:billingEventKey(raw),orderReference:null,eventType:'malformed',data:{}},'Invalid JSON payload')}catch{}
    return Response.json({error:'Некоректний callback.'},{status:400});
  }

  const reference=safeString(data.orderReference,180),signature=data.merchantSignature;
  const valid=Boolean(config.merchantAccount&&data.merchantAccount===config.merchantAccount&&reference&&signatureMatches(callbackSignatureFields(data),signature));
  if(!valid){
    try{await logInvalidBillingEvent({eventKey:billingEventKey(raw),orderReference:reference||null,eventType:safeString(data.transactionStatus,100)||'invalid',data},'Invalid merchant or callback signature')}catch{}
    return Response.json({error:'Невірний підпис callback.'},{status:400});
  }
  if(!/^sift_[a-f\d]{32}$/i.test(reference)){
    const key=wayForPayEventKey(callbackSignatureFields(data),String(signature));
    try{await logInvalidBillingEvent({eventKey:key,orderReference:reference||null,eventType:safeString(data.transactionStatus,100)||'invalid',data},'Invalid order reference')}catch{}
    return Response.json({error:'Невірний номер замовлення.'},{status:400});
  }

  const eventKey=wayForPayEventKey(callbackSignatureFields(data),String(signature)),event={eventKey,orderReference:reference,eventType:safeString(data.transactionStatus,100)||'unknown',data};
  let claim:{kind:'claimed';leaseId:string}|{kind:'duplicate'}|{kind:'busy'};
  try{claim=await claimBillingEvent(event)}catch{return Response.json({error:'Тимчасова помилка журналу платежів. Повторіть callback.'},{status:503,headers:{'Retry-After':'5'}})}
  if(claim.kind==='duplicate')return accept(reference);
  if(claim.kind==='busy')return Response.json({error:'Подія вже обробляється. Повторіть пізніше.'},{status:503,headers:{'Retry-After':'5'}});

  try{
    const order=await getPaymentOrder(reference);
    if(!order||!providerAmountMatches(order,data.amount,data.currency)){
      await finishBillingEvent(eventKey,claim.leaseId,'rejected','Unknown order or amount/currency mismatch');
      return Response.json({error:'Замовлення або сума не збігається.'},{status:400});
    }
    if(data.transactionStatus==='Approved')await setPaymentStatus(order,'paid');
    else if(data.transactionStatus==='Declined'&&order.status==='pending')await setPaymentStatus(order,'declined');
    const finalStatus=data.transactionStatus==='Approved'||data.transactionStatus==='Declined'?'processed':'ignored';
    if(!await finishBillingEvent(eventKey,claim.leaseId,finalStatus))throw new Error('Could not finalize billing event');
    return accept(reference);
  }catch(error){
    try{await finishBillingEvent(eventKey,claim.leaseId,'failed',error instanceof Error?error.message:'Payment processing failed')}catch{}
    return Response.json({error:'Платіж тимчасово не оброблено. WayForPay може повторити подію.'},{status:500});
  }
}

function accept(reference:string){const time=Math.floor(Date.now()/1000),status='accept';return Response.json({orderReference:reference,status,time,signature:ackSignature(reference,status,time)})}
