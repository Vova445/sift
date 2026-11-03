import {env} from 'cloudflare:workers';
import {ensureDb} from './db';

export type FunnelStage='visit'|'analyze'|'signup'|'paywall'|'pay';
const SESSION_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let ready:Promise<void>|null=null;

export async function ensureFunnelAnalyticsDb(){
  if(!ready)ready=(async()=>{
    await ensureDb();
    try{await env.DB.prepare('ALTER TABLE payment_orders ADD COLUMN analytics_session_hash TEXT').run()}catch{}
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      session_hash TEXT NOT NULL,
      stage TEXT NOT NULL CHECK(stage IN ('visit','analyze','signup','paywall','pay')),
      created_at TEXT NOT NULL,
      UNIQUE(session_hash,stage)
    )`).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at)').run();
  })();
  return ready;
}

export async function recordFunnelEventSafely(value:unknown,stage:FunnelStage){
  try{return await recordFunnelEvent(value,stage)}catch(error){console.error('[funnel-analytics] event write failed',error instanceof Error?error.message:'unknown error');return false}
}

export async function hashFunnelSession(value:unknown):Promise<string|null>{
  if(typeof value!=='string'||!SESSION_ID.test(value))return null;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function recordFunnelEvent(value:unknown,stage:FunnelStage){
  const sessionHash=await hashFunnelSession(value);
  if(!sessionHash)return false;
  return recordFunnelEventByHash(sessionHash,stage);
}

export async function recordFunnelEventByHash(sessionHash:string|null|undefined,stage:FunnelStage){
  if(!sessionHash||! /^[a-f\d]{64}$/i.test(sessionHash))return false;
  await ensureFunnelAnalyticsDb();
  await env.DB.prepare('INSERT OR IGNORE INTO analytics_events(id,session_hash,stage,created_at) VALUES(?,?,?,?)')
    .bind(crypto.randomUUID(),sessionHash,stage,new Date().toISOString()).run();
  return true;
}
