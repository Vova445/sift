import {env} from 'cloudflare:workers';
import {ensureTranslationDb} from './db';
import {buildHistoryCsv} from './history-csv';
import {ensureEmailReminderDb} from './email-reminders';

type ScanRow={id:string;url:string;title:string;score:number;result_json:string;created_at:string;translation_plan:string|null};

export async function accountExport(userId:string){
  await Promise.all([ensureTranslationDb(),ensureEmailReminderDb()]);
  const [user,verification,scans,notes,subscriptions,payments,legalAcceptances,emailReminderPreferences]=await Promise.all([
    env.DB.prepare(`SELECT email,created_at FROM users WHERE id=?`).bind(userId).first<{email:string;created_at:string}>(),
    env.DB.prepare(`SELECT verified_at FROM email_verification_status WHERE user_id=?`).bind(userId).first<{verified_at:string}>(),
    env.DB.prepare(`SELECT id,url,title,score,result_json,created_at,translation_plan FROM scans WHERE user_id=? ORDER BY created_at DESC`).bind(userId).all<ScanRow>(),
    env.DB.prepare(`SELECT w.id,w.scan_id,w.status,w.note,w.review_at,w.created_at,w.updated_at,s.title,s.url FROM watchlist w LEFT JOIN scans s ON s.id=w.scan_id WHERE w.user_id=? ORDER BY w.updated_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT plan,status,credits,test_mode,created_at,expires_at,cancel_at_period_end,canceled_at,last_payment_at FROM subscriptions WHERE user_id=? ORDER BY created_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT order_reference,status,amount_uah,period_start,period_end,created_at,paid_at FROM subscription_payments WHERE user_id=? ORDER BY created_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT context,plan,order_reference,terms_version,privacy_version,refund_version,terms_accepted,privacy_acknowledged,refund_accepted,immediate_performance,accepted_at FROM legal_acceptances WHERE user_id=? ORDER BY accepted_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT enabled,updated_at FROM email_reminder_preferences WHERE user_id=?`).bind(userId).first<{enabled:number;updated_at:string}>()
  ]);
  if(!user)throw new Error('Акаунт не знайдено.');
  const reports=(scans.results||[]).map(row=>{
    let result:Record<string,unknown>;
    try{const parsed=JSON.parse(row.result_json);result=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:({unparsedResult:row.result_json})}catch{result={unparsedResult:row.result_json}}
    return{...result,id:row.id,createdAt:row.created_at,translationPlan:row.translation_plan,title:typeof result.title==='string'?result.title:row.title,url:typeof result.url==='string'?result.url:row.url,score:Number.isFinite(result.score)?result.score:row.score,findings:Array.isArray(result.findings)?result.findings:[]};
  });
  const planner=notes.results||[];
  return{
    json:{format:'sift-account-export',version:1,exportedAt:new Date().toISOString(),account:{email:user.email,createdAt:user.created_at,emailVerified:Boolean(verification?.verified_at)},reports,planner,emailReminderPreferences:emailReminderPreferences?{enabled:emailReminderPreferences.enabled===1,updatedAt:emailReminderPreferences.updated_at}:null,subscriptions:subscriptions.results||[],payments:payments.results||[],legalAcceptances:legalAcceptances.results||[]},
    csv:buildHistoryCsv(reports.map(report=>({id:String(report.id),createdAt:String(report.createdAt),result:report as {title:string;url:string;score:number;prices?:string[];verdict?:string;findings:Array<unknown>}})),planner as Array<{scan_id:string;status:string;note:string;review_at?:string|null}>)
  };
}
