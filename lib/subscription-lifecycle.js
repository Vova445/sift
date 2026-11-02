const allowed={
  trialing:['active','past_due','canceled','expired'],
  active:['past_due','canceled','expired'],
  past_due:['active','canceled','expired'],
  canceled:['expired'],
  expired:[],
};

export function canTransition(from,to){return from===to||allowed[from].includes(to)}
export function entitlementActive(status,periodEnd,now=Date.now(),graceUntil=null){
  if(status==='past_due')return Number.isFinite(Date.parse(graceUntil||''))&&Date.parse(graceUntil)>now;
  return ['trialing','active','canceled'].includes(status)&&Number.isFinite(Date.parse(periodEnd))&&Date.parse(periodEnd)>now;
}
export function statusAtPeriodEnd(status,periodEnd,now=Date.now()){
  return Date.parse(periodEnd)<=now&&status!=='expired'?'expired':status;
}
export function gracePeriodEnd(failedAt,paidThrough){
  const failed=Date.parse(failedAt),period=Date.parse(paidThrough);
  if(!Number.isFinite(failed)||!Number.isFinite(period))throw new Error('Invalid failed-payment date');
  return new Date(Math.max(failed,period)+7*24*60*60*1000);
}
export function addCalendarMonth(from){
  const next=new Date(from),day=next.getDate();next.setDate(1);next.setMonth(next.getMonth()+1);
  next.setDate(Math.min(day,new Date(next.getFullYear(),next.getMonth()+1,0).getDate()));return next;
}
export function wayForPayDate(date){return `${String(date.getDate()).padStart(2,'0')}.${String(date.getMonth()+1).padStart(2,'0')}.${date.getFullYear()}`}
