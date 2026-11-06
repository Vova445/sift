import {copyFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';

const serverDir=new URL('../dist/server/',import.meta.url);
const entry=new URL('index.js',serverDir),app=new URL('app.js',serverDir);
const monitoringModule=new URL('worker-monitoring.mjs',serverDir);
const backupModule=new URL('d1-backup-workflow.mjs',serverDir);
const backupHelper=new URL('d1-backup.mjs',serverDir);
const backupOrchestrator=new URL('d1-backup-orchestrator.mjs',serverDir);
if(!existsSync(entry))throw new Error('vinext build did not create dist/server/index.js');
await copyFile(entry,app);
await copyFile(new URL('../lib/worker-monitoring.mjs',import.meta.url),monitoringModule);
await copyFile(new URL('../lib/d1-backup-workflow.mjs',import.meta.url),backupModule);
await copyFile(new URL('../lib/d1-backup.mjs',import.meta.url),backupHelper);
await copyFile(new URL('../lib/d1-backup-orchestrator.mjs',import.meta.url),backupOrchestrator);
const wrapper=`import app from './app.js';
import { D1BackupWorkflow } from './d1-backup-workflow.mjs';
import {matchesMonitoringTestToken,monitoringIncident,runUptimeHeartbeat,sendTelegramAlert} from './worker-monitoring.mjs';
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
export { D1BackupWorkflow };
export default {
  async fetch(request, env, ctx) {
    const requestId = request.headers.get('cf-ray') || crypto.randomUUID();
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/internal/monitoring/test-error') {
        const expected = env.MONITORING_TEST_TOKEN;
        const received = request.headers.get('x-monitoring-test-token') || '';
        if (request.method !== 'POST' || !await matchesMonitoringTestToken(expected, received)) {
          return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
        }
        throw new Error('Synthetic monitoring test exception');
      }
      if (url.pathname === '/api/internal/monitoring/test-heartbeat') {
        const expected = env.MONITORING_TEST_TOKEN;
        const received = request.headers.get('x-monitoring-test-token') || '';
        if (request.method !== 'POST' || !await matchesMonitoringTestToken(expected, received)) {
          return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
        }
        const result = await runUptimeHeartbeat({
          env,
          healthCheck: (healthRequest) => app.fetch(healthRequest, env, ctx),
          requestId,
        });
        return secureResponse(request, Response.json({ status: result.ok ? 'ok' : 'degraded', requestId }, { status: result.ok ? 200 : 503 }));
      }

      const response = await app.fetch(request, env, ctx);
      if (response.status >= 500) {
        const httpError = new Error('Worker returned an HTTP 5xx response');
        httpError.name = 'HTTP_' + response.status;
        const incident = monitoringIncident(httpError, request, requestId, 'http');
        console.error(JSON.stringify(incident));
        ctx.waitUntil(sendTelegramAlert(env, incident).catch((error) => {
          console.warn(JSON.stringify({ event: 'monitoring.telegram_delivery_failed', requestId, errorName: error instanceof Error ? error.name : 'Error' }));
        }));
      }
      return secureResponse(request, response);
    } catch (error) {
      const incident = monitoringIncident(error, request, requestId, 'exception');
      console.error(JSON.stringify(incident));
      ctx.waitUntil(sendTelegramAlert(env, incident).catch((deliveryError) => {
        console.warn(JSON.stringify({ event: 'monitoring.telegram_delivery_failed', requestId, errorName: deliveryError instanceof Error ? deliveryError.name : 'Error' }));
      }));
      throw error;
    }
  },
  async email(message, env, ctx) {
    const secret = env.DUNNING_CRON_SECRET;
    const reject = (reason) => { if (typeof message.setReject === 'function') message.setReject(reason); };
    if (!secret) { reject('Subscription Radar is not configured.'); return; }
    if (!Number.isFinite(message.rawSize) || message.rawSize <= 0 || message.rawSize > 1048576) {
      reject('Email is empty or exceeds the 1 MiB Subscription Radar limit.');
      return;
    }
    const authResults = message.headers?.get('Authentication-Results') || '';
    try {
      const request = new Request('https://sift.internal/api/internal/subscription-radar/email', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + secret,
          'content-type': 'message/rfc822',
          'content-length': String(message.rawSize),
          'x-radar-recipient': message.to || '',
          'x-radar-auth-results': authResults.slice(0, 4000),
        },
        body: message.raw,
      });
      const response = await app.fetch(request, env, ctx);
      if (response.status >= 500) throw new Error('Subscription Radar temporarily failed with HTTP ' + response.status);
      if (!response.ok) reject('Email could not be verified for Subscription Radar.');
    } catch (error) {
      console.error(JSON.stringify({ event: 'subscription_radar.email_failed', errorName: error instanceof Error ? error.name : 'Error' }));
      throw error;
    }
  },
  async scheduled(controller, env, ctx) {
    if (controller.cron === '*/1 * * * *') {
      const requestId = crypto.randomUUID();
      const result = await runUptimeHeartbeat({ env, healthCheck: (request) => app.fetch(request, env, ctx), requestId });
      if (!result.ok) throw new Error('Scheduled uptime heartbeat failed');
      return;
    }

    if (controller.cron === '0 2 * * *') {
      const scheduledAt = new Date(controller.scheduledTime).toISOString();
      const id = 'daily-d1-backup-' + scheduledAt.slice(0, 10);
      try {
        await env.D1_BACKUP_WORKFLOW.create({ id, params: { scheduledAt } });
      } catch (createError) {
        let existing;
        try { existing = await env.D1_BACKUP_WORKFLOW.get(id); }
        catch { throw createError; }
        const status = await existing.status();
        if (status.status === 'errored' || status.status === 'terminated') await existing.restart();
      }
      return;
    }

    if (controller.cron === '0 8 * * 1') {
      const secret = env.DUNNING_CRON_SECRET;
      if (!secret) throw new Error('DUNNING_CRON_SECRET is not configured');
      const request = new Request('https://sift.internal/api/internal/tos-monitoring', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + secret, 'x-scheduled-cron': controller.cron },
      });
      const response = await app.fetch(request, env, ctx);
      if (!response.ok) throw new Error('terms monitoring returned HTTP ' + response.status);
      return;
    }

    const jobs = [
      ['guest report retention', '/api/internal/privacy-retention'],
      ['billing dunning', '/api/internal/billing-dunning'],
      ['email reminders', '/api/internal/email-reminders'],
      ['subscription radar reminders', '/api/internal/subscription-radar'],
      ['terms monitoring', '/api/internal/tos-monitoring'],
    ];
    try {
      const secret = env.DUNNING_CRON_SECRET;
      if (!secret) throw new Error('DUNNING_CRON_SECRET is not configured');
      const internalHeaders = { authorization: 'Bearer ' + secret, 'x-scheduled-cron': controller.cron };
      const results = await Promise.all(jobs.map(async ([name, path]) => {
        const request = new Request('https://sift.internal' + path, { method: 'POST', headers: internalHeaders });
        const response = await app.fetch(request, env, ctx);
        return { name, status: response.status, ok: response.ok };
      }));
      const failures = results.filter((result) => !result.ok);
      if (failures.length) throw new Error(failures.map((result) => result.name + ' returned HTTP ' + result.status).join('; '));
    } catch (error) {
      const cronRequest = new Request('https://sift.internal/__scheduled');
      const incident = monitoringIncident(error, cronRequest, crypto.randomUUID(), 'scheduled');
      console.error(JSON.stringify(incident));
      try { await sendTelegramAlert(env, incident); }
      catch (deliveryError) { console.warn(JSON.stringify({ event: 'monitoring.telegram_delivery_failed', requestId: incident.requestId, errorName: deliveryError instanceof Error ? deliveryError.name : 'Error' })); }
      throw error;
    }
  },
};
`;
await writeFile(entry,wrapper);
