import {env} from 'cloudflare:workers';
import {ensureDb} from './db';
import {canonicalAppUrl} from './billing-security.js';
import {wayForPayConfig} from './wayforpay';
import {RESEND_COOLDOWN_MS,RESEND_MAX_PER_WINDOW,RESEND_WINDOW_MS,VERIFICATION_TTL_MS} from './email-verification-policy.js';

const encoder=new TextEncoder();
const vars=()=>env as unknown as Record<string,string|undefined>;
const randomToken=()=>{const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')};
const digest=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
let schemaReady:Promise<void>|null=null;

export async function ensureEmailVerificationDb(){
  await ensureDb();
  if(!schemaReady)schemaReady=(async()=>{
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS email_verification_status(user_id TEXT PRIMARY KEY,verified_at TEXT NOT NULL)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS email_verification_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,used_at TEXT)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_email_verification_user_expiry ON email_verification_tokens(user_id,expires_at DESC)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS email_verification_limits(user_id TEXT PRIMARY KEY,window_started_at TEXT NOT NULL,sent_count INTEGER NOT NULL DEFAULT 0,last_sent_at TEXT)`).run();
  })();
  return schemaReady;
}

export async function sendVerificationEmail(user:{id:string;email:string}):Promise<{sent:boolean;reason?:'not_configured'|'rate_limited'|'send_failed'|'already_verified'}>{
  await ensureEmailVerificationDb();
  const verified=await env.DB.prepare(`SELECT verified_at FROM email_verification_status WHERE user_id=?`).bind(user.id).first<{verified_at:string}>();
  if(verified?.verified_at)return{sent:false,reason:'already_verified'};
  const config=vars(),apiKey=config.RESEND_API_KEY||'',from=config.AUTH_EMAIL_FROM||config.DUNNING_FROM_EMAIL||'',billing=wayForPayConfig(),app=canonicalAppUrl(billing.appBaseUrl,billing.mode==='sandbox');
  if(!apiKey||!from||!app)return{sent:false,reason:'not_configured'};
  const now=new Date(),nowIso=now.toISOString(),windowAgo=new Date(now.getTime()-RESEND_WINDOW_MS).toISOString(),cooldownAgo=new Date(now.getTime()-RESEND_COOLDOWN_MS).toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO email_verification_limits(user_id,window_started_at,sent_count,last_sent_at) VALUES(?,?,0,NULL)`).bind(user.id,nowIso).run();
  await env.DB.prepare(`UPDATE email_verification_limits SET window_started_at=?,sent_count=0,last_sent_at=NULL WHERE user_id=? AND window_started_at<=?`).bind(nowIso,user.id,windowAgo).run();
  const reserved=await env.DB.prepare(`UPDATE email_verification_limits SET sent_count=sent_count+1,last_sent_at=? WHERE user_id=? AND sent_count<? AND (last_sent_at IS NULL OR last_sent_at<=?)`).bind(nowIso,user.id,RESEND_MAX_PER_WINDOW,cooldownAgo).run();
  if(!(reserved.meta?.changes||0))return{sent:false,reason:'rate_limited'};

  const token=randomToken(),tokenHash=await digest(token),expires=new Date(now.getTime()+VERIFICATION_TTL_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE email_verification_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL`).bind(nowIso,user.id),
    env.DB.prepare(`INSERT INTO email_verification_tokens(token_hash,user_id,expires_at,created_at,used_at) VALUES(?,?,?,?,NULL)`).bind(tokenHash,user.id,expires,nowIso)
  ]);
  const link=new URL('/verify-email',app);link.hash=`token=${encodeURIComponent(token)}`;
  try{
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`sift-verify-${tokenHash}`},body:JSON.stringify({from,to:[user.email],subject:'Підтвердіть email для Sift',html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#11150f"><p style="font-size:12px;letter-spacing:2px;font-weight:bold">SIFT · БЕЗПЕКА АКАУНТА</p><h1 style="font-size:26px">Підтвердіть вашу адресу email</h1><p>Натисніть кнопку, щоб підтвердити адресу та відкрити платні можливості Sift. Посилання одноразове й діє 24 години.</p><p><a href="${link.toString()}" style="display:inline-block;background:#b7f55f;color:#11150f;text-decoration:none;padding:14px 18px;border-radius:8px;font-weight:bold">Підтвердити email</a></p><p style="font-size:12px;color:#697168">Якщо ви не створювали акаунт Sift, проігноруйте цей лист.</p></div>`})});
    if(!response.ok)throw new Error(`Resend HTTP ${response.status}`);
    return{sent:true};
  }catch{
    await env.DB.prepare(`UPDATE email_verification_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL`).bind(new Date().toISOString(),tokenHash).run();
    return{sent:false,reason:'send_failed'};
  }
}

export async function consumeVerificationToken(token:unknown){
  await ensureEmailVerificationDb();
  if(typeof token!=='string'||token.length<32||token.length>200)return{ok:false,reason:'invalid' as const};
  const tokenHash=await digest(token),now=new Date(),nowIso=now.toISOString();
  const row=await env.DB.prepare(`SELECT user_id,expires_at,used_at FROM email_verification_tokens WHERE token_hash=?`).bind(tokenHash).first<{user_id:string;expires_at:string;used_at:string|null}>();
  if(!row)return{ok:false,reason:'invalid' as const};
  if(row.used_at)return{ok:false,reason:'used' as const};
  if(Date.parse(row.expires_at)<=now.getTime())return{ok:false,reason:'expired' as const};
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE email_verification_tokens SET used_at=? WHERE token_hash=? AND user_id=? AND used_at IS NULL AND expires_at>?`).bind(nowIso,tokenHash,row.user_id,nowIso),
    env.DB.prepare(`INSERT INTO email_verification_status(user_id,verified_at) SELECT ?,? WHERE EXISTS(SELECT 1 FROM email_verification_tokens WHERE token_hash=? AND user_id=? AND used_at=?) ON CONFLICT(user_id) DO NOTHING`).bind(row.user_id,nowIso,tokenHash,row.user_id,nowIso)
  ]);
  if((results[0]?.meta?.changes||0)!==1)return{ok:false,reason:'used' as const};
  const verified=await env.DB.prepare(`SELECT verified_at FROM email_verification_status WHERE user_id=?`).bind(row.user_id).first<{verified_at:string}>();
  return verified?.verified_at?{ok:true as const,userId:row.user_id}:{ok:false,reason:'invalid' as const};
}

export async function verificationStatus(userId:string){
  await ensureEmailVerificationDb();
  const row=await env.DB.prepare(`SELECT verified_at FROM email_verification_status WHERE user_id=?`).bind(userId).first<{verified_at:string}>();
  return !!row?.verified_at;
}
