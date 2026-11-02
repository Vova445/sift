import type {PaidPlan} from './plan-catalog.js';
export function canonicalAppUrl(value:unknown,sandbox?:boolean):URL|null;
export function sameOriginBillingRequest(req:Request,appUrl:URL):boolean;
export function checkoutDescriptor(body:unknown,userId:string,reference:string,orderDate:number,appUrl:URL):{userId:string;plan:PaidPlan;amount:number;details:{label:string;uah:number;usd:string;credits:number;days:number};returnUrl:string;serviceUrl:string;orderDate:number}|null;
export function merchantDomainMatches(domain:unknown,appUrl:URL):boolean;
