import {env} from 'cloudflare:workers';
import {ensureTranslationDb} from './db';
import {buildHistoryCsv} from './history-csv';
import {ensureEmailReminderDb} from './email-reminders';
import {ensureDomainIndexDb} from './domain-index';

type ScanRow={id:string;url:string;title:string;score:number;result_json:string;created_at:string;translation_plan:string|null};

export async function accountExport(userId:string){
  await Promise.all([ensureTranslationDb(),ensureEmailReminderDb(),ensureDomainIndexDb()]);
  const [user,verification,scans,notes,subscriptions,payments,legalAcceptances,emailReminderPreferences,domainIndexConsent,domainCorrectionRequests,sharedSpaces,sharedItems,sharedSpacePayments,sharedSpaceLegalAcceptances,developerApiKeys,telegramAccount,telegramGroups]=await Promise.all([
    env.DB.prepare(`SELECT email,created_at FROM users WHERE id=?`).bind(userId).first<{email:string;created_at:string}>(),
    env.DB.prepare(`SELECT verified_at FROM email_verification_status WHERE user_id=?`).bind(userId).first<{verified_at:string}>(),
    env.DB.prepare(`SELECT id,url,title,score,result_json,created_at,translation_plan FROM scans WHERE user_id=? ORDER BY created_at DESC`).bind(userId).all<ScanRow>(),
    env.DB.prepare(`SELECT w.id,w.scan_id,w.status,w.note,w.review_at,w.created_at,w.updated_at,s.title,s.url FROM watchlist w LEFT JOIN scans s ON s.id=w.scan_id WHERE w.user_id=? ORDER BY w.updated_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT plan,status,credits,test_mode,created_at,expires_at,cancel_at_period_end,canceled_at,last_payment_at FROM subscriptions WHERE user_id=? ORDER BY created_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT order_reference,status,amount_uah,period_start,period_end,created_at,paid_at FROM subscription_payments WHERE user_id=? ORDER BY created_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT context,plan,order_reference,terms_version,privacy_version,refund_version,terms_accepted,privacy_acknowledged,refund_accepted,immediate_performance,accepted_at FROM legal_acceptances WHERE user_id=? ORDER BY accepted_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT enabled,updated_at FROM email_reminder_preferences WHERE user_id=?`).bind(userId).first<{enabled:number;updated_at:string}>(),
    env.DB.prepare(`SELECT enabled,agreed_at,updated_at FROM domain_index_consent WHERE user_id=?`).bind(userId).first<{enabled:number;agreed_at:string|null;updated_at:string}>(),
    env.DB.prepare(`SELECT domain,message,status,created_at FROM domain_correction_requests WHERE lower(contact_email)=lower((SELECT email FROM users WHERE id=?)) ORDER BY created_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT s.id,s.title,s.status,s.expires_at,s.created_at,m.role,m.joined_at FROM shared_space_members m JOIN shared_spaces s ON s.id=m.space_id WHERE m.user_id=? ORDER BY s.created_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT i.id,i.space_id,i.title,i.service_url,i.amount_minor,i.currency,i.next_charge_date,i.status,i.note,i.assigned_to_user_id,i.created_at,i.updated_at FROM shared_space_items i JOIN shared_space_members m ON m.space_id=i.space_id WHERE m.user_id=? ORDER BY i.next_charge_date,i.created_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT order_reference,space_id,amount_uah,status,test_mode,created_at,paid_at,period_start,period_end FROM shared_space_orders WHERE owner_user_id=? ORDER BY created_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT space_id,order_reference,terms_version,privacy_version,refund_version,accepted_at FROM shared_space_legal_acceptances WHERE user_id=? ORDER BY accepted_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT id,label,key_prefix,created_at,last_used_at,revoked_at FROM developer_api_keys WHERE user_id=? ORDER BY created_at DESC`).bind(userId).all(),
    env.DB.prepare(`SELECT telegram_username,first_name,linked_at,last_used_at FROM telegram_accounts WHERE user_id=?`).bind(userId).first(),
    env.DB.prepare(`SELECT chat_id,title,linked_at FROM telegram_group_authorizations WHERE owner_user_id=? ORDER BY linked_at DESC`).bind(userId).all(),
  ]);
  if(!user)throw new Error('Акаунт не знайдено.');
  const reports=(scans.results||[]).map(row=>{
    let result:Record<string,unknown>;
    try{const parsed=JSON.parse(row.result_json);result=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:({unparsedResult:row.result_json})}catch{result={unparsedResult:row.result_json}}
    return{...result,id:row.id,createdAt:row.created_at,translationPlan:row.translation_plan,title:typeof result.title==='string'?result.title:row.title,url:typeof result.url==='string'?result.url:row.url,score:Number.isFinite(result.score)?result.score:row.score,findings:Array.isArray(result.findings)?result.findings:[]};
  });
  const planner=notes.results||[];
  return{
    json:{format:'sift-account-export',version:1,exportedAt:new Date().toISOString(),account:{email:user.email,createdAt:user.created_at,emailVerified:Boolean(verification?.verified_at)},reports,planner,emailReminderPreferences:emailReminderPreferences?{enabled:emailReminderPreferences.enabled===1,updatedAt:emailReminderPreferences.updated_at}:null,domainIndexConsent:domainIndexConsent?{enabled:domainIndexConsent.enabled===1,agreedAt:domainIndexConsent.agreed_at,updatedAt:domainIndexConsent.updated_at}:null,domainCorrectionRequests:domainCorrectionRequests.results||[],subscriptions:subscriptions.results||[],payments:payments.results||[],legalAcceptances:legalAcceptances.results||[],sharedSpaces:sharedSpaces.results||[],sharedSpaceItems:sharedItems.results||[],sharedSpacePayments:sharedSpacePayments.results||[],sharedSpaceLegalAcceptances:sharedSpaceLegalAcceptances.results||[],developerApiKeys:developerApiKeys.results||[],telegramIntegration:telegramAccount?{...telegramAccount,groups:telegramGroups.results||[]}:null},
    csv:buildHistoryCsv(reports.map(report=>({id:String(report.id),createdAt:String(report.createdAt),result:report as {title:string;url:string;score:number;prices?:string[];verdict?:string;findings:Array<unknown>}})),planner as Array<{scan_id:string;status:string;note:string;review_at?:string|null}>)
  };
}
