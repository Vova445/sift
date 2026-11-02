import {env} from 'cloudflare:workers';
import {ensureEmailVerificationDb} from './email-verification';
import {newPasswordCredentials} from './auth';
import {allowPasswordResetRequest,ensurePasswordSecurityDb} from './auth-rate-limit';
import {canonicalAppUrl} from './billing-security.js';
import {wayForPayConfig} from './wayforpay';
import {RESET_TOKEN_TTL_MS} from './password-security-policy.js';

const enc=new TextEncoder();
const vars=()=>env as unknown as Record<string,string|undefined>;
const randomToken=()=>{const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')};
const digest=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');

export async function requestPasswordReset(req:Request,email:string):Promise<boolean>{
  await ensurePasswordSecurityDb();
  const normalized=email.trim().toLowerCase();
  if(normalized.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))return true;
  if(!await allowPasswordResetRequest(req,normalized))return false;
  const user=await env.DB.prepare(`SELECT id,email FROM users WHERE email=?`).bind(normalized).first<{id:string;email:string}>();
  if(!user)return true;
  const config=vars(),apiKey=config.RESEND_API_KEY||'',from=config.AUTH_EMAIL_FROM||config.DUNNING_FROM_EMAIL||'',billing=wayForPayConfig(),app=canonicalAppUrl(billing.appBaseUrl,billing.mode==='sandbox');
  if(!apiKey||!from||!app)return true;
  const now=new Date(),nowIso=now.toISOString(),token=randomToken(),tokenHash=await digest(token),expires=new Date(now.getTime()+RESET_TOKEN_TTL_MS).toISOString();
  await env.DB.prepare(`INSERT INTO password_reset_tokens(token_hash,user_id,expires_at,created_at,used_at) VALUES(?,?,?,?,NULL)`).bind(tokenHash,user.id,expires,nowIso).run();
  const link=new URL('/reset-password',app);link.hash=`token=${encodeURIComponent(token)}`;
  try{
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`sift-password-reset-${tokenHash}`},body:JSON.stringify({from,to:[user.email],subject:'Скиньте пароль до акаунта Sift',html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#11150f"><p style="font-size:12px;letter-spacing:2px;font-weight:bold">SIFT · БЕЗПЕКА АКАУНТА</p><h1 style="font-size:26px">Створіть новий пароль</h1><p>Ми отримали запит на скидання пароля. Посилання одноразове й діє одну годину. Після зміни пароля всі активні сесії буде завершено.</p><p><a href="${link.toString()}" style="display:inline-block;background:#b7f55f;color:#11150f;text-decoration:none;padding:14px 18px;border-radius:8px;font-weight:bold">Скинути пароль</a></p><p style="font-size:12px;color:#697168">Якщо це були не ви, проігноруйте лист — пароль не зміниться.</p></div>`})});
    if(!response.ok)throw new Error(`Resend HTTP ${response.status}`);
    await env.DB.prepare(`UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND token_hash<>? AND used_at IS NULL`).bind(new Date().toISOString(),user.id,tokenHash).run();
  }catch{await env.DB.prepare(`UPDATE password_reset_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL`).bind(new Date().toISOString(),tokenHash).run()}
  return true;
}

export async function resetPasswordWithToken(token:unknown,password:unknown){
  await ensureEmailVerificationDb();
  await ensurePasswordSecurityDb();
  if(typeof token!=='string'||token.length<32||token.length>200)return{ok:false as const,reason:'invalid' as const};
  if(typeof password!=='string'||password.length<8||password.length>1024)return{ok:false as const,reason:'password' as const};
  const tokenHash=await digest(token),row=await env.DB.prepare(`SELECT user_id,expires_at,used_at FROM password_reset_tokens WHERE token_hash=?`).bind(tokenHash).first<{user_id:string;expires_at:string;used_at:string|null}>();
  if(!row)return{ok:false as const,reason:'invalid' as const};
  if(row.used_at)return{ok:false as const,reason:'used' as const};
  const now=new Date(),nowIso=now.toISOString(),consumedAt=`${nowIso}:${crypto.randomUUID()}`;
  if(Date.parse(row.expires_at)<=now.getTime())return{ok:false as const,reason:'expired' as const};
  const credentials=await newPasswordCredentials(password);
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE password_reset_tokens SET used_at=? WHERE token_hash=? AND user_id=? AND used_at IS NULL AND expires_at>?`).bind(consumedAt,tokenHash,row.user_id,nowIso),
    env.DB.prepare(`UPDATE users SET password_hash=?,salt=?,password_iterations=? WHERE id=? AND EXISTS(SELECT 1 FROM password_reset_tokens WHERE token_hash=? AND user_id=? AND used_at=?)`).bind(credentials.passwordHash,credentials.salt,credentials.passwordIterations,row.user_id,tokenHash,row.user_id,consumedAt),
    env.DB.prepare(`DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM password_reset_tokens WHERE token_hash=? AND user_id=? AND used_at=?)`).bind(row.user_id,tokenHash,row.user_id,consumedAt)
  ]);
  if((results[0]?.meta?.changes||0)!==1||(results[1]?.meta?.changes||0)!==1)return{ok:false as const,reason:'used' as const};
  return{ok:true as const};
}
