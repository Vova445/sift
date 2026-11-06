import {env} from 'cloudflare:workers';
import {currentUser} from '../../../lib/auth';
import {accessFor,claimTranslation,getCachedTranslation,releaseTranslation,releaseTranslationLock,reserveTranslation,saveCachedTranslation,scanFindingForTranslation} from '../../../lib/db';
import {guardFeature} from '../../../lib/entitlements';
import {aiCostConfig,estimatedInputTokens,estimatedOutputTokens,finishAiCall,reserveAiCall} from '../../../lib/ai-cost-control';
import {translationHash} from '../../../lib/ai-cost-policy.js';
import {rateLimitedResponse} from '../../../lib/request-rate-limit';
import {featureFlagEnabled} from '../../../lib/support-tools-db';
import {trackEvent} from '../../../lib/event-bus';

export async function POST(req:Request){
 let reservedDay:string|null=null;
 let userId:string|null=null;
 let aiReservation:Awaited<ReturnType<typeof reserveAiCall>>=null;
 let translationLease:string|null=null;
 let scanId='';
 let sourceHash='';
 let evidence='';
 let providerCalled=false;
  const utcRetryAfter=()=>Math.max(1,Math.ceil((Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),new Date().getUTCDate()+1)-Date.now())/1000));
 try{
  const user=await currentUser(req);
  if(!user)return Response.json({error:'Увійдіть для перекладу'},{status:401});
  if(!user.emailVerified)return Response.json({error:'Підтвердіть email, щоб користуватися платними можливостями.'},{status:403});
  if(!await featureFlagEnabled('ai_translation'))return Response.json({error:'AI-переклад тимчасово призупинено. Оригінальні докази залишаються доступними.'},{status:503});
  userId=user.id;
  let body:{scanId?:unknown;findingIndex?:unknown;targetLanguage?:unknown};
  try{body=await req.json() as {scanId?:unknown;findingIndex?:unknown;targetLanguage?:unknown}}catch{return Response.json({error:'Некоректний запит'},{status:400})}
  if(typeof body.scanId!=='string'||body.scanId.length>100||!Number.isInteger(body.findingIndex)||Number(body.findingIndex)<0||Number(body.findingIndex)>99)return Response.json({error:'Вкажіть збережений звіт і доказ для перекладу'},{status:400});
  const targetLanguage=body.targetLanguage===undefined?'ukrainian':body.targetLanguage;
  if(!['ukrainian','polish','german'].includes(String(targetLanguage)))return Response.json({error:'Оберіть підтримувану мову перекладу.'},{status:400});
  const access=await accessFor(user.id);
  const finding=await scanFindingForTranslation(body.scanId,user.id,Number(body.findingIndex));
  if(!finding)return Response.json({error:'Доказ не знайдений у ваших збережених звітах'},{status:404});
  const denied=await guardFeature(user,'translate',{access,translationPlan:finding.translationPlan,message:access.plan==='free'?'Переклад доступний у One Sift і Pro':'One Sift перекладає докази лише у звіті, відкритому цим тарифом. Pro перекладає всю вашу історію.'});
  if(denied)return denied;
  scanId=body.scanId;
  const findingIndex=Number(body.findingIndex);
  evidence=finding.evidence;
  sourceHash=await translationHash(evidence,undefined,'english',String(targetLanguage));
  const cached=await getCachedTranslation(sourceHash);
  const translationSourceId=`${scanId}:${findingIndex}:${targetLanguage}`;
  if(cached){await trackEvent({userId:user.id,type:'translation_used',sourceId:translationSourceId,payload:{scanId,findingIndex,targetLanguage,cached:true}});return Response.json({translation:cached,cached:true})}
  const config=aiCostConfig();
  if(!config.enabled)return Response.json({error:'AI-переклад тимчасово вимкнено. Оригінальні докази доступні.'},{status:503});
  if(evidence.length>config.maxInputChars)return Response.json({error:'Цей доказ завеликий для перекладу. Відкрийте фрагмент у першоджерелі.'},{status:413});
  translationLease=await claimTranslation(sourceHash);
  if(!translationLease){for(let attempt=0;attempt<6;attempt++){await new Promise(resolve=>setTimeout(resolve,200));const inFlightResult=await getCachedTranslation(sourceHash);if(inFlightResult){await trackEvent({userId:user.id,type:'translation_used',sourceId:translationSourceId,payload:{scanId,findingIndex,targetLanguage,cached:true}});return Response.json({translation:inFlightResult,cached:true})}}return Response.json({error:'Цей фрагмент уже перекладається. Спробуйте ще раз за мить.'},{status:409,headers:{'Retry-After':'2'}})}
  reservedDay=await reserveTranslation(user.id,300);
  if(!reservedDay){await releaseTranslationLock(sourceHash,translationLease);translationLease=null;return rateLimitedResponse('Досягнуто денний ліміт перекладів. Спробуйте завтра.',utcRetryAfter())}
  const estimatedInput=estimatedInputTokens(evidence),reservationTokens=estimatedInput*4;
  aiReservation=await reserveAiCall(reservationTokens);
  if(!aiReservation){await releaseTranslation(user.id,reservedDay);reservedDay=null;await releaseTranslationLock(sourceHash,translationLease);translationLease=null;return rateLimitedResponse('Денний бюджет AI вичерпано. Переклад знову стане доступний після 00:00 UTC.',utcRetryAfter())}
  providerCalled=true;
  const out=await env.AI.run(config.model,{text:evidence,source_lang:'english',target_lang:String(targetLanguage)}) as {translated_text?:unknown;usage?:{prompt_tokens?:unknown;completion_tokens?:unknown;total_tokens?:unknown}};
  const translation=typeof out?.translated_text==='string'?out.translated_text.trim():'';
  if(!translation)throw new Error('AI повернув порожній переклад');
  const promptUsage=out.usage?.prompt_tokens,completionUsage=out.usage?.completion_tokens;
  const inputTokens=typeof promptUsage==='number'&&Number.isFinite(promptUsage)?Math.max(0,Math.ceil(promptUsage)):estimatedInput;
  const outputTokens=typeof completionUsage==='number'&&Number.isFinite(completionUsage)?Math.max(0,Math.ceil(completionUsage)):estimatedOutputTokens(translation);
  await finishAiCall({reservation:aiReservation,scanId,userId:user.id,sourceHash,inputTokens,outputTokens,status:'completed'});
  aiReservation=null;
  await saveCachedTranslation(sourceHash,translation);
  if(translationLease){await releaseTranslationLock(sourceHash,translationLease);translationLease=null}
  reservedDay=null;
  await trackEvent({userId:user.id,type:'translation_used',sourceId:translationSourceId,payload:{scanId,findingIndex,targetLanguage,cached:false}});
  return Response.json({translation,cached:false});
 }catch{
  if(aiReservation&&userId&&providerCalled){try{await finishAiCall({reservation:aiReservation,scanId,userId,sourceHash,inputTokens:estimatedInputTokens(evidence),outputTokens:0,status:'failed'});aiReservation=null}catch{/* Keep reservation in the daily budget if usage could not be recorded. */}}
  if(reservedDay&&userId){try{await releaseTranslation(userId,reservedDay)}catch{}}
  if(translationLease){try{await releaseTranslationLock(sourceHash,translationLease)}catch{}}
  return Response.json({error:'AI-переклад тимчасово недоступний. Оригінальний доказ і звіт збережені — спробуйте ще раз.'},{status:503});
 }
}
