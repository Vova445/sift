const allowed={
  trialing:['active','past_due','canceled','expired'],
  active:['past_due','canceled','expired'],
  past_due:['active','canceled','expired'],
  canceled:['expired'],
  expired:[],
};

export function canTransition(from,to){return from===to||allowed[from].includes(to)}
export function entitlementActive(status,periodEnd,now=Date.now()){
  return ['trialing','active','canceled'].includes(status)&&Number.isFinite(Date.parse(periodEnd))&&Date.parse(periodEnd)>now;
}
export function statusAtPeriodEnd(status,periodEnd,now=Date.now()){
  return Date.parse(periodEnd)<=now&&status!=='expired'?'expired':status;
}
export function addCalendarMonth(from){
  const next=new Date(from),day=next.getDate();next.setDate(1);next.setMonth(next.getMonth()+1);
  next.setDate(Math.min(day,new Date(next.getFullYear(),next.getMonth()+1,0).getDate()));return next;
}
export function wayForPayDate(date){return `${String(date.getDate()).padStart(2,'0')}.${String(date.getMonth()+1).padStart(2,'0')}.${date.getFullYear()}`}
