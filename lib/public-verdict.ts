import {env} from 'cloudflare:workers';
import {evaluateClarity} from './analyzer-core.js';
import {isPublicVerdictToken,publicVerdictCard,type PublicVerdictCard} from './public-verdict-policy.js';
import {SITE_URL} from './seo';

type ShareRow=PublicVerdictCard&{token:string;created_at:string;revoked_at:string|null};
let schemaReady:Promise<void>|null=null;

export function publicVerdictOrigin(){
  const configured=(env as unknown as Record<string,string|undefined>).APP_BASE_URL;
  try{
    const url=new URL(configured||SITE_URL);
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)return SITE_URL;
    if(url.protocol==='https:'||(local&&url.protocol==='http:'))return url.origin;
  }catch{}
  return SITE_URL;
}

export async function ensurePublicVerdictDb(){
  if(!schemaReady)schemaReady=(async()=>{
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS public_verdict_shares (token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),decision TEXT NOT NULL CHECK(decision IN ('buy','wait','close')),created_at TEXT NOT NULL,revoked_at TEXT)`).run();
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_public_verdict_active_scan ON public_verdict_shares(user_id,scan_id) WHERE revoked_at IS NULL`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_public_verdict_user_created ON public_verdict_shares(user_id,created_at DESC)`).run();
  })();
  return schemaReady;
}

function newToken(){
  const bytes=new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}

function readSnapshot(resultJson:string){
  try{
    const result=JSON.parse(resultJson) as {findings?:unknown;prices?:unknown};
    const findings=Array.isArray(result.findings)?result.findings.filter((item):item is {kind:string}=>Boolean(item&&typeof item==='object'&&typeof (item as {kind?:unknown}).kind==='string')):[];
    const prices=Array.isArray(result.prices)?result.prices.filter((price):price is string=>typeof price==='string'):[];
    return evaluateClarity(findings,prices);
  }catch{return null}
}

export async function activePublicVerdictForUser(userId:string,scanId:string){
  await ensurePublicVerdictDb();
  return await env.DB.prepare(`SELECT token,score,decision,created_at,revoked_at FROM public_verdict_shares WHERE user_id=? AND scan_id=? AND revoked_at IS NULL`).bind(userId,scanId).first<ShareRow>()||null;
}

export async function createPublicVerdictForUser(userId:string,scanId:string){
  await ensurePublicVerdictDb();
  const scan=await env.DB.prepare(`SELECT result_json FROM scans WHERE id=? AND user_id=?`).bind(scanId,userId).first<{result_json:string}>();
  if(!scan)return null;
  const snapshot=readSnapshot(scan.result_json),card=publicVerdictCard(snapshot);
  if(!card)return null;
  const existing=await activePublicVerdictForUser(userId,scanId);
  if(existing)return existing;
  const token=newToken(),createdAt=new Date().toISOString();
  try{
    await env.DB.prepare(`INSERT INTO public_verdict_shares(token,user_id,scan_id,score,decision,created_at) VALUES(?,?,?,?,?,?)`).bind(token,userId,scanId,card.score,card.decision,createdAt).run();
  }catch{
    const raced=await activePublicVerdictForUser(userId,scanId);
    if(raced)return raced;
    throw new Error('Не вдалося створити публічну картку. Спробуйте ще раз.');
  }
  return {token,...card,created_at:createdAt,revoked_at:null} satisfies ShareRow;
}

export async function getPublicVerdict(token:string){
  if(!isPublicVerdictToken(token))return null;
  await ensurePublicVerdictDb();
  const row=await env.DB.prepare(`SELECT score,decision,created_at FROM public_verdict_shares WHERE token=? AND revoked_at IS NULL`).bind(token).first<{score:number;decision:string;created_at:string}>();
  const card=publicVerdictCard(row);
  return card;
}

export async function revokePublicVerdictForUser(userId:string,scanId:string){
  await ensurePublicVerdictDb();
  const now=new Date().toISOString();
  const result=await env.DB.prepare(`UPDATE public_verdict_shares SET revoked_at=? WHERE user_id=? AND scan_id=? AND revoked_at IS NULL`).bind(now,userId,scanId).run();
  return (result.meta?.changes||0)>0;
}
