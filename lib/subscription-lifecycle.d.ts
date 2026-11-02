export type SubscriptionStatus='trialing'|'active'|'past_due'|'canceled'|'expired';
export function canTransition(from:SubscriptionStatus,to:SubscriptionStatus):boolean;
export function entitlementActive(status:SubscriptionStatus,periodEnd:string,now?:number,graceUntil?:string|null):boolean;
export function statusAtPeriodEnd(status:SubscriptionStatus,periodEnd:string,now?:number):SubscriptionStatus;
export function gracePeriodEnd(failedAt:string,paidThrough:string):Date;
export function addCalendarMonth(from:Date):Date;
export function wayForPayDate(date:Date):string;
