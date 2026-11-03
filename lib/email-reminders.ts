import {env} from 'cloudflare:workers';
import {ensureDb,accessFor} from './db';
import {canonicalAppUrl} from './billing-security.js';
import {kyivDate,reminderDaysBefore,validUnsubscribeToken} from './email-reminder-policy.js';

const encoder=new TextEncoder();
const RETRY_MS=60*60*1000;
const MAX_ATTEMPTS=8;
let schemaReady:Promise<void>|null=null;
const config=()=>env as unknown as Record<string,string|undefined>;
const digest=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const randomToken=()=>{const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')};
const htmlEscape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

export async function ensureEmailReminderDb(){
  await ensureDb();
  if(!schemaReady)schemaReady=(async()=>{
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS email_reminder_preferences(user_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),updated_at TEXT NOT NULL)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS email_reminder_unsubscribe_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,created_at TEXT NOT NULL,used_at TEXT)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_email_reminder_unsubscribe_user ON email_reminder_unsubscribe_tokens(user_id,created_at DESC)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS email_reminder_deliveries(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,watchlist_id TEXT NOT NULL,review_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent')),attempts INTEGER NOT NULL DEFAULT 0,last_attempt_at TEXT,lease_until TEXT,sent_at TEXT,last_error TEXT,created_at TEXT NOT NULL,UNIQUE(watchlist_id,review_at))`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_email_reminder_delivery_retry ON email_reminder_deliveries(status,last_attempt_at,lease_until)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_email_reminder_delivery_user ON email_reminder_deliveries(user_id,created_at DESC)`).run();
  })();
  return schemaReady;
}

function deliveryConfig(){
  const values=config(),app=canonicalAppUrl(values.APP_BASE_URL,values.WAYFORPAY_MODE==='sandbox');
  return{apiKey:values.RESEND_API_KEY||'',from:values.AUTH_EMAIL_FROM||values.DUNNING_FROM_EMAIL||'',app};
}

export async function getEmailReminderPreferences(userId:string){
  await ensureEmailReminderDb();
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO email_reminder_preferences(user_id,enabled,updated_at) VALUES(?,1,?)`).bind(userId,now).run();
  const row=await env.DB.prepare(`SELECT enabled FROM email_reminder_preferences WHERE user_id=?`).bind(userId).first<{enabled:number}>();
  const delivery=deliveryConfig();
  return{enabled:row?.enabled===1,configured:!!(delivery.apiKey&&delivery.from&&delivery.app),daysBefore:reminderDaysBefore(config().EMAIL_REMINDER_DAYS_BEFORE)};
}

export async function setEmailReminderPreferences(userId:string,enabled:boolean){
  await ensureEmailReminderDb();
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO email_reminder_preferences(user_id,enabled,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at`).bind(userId,enabled?1:0,now).run();
  return getEmailReminderPreferences(userId);
}

export async function unsubscribeEmailReminders(token:unknown){
  await ensureEmailReminderDb();
  if(!validUnsubscribeToken(token))return false;
  const tokenHash=await digest(token);
  const row=await env.DB.prepare(`SELECT user_id FROM email_reminder_unsubscribe_tokens WHERE token_hash=?`).bind(tokenHash).first<{user_id:string}>();
  if(!row)return false;
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO email_reminder_preferences(user_id,enabled,updated_at) VALUES(?,0,?)`).bind(row.user_id,now),
    env.DB.prepare(`UPDATE email_reminder_preferences SET enabled=0,updated_at=? WHERE user_id=?`).bind(now,row.user_id),
    env.DB.prepare(`UPDATE email_reminder_unsubscribe_tokens SET used_at=COALESCE(used_at,?) WHERE token_hash=?`).bind(now,tokenHash),
  ]);
  return true;
}

type ReminderRow={id:string;user_id:string;watchlist_id:string;review_at:string;title:string;email:string};

async function sendReminder(row:ReminderRow,deliveryId:string,apiKey:string,from:string,app:URL){
  const token=randomToken(),tokenHash=await digest(token),now=new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO email_reminder_unsubscribe_tokens(token_hash,user_id,created_at) VALUES(?,?,?)`).bind(tokenHash,row.user_id,now).run();
  const unsubscribe=new URL('/api/email-reminders/unsubscribe',app);unsubscribe.searchParams.set('token',token);
  const dashboard=new URL('/dashboard',app),deadline=new Date(`${row.review_at}T12:00:00.000Z`).toLocaleDateString('uk-UA',{dateStyle:'long',timeZone:'Europe/Kyiv'});
  const title=htmlEscape(row.title),date=htmlEscape(deadline),unsubscribeUrl=htmlEscape(unsubscribe.toString()),dashboardUrl=htmlEscape(dashboard.toString());
  const subjectTitle=row.title.replace(/[\r\n\t]+/g,' ').trim().slice(0,72)||'збережена дата';
  const subject=`Нагадування Sift: ${subjectTitle}`;
  const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#11150f"><p style="font-size:12px;letter-spacing:2px;font-weight:bold">SIFT · PRO PLANNER</p><h1 style="font-size:26px">Наближається ваша важлива дата</h1><p>Ви зберегли нагадування для <strong>${title}</strong>.</p><p>Дата: <strong>${date}</strong>. Перевірте умови продовження, скасування чи повернення на сторінці продавця.</p><p><a href="${dashboardUrl}" style="display:inline-block;background:#b7f55f;color:#11150f;text-decoration:none;padding:14px 18px;border-radius:8px;font-weight:bold">Відкрити Planner</a></p><p style="font-size:12px;color:#697168">Це нагадування створене за датою, яку ви вказали в Sift. Воно не підтверджує умови продавця.</p><p style="font-size:12px"><a href="${unsubscribeUrl}" style="color:#4a44b6">Відписатися від email-нагадувань</a></p></div>`;
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`sift-reminder-${deliveryId}`},body:JSON.stringify({from,to:[row.email],subject,html,headers:{'List-Unsubscribe':`<${unsubscribe.toString()}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}})});
  if(!response.ok){const body=await response.text();throw new Error(`Resend HTTP ${response.status}: ${body.slice(0,220)}`)}
  return now;
}

export async function processEmailReminders(now=new Date()){
  await ensureEmailReminderDb();
  const values=config(),daysBefore=reminderDaysBefore(values.EMAIL_REMINDER_DAYS_BEFORE),today=kyivDate(now);
  const lastDate=new Date(Date.parse(`${today}T00:00:00.000Z`)+daysBefore*86_400_000).toISOString().slice(0,10);
  const due=await env.DB.prepare(`SELECT w.id,w.user_id,w.review_at,s.title,u.email FROM watchlist w JOIN scans s ON s.id=w.scan_id JOIN users u ON u.id=w.user_id JOIN email_verification_status v ON v.user_id=u.id LEFT JOIN email_reminder_preferences p ON p.user_id=w.user_id WHERE w.review_at>=? AND w.review_at<=? AND w.status!='rejected' AND COALESCE(p.enabled,1)=1 ORDER BY w.review_at,w.updated_at LIMIT 100`).bind(today,lastDate).all<ReminderRow>();
  const rows=due.results||[];
  if(!rows.length)return{due:0,sent:0,failed:0,skipped:0,email:'no_due_reminders'};
  const {apiKey,from,app}=deliveryConfig();
  if(!apiKey||!from||!app)return{due:rows.length,sent:0,failed:0,skipped:0,email:'not_configured'};

  let sent=0,failed=0,skipped=0,exhausted=0;
  for(const row of rows){
    const access=await accessFor(row.user_id);
    if(access.plan!=='pro'){skipped++;continue}
    const nowIso=new Date().toISOString(),retryBefore=new Date(now.getTime()-RETRY_MS).toISOString(),leaseUntil=new Date(now.getTime()+RETRY_MS).toISOString(),id=crypto.randomUUID();
    await env.DB.prepare(`INSERT OR IGNORE INTO email_reminder_deliveries(id,user_id,watchlist_id,review_at,created_at) VALUES(?,?,?,?,?)`).bind(id,row.user_id,row.id,row.review_at,nowIso).run();
    const existing=await env.DB.prepare(`SELECT id,status,attempts FROM email_reminder_deliveries WHERE watchlist_id=? AND review_at=?`).bind(row.id,row.review_at).first<{id:string;status:string;attempts:number}>();
    if(!existing||existing.status==='sent'){skipped++;continue}
    if(existing.attempts>=MAX_ATTEMPTS){skipped++;exhausted++;continue}
    const claim=await env.DB.prepare(`UPDATE email_reminder_deliveries SET status='sending',attempts=attempts+1,last_attempt_at=?,lease_until=?,last_error=NULL WHERE id=? AND status!='sent' AND attempts<? AND (status!='sending' OR lease_until IS NULL OR lease_until<=?) AND (last_attempt_at IS NULL OR last_attempt_at<=?)`).bind(nowIso,leaseUntil,existing.id,MAX_ATTEMPTS,nowIso,retryBefore).run();
    if(!(claim.meta?.changes||0)){skipped++;continue}
    try{
      const stillDue=await env.DB.prepare(`SELECT w.review_at,p.enabled FROM watchlist w LEFT JOIN email_reminder_preferences p ON p.user_id=w.user_id WHERE w.id=? AND w.user_id=? AND w.status!='rejected'`).bind(row.id,row.user_id).first<{review_at:string;enabled:number|null}>();
      if(!stillDue||stillDue.review_at!==row.review_at||stillDue.enabled===0){await env.DB.prepare(`UPDATE email_reminder_deliveries SET status='pending',lease_until=NULL WHERE id=?`).bind(existing.id).run();skipped++;continue}
      const sentAt=await sendReminder(row,existing.id,apiKey,from,app);
      await env.DB.prepare(`UPDATE email_reminder_deliveries SET status='sent',sent_at=?,lease_until=NULL,last_error=NULL WHERE id=? AND status='sending'`).bind(sentAt,existing.id).run();sent++;
    }catch(error){
      const message=error instanceof Error?error.message.slice(0,300):'Email delivery failed';
      await env.DB.prepare(`UPDATE email_reminder_deliveries SET status='pending',lease_until=NULL,last_error=? WHERE id=? AND status='sending'`).bind(message,existing.id).run();failed++;
    }
  }
  return{due:rows.length,sent,failed,skipped,exhausted,email:'configured'};
}
