import {copyFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';

const serverDir=new URL('../dist/server/',import.meta.url);
const entry=new URL('index.js',serverDir),app=new URL('app.js',serverDir);
if(!existsSync(entry))throw new Error('vinext build did not create dist/server/index.js');
await copyFile(entry,app);
const wrapper=`import app from './app.js';
function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function secureResponse(request, response) {
  const nonce = createNonce();
  const headers = new Headers(response.headers);
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self' https://secure.wayforpay.com",
    "script-src 'self' 'nonce-" + nonce + "' https://challenges.cloudflare.com",
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src 'self' https://challenges.cloudflare.com",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    'upgrade-insecure-requests',
  ].join('; ');
  headers.set('Content-Security-Policy', csp);
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');

  const isHtml = (headers.get('Content-Type') || '').toLowerCase().includes('text/html');
  if (isHtml) headers.delete('Content-Length');
  const secured = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  if (!isHtml || request.method === 'HEAD' || !response.body) return secured;
  return new HTMLRewriter()
    .on('script', { element(element) { element.setAttribute('nonce', nonce); } })
    .transform(secured);
}
export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    return secureResponse(request, response);
  },
  async scheduled(controller, env, ctx) {
    const secret = env.DUNNING_CRON_SECRET;
    if (!secret) throw new Error('DUNNING_CRON_SECRET is not configured');
    const internalHeaders = { authorization: 'Bearer ' + secret, 'x-scheduled-cron': controller.cron };
    const retentionRequest = new Request('https://sift.internal/api/internal/privacy-retention', {
      method: 'POST',
      headers: internalHeaders,
    });
    const retentionResponse = await app.fetch(retentionRequest, env, ctx);
    if (!retentionResponse.ok) throw new Error('Guest report retention returned HTTP ' + retentionResponse.status);
    const request = new Request('https://sift.internal/api/internal/billing-dunning', {
      method: 'POST',
      headers: internalHeaders,
    });
    const response = await app.fetch(request, env, ctx);
    if (!response.ok) throw new Error('Billing dunning returned HTTP ' + response.status);
  },
};
`;
await writeFile(entry,wrapper);
