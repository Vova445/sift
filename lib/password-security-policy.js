export const RESET_TOKEN_TTL_MS=60*60*1000;
export const LOGIN_WINDOW_MS=15*60*1000;
export const LOGIN_ACCOUNT_FAILURE_LIMIT=5;
export const LOGIN_IP_FAILURE_LIMIT=20;
export const LOGIN_LOCK_MS=15*60*1000;
export const RESET_EMAIL_WINDOW_MS=60*60*1000;
export const RESET_EMAIL_MAX_REQUESTS=3;
export const RESET_IP_MAX_REQUESTS=20;
export const RESET_RESEND_COOLDOWN_MS=60*1000;
export const RESET_TOKEN_ATTEMPT_WINDOW_MS=15*60*1000;
export const RESET_TOKEN_ATTEMPT_LIMIT=30;

export function resetTokenState(token,now=Date.now()){
  if(!token||token.usedAt)return 'used';
  if(Date.parse(token.expiresAt)<=now)return 'expired';
  return 'valid';
}

export function loginLocked(bucket,now=Date.now()){
  return !!bucket?.lockedUntil&&Date.parse(bucket.lockedUntil)>now;
}

export function resetRequestBlocked(bucket,{now=Date.now(),maxRequests,windowMs=RESET_EMAIL_WINDOW_MS,cooldownMs=RESET_RESEND_COOLDOWN_MS}){
  if(!bucket)return false;
  const start=Date.parse(bucket.windowStartedAt),count=Number.isFinite(start)&&now-start>=windowMs?0:bucket.requestCount;
  if(count>=maxRequests)return true;
  const last=bucket.lastRequestedAt?Date.parse(bucket.lastRequestedAt):NaN;
  return Number.isFinite(last)&&now-last<cooldownMs;
}
