export type PaidPlan='one'|'pro';
export function isPaidPlan(value:unknown):value is PaidPlan;
export function planDetails(plan:PaidPlan):{label:string;uah:number;usd:string;credits:number;days:number};
