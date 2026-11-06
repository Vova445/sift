import {env} from 'cloudflare:workers';
import {ensureDb} from './db';

const d1=()=> (env as unknown as {DB:D1Database}).DB;
let ready:Promise<void>|null=null;
export async function ensureSupportToolsDb(){
  await ensureDb();
  if(!ready)ready=(async()=>{
    await d1().prepare(`CREATE TABLE IF NOT EXISTS support_feature_flags(flag_key TEXT PRIMARY KEY,enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),description TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)`).run();
    await d1().prepare(`CREATE TABLE IF NOT EXISTS support_audit_log(id TEXT PRIMARY KEY,actor_user_id TEXT NOT NULL,action TEXT NOT NULL,target_user_id TEXT,order_reference TEXT,details_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL)`).run();
    await d1().prepare(`CREATE INDEX IF NOT EXISTS idx_support_audit_created ON support_audit_log(created_at DESC)`).run();
    await d1().prepare(`CREATE INDEX IF NOT EXISTS idx_support_audit_target ON support_audit_log(target_user_id,created_at DESC)`).run();
    await d1().prepare(`CREATE TABLE IF NOT EXISTS support_refunds(id TEXT PRIMARY KEY,order_reference TEXT NOT NULL,actor_user_id TEXT NOT NULL,amount_uah INTEGER NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('processing','pending','refunded','declined','failed')),provider_reason_code TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`).run();
    await d1().prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_support_refunds_one_open_per_order ON support_refunds(order_reference) WHERE status IN ('processing','pending','refunded')`).run();
    await d1().prepare(`CREATE INDEX IF NOT EXISTS idx_support_refunds_order_created ON support_refunds(order_reference,created_at DESC)`).run();
    const now='1970-01-01T00:00:00.000Z';
    await d1().batch([
      d1().prepare(`INSERT OR IGNORE INTO support_feature_flags(flag_key,enabled,description,updated_at,updated_by) VALUES('ai_translation',1,'AI-переклад доказів у звітах',?,'system')`).bind(now),
      d1().prepare(`INSERT OR IGNORE INTO support_feature_flags(flag_key,enabled,description,updated_at,updated_by) VALUES('email_reminders',1,'Email-нагадування про дедлайни',?,'system')`).bind(now),
      d1().prepare(`INSERT OR IGNORE INTO support_feature_flags(flag_key,enabled,description,updated_at,updated_by) VALUES('tos_monitoring',1,'Щотижневе відстеження змін умов для Pro',?,'system')`).bind(now),
      d1().prepare(`INSERT OR IGNORE INTO support_feature_flags(flag_key,enabled,description,updated_at,updated_by) VALUES('subscription_radar',1,'Імпорт підписок із пересланих чеків',?,'system')`).bind(now),
      d1().prepare(`INSERT OR IGNORE INTO support_feature_flags(flag_key,enabled,description,updated_at,updated_by) VALUES('dark_pattern_detector',1,'AI-детектор темних патернів у скриншотах',?,'system')`).bind(now),
    ]);
  })();
  return ready;
}

export async function featureFlagEnabled(key:'ai_translation'|'email_reminders'|'tos_monitoring'|'subscription_radar'|'dark_pattern_detector'){
  await ensureSupportToolsDb();
  const row=await d1().prepare(`SELECT enabled FROM support_feature_flags WHERE flag_key=?`).bind(key).first<{enabled:number}>();
  return row?row.enabled===1:true;
}

export async function writeSupportAudit(input:{actorUserId:string;action:string;targetUserId?:string|null;orderReference?:string|null;details?:Record<string,unknown>}){
  await ensureSupportToolsDb();
  await d1().prepare(`INSERT INTO support_audit_log(id,actor_user_id,action,target_user_id,order_reference,details_json,created_at) VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),input.actorUserId,input.action,input.targetUserId||null,input.orderReference||null,JSON.stringify(input.details||{}),new Date().toISOString()).run();
}
