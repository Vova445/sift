export const TURNSTILE_VERIFY_URL: string;
export function verifyTurnstileToken(input: { secret?: string; token?: unknown; expectedAction: string; expectedHostname: string; remoteIp?: string; allowTestingKeyResponse?: boolean; fetchImpl?: typeof fetch }): Promise<{ ok: boolean; kind: 'unconfigured'|'invalid'|'unavailable'|'valid' }>;
