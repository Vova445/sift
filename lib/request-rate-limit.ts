import {env} from 'cloudflare:workers';
import {AUTH_REQUESTS_PER_MINUTE,REQUEST_WINDOW_MS,rollingWindowResult} from './request-rate-limit-policy.js';

type Identity={kind:'ip'|'account'|'token';value:string;skipEdge?:boolean};
type EdgeLimiter={limit:(options:{key:string})=>Promise<{success:boolean}>};
type RateLimitResult={allowed:true;retryAfter:0}|{allowed:false;retryAfter:number};

const encoder=new TextEncoder();
const bindings=()=>env as unknown as Record<string,unknown>;
const digest=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
const clientIp=(request:Request)=>request.headers.get('cf-connecting-ip')?.trim()||'unknown';
let cleanupCounter=0;
const deniedUntil=new Map<string,number>();

async function consumeBucket(scope:string,identity:Identity,limit:number,now:number,windowMs:number){
  const bucketHash=await digest(`${scope}\0${identity.kind}\0${identity.value.trim().toLowerCase()}`);
  const cachedExpiry=deniedUntil.get(bucketHash);
  if(cachedExpiry&&cachedExpiry>now)return{allowed:false,retryAfter:Math.max(1,Math.ceil((cachedExpiry-now)/1000))};
  if(cachedExpiry)deniedUntil.delete(bucketHash);
  // Start a window on the first hit, not on the wall-clock minute boundary.
  // This prevents a burst of 2x the allowance across adjacent clock minutes.
  // Saturate at limit + 1 and stop writing once blocked.
  await env.DB.prepare(`INSERT INTO request_rate_limits(key_hash,window_started_at,request_count,expires_at) VALUES(?,?,1,?) ON CONFLICT(key_hash) DO UPDATE SET request_count=CASE WHEN request_rate_limits.window_started_at+?<=excluded.window_started_at THEN 1 ELSE MIN(request_rate_limits.request_count+1,?) END,window_started_at=CASE WHEN request_rate_limits.window_started_at+?<=excluded.window_started_at THEN excluded.window_started_at ELSE request_rate_limits.window_started_at END,expires_at=CASE WHEN request_rate_limits.window_started_at+?<=excluded.window_started_at THEN excluded.window_started_at+? ELSE request_rate_limits.expires_at END WHERE request_rate_limits.window_started_at+?<=excluded.window_started_at OR request_rate_limits.request_count<?`).bind(bucketHash,now,now+windowMs*2,windowMs,limit+1,windowMs,windowMs,windowMs*2,windowMs,limit+1).run();
  const row=await env.DB.prepare(`SELECT request_count,window_started_at FROM request_rate_limits WHERE key_hash=?`).bind(bucketHash).first<{request_count:number;window_started_at:number}>();
  const windowStartedAt=Number(row?.window_started_at??now);
  const decision=rollingWindowResult({currentCount:Number(row?.request_count??1)-1,windowStartedAt,now,limit,windowMs});
  if(!decision.allowed){if(deniedUntil.size>=10_000){for(const[key,expiry]of deniedUntil)if(expiry<=now)deniedUntil.delete(key);if(deniedUntil.size>=10_000)deniedUntil.clear()}deniedUntil.set(bucketHash,windowStartedAt+windowMs)}
  return decision;
}

async function consumeEdgeBucket(scope:string,identity:Identity){
  // Local Miniflare only uses this as an optional edge simulation. D1 remains
  // the strict shared counter and is what the local 100-request check covers.
  if(identity.skipEdge||bindings().RATE_LIMIT_EDGE_ENABLED!=='true')return true;
  const bindingName=scope.startsWith('analyze:')?'ANALYZE_EDGE_LIMITER':'AUTH_EDGE_LIMITER';
  const limiter=bindings()[bindingName] as EdgeLimiter|undefined;
  if(!limiter||typeof limiter.limit!=='function')return true;
  try{return(await limiter.limit({key:`${scope}:${identity.kind}:${await digest(identity.value.trim().toLowerCase())}`})).success}catch{return true}
}

/** D1 supplies a globally shared strict counter; the Cloudflare binding adds a coarse POP edge ceiling. */
export async function enforceRateLimit(scope:string,identities:Identity[],limit:number,windowMs=REQUEST_WINDOW_MS):Promise<RateLimitResult>{
  try{
    const now=Date.now();let retryAfter=0;
    for(const identity of identities){
      if(!identity.value)continue;
      if(!await consumeEdgeBucket(scope,identity)){retryAfter=Math.max(retryAfter,windowMs/1000);continue}
      const decision=await consumeBucket(scope,identity,limit,now,windowMs);
      if(!decision.allowed)retryAfter=Math.max(retryAfter,decision.retryAfter);
    }
    if(++cleanupCounter>=256){cleanupCounter=0;try{await env.DB.prepare(`DELETE FROM request_rate_limits WHERE expires_at<?`).bind(now).run()}catch{}}
    return retryAfter?{allowed:false,retryAfter}:{allowed:true,retryAfter:0};
  }catch(error){console.error(`[rate-limit] ${scope} failed`,error instanceof Error?error.message:'unknown error');throw error}
}

export function rateLimitIdentities(request:Request,account?:string|null,token?:string|null):Identity[]{
  const hostname=new URL(request.url).hostname.toLowerCase();
  const skipEdge=hostname==='127.0.0.1'||hostname==='localhost'||hostname==='::1';
  const identities:Identity[]=[{kind:'ip',value:clientIp(request),skipEdge}];
  if(account)identities.push({kind:'account',value:account,skipEdge});
  if(token)identities.push({kind:'token',value:token,skipEdge});
  return identities;
}

export function rateLimitAccountIdentity(request:Request,account:string):Identity[]{
  return rateLimitIdentities(request,account).filter(identity=>identity.kind==='account');
}

export function rateLimitedResponse(message='Забагато запитів. Спробуйте пізніше.',retryAfter=60){
  const seconds=Math.max(1,Math.ceil(retryAfter));
  return Response.json({error:message,retryAfter:seconds},{status:429,headers:{'Retry-After':String(seconds),'Cache-Control':'no-store'}});
}

export {AUTH_REQUESTS_PER_MINUTE};
