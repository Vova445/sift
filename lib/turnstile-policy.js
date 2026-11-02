export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstileToken({ secret, token, expectedAction, expectedHostname, remoteIp, fetchImpl = fetch }) {
  if (!secret) return { ok: false, kind: 'unconfigured' };
  if (typeof token !== 'string' || token.length < 1 || token.length > 2048) return { ok: false, kind: 'invalid' };
  let response;
  try {
    const body = new URLSearchParams({ secret, response: token, idempotency_key: crypto.randomUUID() });
    if (remoteIp) body.set('remoteip', remoteIp);
    response = await fetchImpl(TURNSTILE_VERIFY_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!response.ok) return { ok: false, kind: 'unavailable' };
    const result = await response.json();
    const hostname = String(result.hostname || '').toLowerCase();
    if (result.success !== true || result.action !== expectedAction || hostname !== String(expectedHostname || '').toLowerCase()) return { ok: false, kind: 'invalid' };
    return { ok: true, kind: 'valid' };
  } catch {
    return { ok: false, kind: 'unavailable' };
  }
}
