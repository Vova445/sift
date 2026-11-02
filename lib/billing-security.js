import {isPaidPlan,planDetails} from './plan-catalog.js';

export function canonicalAppUrl(value,sandbox=false){
  if(typeof value!=='string'||!value.trim())return null;
  try{
    const url=new URL(value);
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)return null;
    if(url.protocol!=='https:'&&!(sandbox&&local&&url.protocol==='http:'))return null;
    return url;
  }catch{return null;}
}

export function sameOriginBillingRequest(req,appUrl){
  const origin=req.headers.get('origin');
  if(!origin)return false;
  try{return new URL(origin).origin===appUrl.origin;}catch{return false;}
}

/** Build checkout identity and prices only from the authenticated session and server catalog. */
export function checkoutDescriptor(body,userId,reference,orderDate,appUrl){
  if(!isPaidPlan(body?.plan)||typeof userId!=='string'||!userId)return null;
  const plan=body.plan,details=planDetails(plan);
  return{
    userId,plan,amount:details.uah,details,
    returnUrl:`${appUrl.origin}/?payment=${encodeURIComponent(reference)}&plan=${plan}#pricing`,
    serviceUrl:`${appUrl.origin}/api/billing/wayforpay/callback`,
    orderDate
  };
}

export function merchantDomainMatches(domain,appUrl){
  return typeof domain==='string'&&domain.length<=253&&!domain.includes('/')&&!domain.includes(':')&&domain.toLowerCase()===appUrl.hostname.toLowerCase();
}
