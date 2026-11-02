export const VERIFICATION_TTL_MS=24*60*60*1000;
export const RESEND_WINDOW_MS=24*60*60*1000;
export const RESEND_COOLDOWN_MS=60*1000;
export const RESEND_MAX_PER_WINDOW=5;

export function verificationTokenState(token,now=Date.now()){
  if(!token||token.usedAt)return 'used';
  if(Date.parse(token.expiresAt)<=now)return 'expired';
  return 'valid';
}

export function resendBlockReason({sentCount,lastSentAt,windowStartedAt},now=Date.now()){
  const windowStart=Date.parse(windowStartedAt);
  const count=Number.isFinite(windowStart)&&now-windowStart>=RESEND_WINDOW_MS?0:sentCount;
  if(count>=RESEND_MAX_PER_WINDOW)return 'daily_limit';
  const last=lastSentAt?Date.parse(lastSentAt):NaN;
  if(Number.isFinite(last)&&now-last<RESEND_COOLDOWN_MS)return 'cooldown';
  return null;
}
