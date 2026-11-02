export const VERIFICATION_TTL_MS:number;
export const RESEND_WINDOW_MS:number;
export const RESEND_COOLDOWN_MS:number;
export const RESEND_MAX_PER_WINDOW:number;
export function verificationTokenState(token:{usedAt?:string|null;expiresAt:string}|null,now?:number):'valid'|'expired'|'used';
export function resendBlockReason(state:{sentCount:number;lastSentAt:string|null;windowStartedAt:string},now?:number):'daily_limit'|'cooldown'|null;
