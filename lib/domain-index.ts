import {env} from 'cloudflare:workers';
import {DOMAIN_INDEX_MAX_AGE_DAYS,DOMAIN_INDEX_MIN_ACCOUNTS,normalizeDomain,summarizeDomainObservations,validateDomainCorrection} from './domain-index-policy.js';

const db=()=> (env as unknown as {DB:D1Database}).DB;
const hex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');
export async function domainContributionHash(userId:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`sift-domain-index-v1:${userId}`)))}

export async function ensureDomainIndexDb(){
  await db().prepare(`CREATE TABLE IF NOT EXISTS domain_index_consent(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),agreed_at TEXT,updated_at TEXT NOT NULL)`).run();
  await db().prepare(`CREATE TABLE IF NOT EXISTS domain_index_observations(domain TEXT NOT NULL,user_hash TEXT NOT NULL,clarity_score INTEGER NOT NULL CHECK(clarity_score BETWEEN 0 AND 100),indicators_json TEXT NOT NULL,report_count INTEGER NOT NULL DEFAULT 1,first_seen_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,PRIMARY KEY(domain,user_hash))`).run();
  await db().prepare(`CREATE INDEX IF NOT EXISTS idx_domain_index_observations_recent ON domain_index_observations(domain,last_seen_at DESC)`).run();
  await db().prepare(`CREATE TABLE IF NOT EXISTS domain_correction_requests(id TEXT PRIMARY KEY,domain TEXT NOT NULL,contact_email TEXT NOT NULL,contact_name TEXT NOT NULL,organization TEXT NOT NULL,message TEXT NOT NULL,evidence_url TEXT,owner_attested_at TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),moderator_note TEXT,created_at TEXT NOT NULL,reviewed_at TEXT,expires_at TEXT NOT NULL,reviewer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,owner_verified_at TEXT)`).run();
  const correctionColumns=await db().prepare(`PRAGMA table_info(domain_correction_requests)`).all<{name:string}>();
  const existingCorrectionColumns=new Set((correctionColumns.results||[]).map((column)=>column.name));
  if(!existingCorrectionColumns.has('owner_attested_at'))await db().prepare(`ALTER TABLE domain_correction_requests ADD COLUMN owner_attested_at TEXT NOT NULL DEFAULT ''`).run();
  if(!existingCorrectionColumns.has('owner_verified_at'))await db().prepare(`ALTER TABLE domain_correction_requests ADD COLUMN owner_verified_at TEXT`).run();
  await db().prepare(`CREATE INDEX IF NOT EXISTS idx_domain_corrections_status_created ON domain_correction_requests(status,created_at DESC)`).run();
  await db().prepare(`CREATE TABLE IF NOT EXISTS domain_owner_responses(id TEXT PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,domain TEXT NOT NULL,organization TEXT NOT NULL,response TEXT NOT NULL,published_at TEXT NOT NULL,verified_by TEXT REFERENCES users(id) ON DELETE SET NULL)`).run();
  const responseColumns=await db().prepare(`PRAGMA table_info(domain_owner_responses)`).all<{name:string}>();
  if(!(responseColumns.results||[]).some((column)=>column.name==='verified_by'))await db().prepare(`ALTER TABLE domain_owner_responses ADD COLUMN verified_by TEXT REFERENCES users(id) ON DELETE SET NULL`).run();
  await db().prepare(`CREATE INDEX IF NOT EXISTS idx_domain_owner_responses_domain ON domain_owner_responses(domain,published_at DESC)`).run();
}

export async function domainIndexConsentForUser(userId:string){
  await ensureDomainIndexDb();
  const row=await db().prepare(`SELECT enabled,agreed_at,updated_at FROM domain_index_consent WHERE user_id=?`).bind(userId).first<{enabled:number;agreed_at:string|null;updated_at:string}>();
  return{enabled:row?.enabled===1,agreedAt:row?.agreed_at||null,updatedAt:row?.updated_at||null};
}

type DomainObservationInput={url?:unknown;score?:unknown;prices?:unknown;findings?:unknown};
type DomainObservationValue={domain:string;userHash:string;score:number;indicatorsJson:string;reportCount:number;firstSeenAt:string;lastSeenAt:string};
function buildObservation(userHash:string,result:DomainObservationInput,createdAt:string):DomainObservationValue|null{
  const domain=normalizeDomain(typeof result.url==='string'?result.url:'');
  const score=typeof result.score==='number'&&Number.isFinite(result.score)?Math.max(0,Math.min(100,Math.round(result.score))):null;
  if(!domain||score===null)return null;
  const findings=Array.isArray(result.findings)?result.findings as Array<{kind?:unknown}>:[];
  const kinds=new Set(findings.map(item=>typeof item?.kind==='string'?item.kind:''));
  const indicators={price:(Array.isArray(result.prices)&&result.prices.length>0)||kinds.has('price'),renewal:kinds.has('renewal'),cancellation:kinds.has('cancellation'),refund:kinds.has('refund'),trial:kinds.has('trial'),penalty:kinds.has('penalty'),warning:kinds.has('warning')};
  return{domain,userHash,score,indicatorsJson:JSON.stringify(indicators),reportCount:1,firstSeenAt:createdAt,lastSeenAt:createdAt};
}
function observationUpsert(value:DomainObservationValue){
  return db().prepare(`INSERT INTO domain_index_observations(domain,user_hash,clarity_score,indicators_json,report_count,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(domain,user_hash) DO UPDATE SET clarity_score=CASE WHEN excluded.last_seen_at>=domain_index_observations.last_seen_at THEN excluded.clarity_score ELSE domain_index_observations.clarity_score END,indicators_json=CASE WHEN excluded.last_seen_at>=domain_index_observations.last_seen_at THEN excluded.indicators_json ELSE domain_index_observations.indicators_json END,report_count=domain_index_observations.report_count+excluded.report_count,first_seen_at=MIN(domain_index_observations.first_seen_at,excluded.first_seen_at),last_seen_at=MAX(domain_index_observations.last_seen_at,excluded.last_seen_at) WHERE excluded.last_seen_at>=domain_index_observations.last_seen_at`).bind(value.domain,value.userHash,value.score,value.indicatorsJson,value.reportCount,value.firstSeenAt,value.lastSeenAt);
}
async function saveObservation(userId:string,result:DomainObservationInput,createdAt:string){
  const userHash=await domainContributionHash(userId),value=buildObservation(userHash,result,createdAt);
  if(!value)return false;
  await observationUpsert(value).run();
  return true;
}

export async function recordDomainObservation(userId:string,result:DomainObservationInput,createdAt=new Date().toISOString()){
  await ensureDomainIndexDb();
  const [consent,verified]=await Promise.all([
    db().prepare(`SELECT enabled FROM domain_index_consent WHERE user_id=?`).bind(userId).first<{enabled:number}>(),
    db().prepare(`SELECT verified_at FROM email_verification_status WHERE user_id=?`).bind(userId).first<{verified_at:string|null}>(),
  ]);
  if(consent?.enabled!==1||!verified?.verified_at)return false;
  return saveObservation(userId,result,createdAt);
}

export async function setDomainIndexConsent(userId:string,enabled:boolean){
  await ensureDomainIndexDb();
  const now=new Date().toISOString();
  if(!enabled){
    const userHash=await domainContributionHash(userId);
    await db().batch([
      db().prepare(`DELETE FROM domain_index_observations WHERE user_hash=?`).bind(userHash),
      db().prepare(`INSERT INTO domain_index_consent(user_id,enabled,agreed_at,updated_at) VALUES(?,0,NULL,?) ON CONFLICT(user_id) DO UPDATE SET enabled=0,updated_at=excluded.updated_at`).bind(userId,now),
    ]);
    return{enabled:false,agreedAt:null,updatedAt:now,removedContributions:true};
  }
  await db().prepare(`INSERT INTO domain_index_consent(user_id,enabled,agreed_at,updated_at) VALUES(?,1,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=1,agreed_at=excluded.agreed_at,updated_at=excluded.updated_at`).bind(userId,now,now).run();
  const recent=await db().prepare(`SELECT url,score,result_json,created_at FROM scans WHERE user_id=? AND created_at>=? ORDER BY created_at DESC LIMIT 500`).bind(userId,new Date(Date.now()-DOMAIN_INDEX_MAX_AGE_DAYS*86400_000).toISOString()).all<{url:string;score:number;result_json:string;created_at:string}>();
  const userHash=await domainContributionHash(userId),grouped=new Map<string,DomainObservationValue>();
  for(const row of recent.results||[]){
    try{
      const result=JSON.parse(row.result_json) as DomainObservationInput,value=buildObservation(userHash,{...result,url:row.url,score:row.score},row.created_at);
      if(!value)continue;
      const previous=grouped.get(value.domain);
      if(!previous){grouped.set(value.domain,value);continue;}
      previous.reportCount++;
      if(value.firstSeenAt<previous.firstSeenAt)previous.firstSeenAt=value.firstSeenAt;
      if(value.lastSeenAt>previous.lastSeenAt){previous.lastSeenAt=value.lastSeenAt;previous.score=value.score;previous.indicatorsJson=value.indicatorsJson;}
    }catch{/* Skip corrupt historical reports; they do not affect the public index. */}
  }
  const observations=[...grouped.values()];
  for(let index=0;index<observations.length;index+=40)await db().batch(observations.slice(index,index+40).map(observationUpsert));
  return{enabled:true,agreedAt:now,updatedAt:now,processedReports:observations.length};
}

type ObservationRow={clarity_score:number;indicators_json:string;last_seen_at:string};
export async function publicDomainProfile(input:string){
  await ensureDomainIndexDb();
  const domain=normalizeDomain(input);if(!domain)return null;
  const cutoff=new Date(Date.now()-DOMAIN_INDEX_MAX_AGE_DAYS*86400_000).toISOString();
  const rows=await db().prepare(`SELECT clarity_score,indicators_json,last_seen_at FROM domain_index_observations WHERE domain=? AND last_seen_at>=? ORDER BY last_seen_at DESC LIMIT 1000`).bind(domain,cutoff).all<ObservationRow>();
  const summary=summarizeDomainObservations(rows.results||[]);
  if(!summary)return null;
  const response=await db().prepare(`SELECT organization,response,published_at FROM domain_owner_responses WHERE domain=? ORDER BY published_at DESC LIMIT 1`).bind(domain).first<{organization:string;response:string;published_at:string}>();
  return{domain,...summary,methodologyUrl:'/domains/methodology',ownerResponse:response||null};
}

export async function publicDomainProfiles(){
  await ensureDomainIndexDb();
  const cutoff=new Date(Date.now()-DOMAIN_INDEX_MAX_AGE_DAYS*86400_000).toISOString();
  const rows=await db().prepare(`SELECT DISTINCT domain FROM domain_index_observations WHERE last_seen_at>=? ORDER BY domain LIMIT 1000`).bind(cutoff).all<{domain:string}>();
  const profiles=await Promise.all((rows.results||[]).map(row=>publicDomainProfile(row.domain)));
  return profiles.filter((item):item is NonNullable<typeof item>=>Boolean(item)).sort((a,b)=>b.sampleCount-a.sampleCount||a.domain.localeCompare(b.domain));
}

export async function submitDomainCorrection(input:unknown){
  await ensureDomainIndexDb();
  const parsed=validateDomainCorrection(input);
  if(!parsed.ok)return parsed;
  const id=crypto.randomUUID(),now=new Date().toISOString(),value=parsed.value;
  const expiresAt=new Date(Date.now()+180*86400_000).toISOString();
  await db().prepare(`INSERT INTO domain_correction_requests(id,domain,contact_email,contact_name,organization,message,evidence_url,owner_attested_at,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,'pending',?,?)`).bind(id,value.domain,value.contactEmail,value.contactName,value.organization,value.message,value.evidenceUrl,now,now,expiresAt).run();
  return{ok:true,id,domain:value.domain,createdAt:now};
}

export async function pendingDomainCorrections(){
  await ensureDomainIndexDb();
  const rows=await db().prepare(`SELECT id,domain,contact_email,contact_name,organization,message,evidence_url,owner_attested_at,status,created_at,expires_at FROM domain_correction_requests WHERE status='pending' AND expires_at>? ORDER BY created_at ASC LIMIT 100`).bind(new Date().toISOString()).all();
  return rows.results||[];
}

export async function reviewDomainCorrection(input:{id:string;action:'publish'|'reject';response?:string;ownerVerified?:boolean;reviewerId:string}){
  await ensureDomainIndexDb();
  const now=new Date().toISOString();
  const row=await db().prepare(`SELECT id,domain,organization,message,status,expires_at FROM domain_correction_requests WHERE id=?`).bind(input.id).first<{id:string;domain:string;organization:string;message:string;status:string;expires_at:string}>();
  if(!row||row.status!=='pending'||row.expires_at<=now)return{kind:'missing' as const};
  if(input.action==='reject'){
    const result=await db().prepare(`UPDATE domain_correction_requests SET status='rejected',reviewed_at=?,reviewer_user_id=? WHERE id=? AND status='pending' AND expires_at>?`).bind(now,input.reviewerId,row.id,now).run();
    if((result.meta?.changes||0)!==1)return{kind:'missing' as const};
    return{kind:'rejected' as const,domain:row.domain};
  }
  if(input.ownerVerified!==true)return{kind:'owner_verification_required' as const};
  const response=typeof input.response==='string'?input.response.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,3000):'';
  if(response.length<20)return{kind:'invalid_response' as const};
  const responseId=crypto.randomUUID();
  const results=await db().batch([
    db().prepare(`UPDATE domain_correction_requests SET status='published',reviewed_at=?,reviewer_user_id=?,owner_verified_at=? WHERE id=? AND status='pending' AND expires_at>?`).bind(now,input.reviewerId,now,row.id,now),
    db().prepare(`INSERT INTO domain_owner_responses(id,request_id,domain,organization,response,published_at,verified_by) SELECT ?,id,domain,organization,?,?,? FROM domain_correction_requests WHERE id=? AND status='published' AND reviewed_at=? AND reviewer_user_id=? AND owner_verified_at=? ON CONFLICT(request_id) DO NOTHING`).bind(responseId,response,now,input.reviewerId,row.id,now,input.reviewerId,now),
  ]);
  if((results[0]?.meta?.changes||0)!==1||(results[1]?.meta?.changes||0)!==1)return{kind:'missing' as const};
  return{kind:'published' as const,domain:row.domain};
}

export const DOMAIN_INDEX_MINIMUM=DOMAIN_INDEX_MIN_ACCOUNTS;
