import assert from 'node:assert/strict';
import test from 'node:test';
import { healthCheckResponse } from '../lib/health-check.mjs';
import {
  matchesMonitoringTestToken,
  monitoringIncident,
  pingUptimeMonitor,
  runUptimeHeartbeat,
  sendTelegramAlert,
  shouldSendMonitoringAlert,
} from '../lib/worker-monitoring.mjs';

test('monitoring incidents omit query strings and redact long path tokens', () => {
  const request = new Request('https://sift.example/reset-password/abcdefghijklmnopqrstuvwxyz123456?token=private');
  const incident = monitoringIncident(new TypeError('do not export message'), request, 'ray-123', 'request', new Date(0));
  assert.deepEqual(incident, {
    event: 'worker.exception',
    source: 'request',
    requestId: 'ray-123',
    route: 'GET /reset-password/:id',
    errorName: 'TypeError',
    timestamp: '1970-01-01T00:00:00.000Z',
  });
});

test('Telegram delivery requires both configured secrets and sends a minimal redacted alert', async () => {
  let sentRequest;
  const incident = monitoringIncident(new Error('sensitive database details'), new Request('https://sift.example/api/analyze'), 'req-safe');
  assert.deepEqual(await sendTelegramAlert({}, incident, async () => { throw new Error('must not send'); }), { sent: false, reason: 'not_configured' });
  const result = await sendTelegramAlert({ TELEGRAM_BOT_TOKEN: 'bot-token', TELEGRAM_CHAT_ID: '-1001' }, incident, async (url, init) => {
    sentRequest = { url, init };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  assert.deepEqual(result, { sent: true });
  assert.match(sentRequest.url, /api\.telegram\.org\/botbot-token\/sendMessage/);
  const payload = JSON.parse(sentRequest.init.body);
  assert.equal(payload.chat_id, '-1001');
  assert.match(payload.text, /req-safe/);
  assert.doesNotMatch(payload.text, /sensitive database details/);
});

test('Telegram error alerts are deduplicated for 60 seconds per route and error class', () => {
  const incident = { source: 'request', route: 'GET /boom', errorName: 'Error' };
  assert.equal(shouldSendMonitoringAlert(incident, 120_000), true);
  assert.equal(shouldSendMonitoringAlert(incident, 179_999), false);
  assert.equal(shouldSendMonitoringAlert(incident, 180_000), true);
});

test('uptime heartbeat sends success and failure signals to the configured HTTPS URL', async () => {
  const urls = [];
  const env = { UPTIME_PING_URL: 'https://hc-ping.com/example-uuid' };
  const fakeFetch = async (url) => { urls.push(String(url)); return new Response(null, { status: 200 }); };
  assert.deepEqual(await pingUptimeMonitor(env, false, fakeFetch), { sent: true, failed: false });
  assert.deepEqual(await pingUptimeMonitor(env, true, fakeFetch), { sent: true, failed: true });
  assert.deepEqual(urls, ['https://hc-ping.com/example-uuid', 'https://hc-ping.com/example-uuid/fail']);
  await assert.rejects(() => pingUptimeMonitor({ UPTIME_PING_URL: 'http://localhost/ping' }, false, fakeFetch), /HTTPS/);
});

test('scheduled heartbeat checks D1 health and signals success or failure to monitors and Telegram', async () => {
  const requests = [];
  const logs = [];
  const env = {
    UPTIME_PING_URL: 'https://hc-ping.com/heartbeat-test',
    TELEGRAM_BOT_TOKEN: 'bot-token',
    TELEGRAM_CHAT_ID: 'chat-id',
  };
  const fakeFetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const healthy = await runUptimeHeartbeat({
    env,
    healthCheck: async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
    requestId: 'heartbeat-ok',
    fetcher: fakeFetch,
    logger: { log: (value) => logs.push(value), error: (value) => logs.push(value), warn: (value) => logs.push(value) },
  });
  assert.equal(healthy.ok, true);
  assert.equal(requests[0].url, 'https://hc-ping.com/heartbeat-test');

  const degraded = await runUptimeHeartbeat({
    env,
    healthCheck: async () => new Response(JSON.stringify({ status: 'degraded' }), { status: 503 }),
    requestId: 'heartbeat-failed',
    fetcher: fakeFetch,
    logger: { log: (value) => logs.push(value), error: (value) => logs.push(value), warn: (value) => logs.push(value) },
  });
  assert.equal(degraded.ok, false);
  assert.equal(requests[1].url, 'https://hc-ping.com/heartbeat-test/fail');
  assert.match(requests[2].url, /api\.telegram\.org\/botbot-token\/sendMessage/);
  assert.equal(logs.length, 2);
});

test('monitoring test endpoint uses constant-time token matching and rejects invalid tokens', async () => {
  assert.equal(await matchesMonitoringTestToken('long-random-secret', 'long-random-secret'), true);
  assert.equal(await matchesMonitoringTestToken('long-random-secret', 'wrong-secret'), false);
  assert.equal(await matchesMonitoringTestToken('', 'long-random-secret'), false);
});

test('/health is 200 for a healthy D1 and 503 without leaking database errors', async () => {
  const healthy = await healthCheckResponse({ prepare: () => ({ first: async () => ({ healthy: 1 }) }) }, new Date(0));
  assert.equal(healthy.status, 200);
  assert.deepEqual(await healthy.json(), { status: 'ok', checks: { database: 'ok' }, timestamp: '1970-01-01T00:00:00.000Z' });
  assert.equal(healthy.headers.get('cache-control'), 'no-store, max-age=0');

  const degraded = await healthCheckResponse({ prepare: () => ({ first: async () => { throw new Error('private database detail'); } }) }, new Date(0));
  assert.equal(degraded.status, 503);
  assert.deepEqual(await degraded.json(), { status: 'degraded', checks: { database: 'unavailable' }, timestamp: '1970-01-01T00:00:00.000Z' });
});
