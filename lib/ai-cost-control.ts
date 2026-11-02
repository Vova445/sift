import {env} from 'cloudflare:workers';
import {ensureTranslationDb} from './db';
import {estimateCostMicros,estimateTokens} from './ai-cost-policy.js';

const MODEL='@cf/meta/m2m100-1.2b';
const vars=()=>env as unknown as Record<string,string|undefined>;
const boundedInt=(name:string,fallback:number,max:number)=>{
  const value=Number(vars()[name]);
  return Number.isSafeInteger(value)&&value>=0?Math.min(value,max):fallback;
};

export function aiCostConfig(){const setting=vars().AI_TRANSLATION_ENABLED?.trim().toLowerCase(),enabled=setting!=='false'&&setting!=='0';return{
  enabled,
  dailyRequests:boundedInt('AI_DAILY_REQUEST_LIMIT',500,100_000),
  dailyTokens:boundedInt('AI_DAILY_TOKEN_LIMIT',100_000,10_000_000),
  maxInputChars:boundedInt('AI_MAX_TRANSLATION_CHARS',8_000,20_000),
  model:MODEL
}}

export async function reserveAiCall(tokens:number){
  await ensureTranslationDb();
  const day=new Date().toISOString().slice(0,10),now=new Date().toISOString(),config=aiCostConfig();
  await env.DB.prepare(`INSERT OR IGNORE INTO ai_daily_usage(day,request_count,reserved_tokens,actual_tokens,estimated_cost_micros,updated_at) VALUES(?,0,0,0,0,?)`).bind(day,now).run();
  const result=await env.DB.prepare(`UPDATE ai_daily_usage SET request_count=request_count+1,reserved_tokens=reserved_tokens+?,updated_at=? WHERE day=? AND request_count<? AND actual_tokens+reserved_tokens+?<=?`).bind(tokens,now,day,config.dailyRequests,tokens,config.dailyTokens).run();
  return(result.meta?.changes||0)>0?{day,reservedTokens:tokens}:null;
}

export async function finishAiCall(input:{reservation:{day:string;reservedTokens:number};scanId:string;userId:string;sourceHash:string;inputTokens:number;outputTokens:number;status:'completed'|'failed'}){
  await ensureTranslationDb();
  const now=new Date().toISOString(),total=input.inputTokens+input.outputTokens,cost=estimateCostMicros(input.inputTokens,input.outputTokens);
  await env.DB.batch([
    env.DB.prepare(`UPDATE ai_daily_usage SET reserved_tokens=MAX(0,reserved_tokens-?),actual_tokens=actual_tokens+?,estimated_cost_micros=estimated_cost_micros+?,updated_at=? WHERE day=?`).bind(input.reservation.reservedTokens,total,cost,now,input.reservation.day),
    env.DB.prepare(`INSERT INTO ai_usage_events(id,scan_id,user_id,source_hash,model,status,input_tokens,output_tokens,total_tokens,estimated_cost_micros,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),input.scanId,input.userId,input.sourceHash,MODEL,input.status,input.inputTokens,input.outputTokens,total,cost,now)
  ]);
}

export function estimatedInputTokens(text:string){return estimateTokens(text)}
export function estimatedOutputTokens(text:string){return estimateTokens(text)}
