import {env} from 'cloudflare:workers';
import {ensureDb} from './db';

export type BillingEventStatus='processed'|'ignored'|'rejected'|'failed';
export type BillingEventInput={
  eventKey:string;
  orderReference:string|null;
  eventType:string;
  data:Record<string,unknown>;
};

function safeJson(value:Record<string,unknown>){
  const allowed=['merchantAccount','orderReference','amount','currency','transactionStatus','reasonCode','authCode'];
  const clean:Record<string,string|number|null>={};
  for(const key of allowed){const item=value[key];if(typeof item==='number'&&Number.isFinite(item))clean[key]=item;else if(typeof item==='string')clean[key]=item.slice(0,key==='orderReference'?180:100);else clean[key]=null}
  return JSON.stringify(clean);
}

export async function logInvalidBillingEvent(input:BillingEventInput,error:string){
  await ensureDb();const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO billing_events(event_key,provider,order_reference,event_type,signature_valid,processing_status,attempts,event_data_json,error_message,received_at,updated_at,processed_at) VALUES(?,'wayforpay',?,?,0,'rejected',1,?,?,?, ?,?) ON CONFLICT(event_key) DO UPDATE SET attempts=billing_events.attempts+1,error_message=excluded.error_message,updated_at=excluded.updated_at,received_at=excluded.received_at`).bind(input.eventKey,input.orderReference,input.eventType,safeJson(input.data),error.slice(0,300),now,now,now).run();
}

export async function claimBillingEvent(input:BillingEventInput){
  await ensureDb();const now=new Date(),nowText=now.toISOString(),leaseId=crypto.randomUUID(),leaseUntil=new Date(now.getTime()+90_000).toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO billing_events(event_key,provider,order_reference,event_type,signature_valid,processing_status,attempts,event_data_json,received_at,updated_at) VALUES(?,'wayforpay',?,?,1,'received',0,?,?,?)`).bind(input.eventKey,input.orderReference,input.eventType,safeJson(input.data),nowText,nowText).run();
  const claim=await env.DB.prepare(`UPDATE billing_events SET processing_status='processing',attempts=attempts+1,lease_id=?,lease_until=?,error_message=NULL,updated_at=? WHERE event_key=? AND signature_valid=1 AND (processing_status IN ('received','failed') OR (processing_status='processing' AND lease_until<?))`).bind(leaseId,leaseUntil,nowText,input.eventKey,nowText).run();
  if((claim.meta?.changes||0)>0)return {kind:'claimed' as const,leaseId};
  const existing=await env.DB.prepare(`SELECT processing_status FROM billing_events WHERE event_key=?`).bind(input.eventKey).first<{processing_status:string}>();
  return existing&&['processed','ignored','rejected'].includes(existing.processing_status)?{kind:'duplicate' as const}:{kind:'busy' as const};
}

export async function finishBillingEvent(eventKey:string,leaseId:string,status:BillingEventStatus,error?:string){
  await ensureDb();const now=new Date().toISOString();
  const result=await env.DB.prepare(`UPDATE billing_events SET processing_status=?,error_message=?,lease_id=NULL,lease_until=NULL,updated_at=?,processed_at=? WHERE event_key=? AND processing_status='processing' AND lease_id=?`).bind(status,error?.slice(0,300)||null,now,now,eventKey,leaseId).run();
  return (result.meta?.changes||0)>0;
}
