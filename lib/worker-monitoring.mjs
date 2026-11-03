const alertCooldownMs = 60_000;
const recentAlerts = new Map();

function safeRoute(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/(?:[a-f0-9]{24,}|[A-Za-z0-9_-]{32,})(?=\/|$)/gi, '/:id');
  return `${request.method.toUpperCase()} ${path}`;
}

export function monitoringIncident(error, request, requestId, source = 'request', now = new Date()) {
  return {
    event: 'worker.exception',
    source,
    requestId,
    route: safeRoute(request),
    errorName: error instanceof Error && error.name ? error.name.slice(0, 80) : 'Error',
    timestamp: now.toISOString(),
  };
}

export function shouldSendMonitoringAlert(incident, now = Date.now()) {
  const fingerprint = `${incident.source}:${incident.route}:${incident.errorName}`;
  const lastSent = recentAlerts.get(fingerprint) ?? 0;
  if (now - lastSent < alertCooldownMs) return false;
  recentAlerts.set(fingerprint, now);
  if (recentAlerts.size > 500) {
    for (const [key, timestamp] of recentAlerts) {
      if (now - timestamp >= alertCooldownMs) recentAlerts.delete(key);
    }
    if (recentAlerts.size > 500) recentAlerts.delete(recentAlerts.keys().next().value);
  }
  return true;
}

export async function sendTelegramAlert(env, incident, fetcher = fetch) {
  const token = env?.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env?.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return { sent: false, reason: 'not_configured' };
  if (!shouldSendMonitoringAlert(incident)) return { sent: false, reason: 'deduplicated' };

  const text = [
    'Sift · Worker error',
    `Route: ${incident.route}`,
    `Error: ${incident.errorName}`,
    `Request ID: ${incident.requestId}`,
    `Time: ${incident.timestamp}`,
    'Details: Cloudflare Workers Logs',
  ].join('\n');
  const response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(5_000),
  });
  let result;
  try { result = await response.json(); } catch { result = null; }
  if (!response.ok || result?.ok !== true) throw new Error(`Telegram alert delivery returned HTTP ${response.status}`);
  return { sent: true };
}

export async function pingUptimeMonitor(env, failed = false, fetcher = fetch) {
  const configuredUrl = env?.UPTIME_PING_URL?.trim();
  if (!configuredUrl) return { sent: false, reason: 'not_configured' };

  const url = new URL(configuredUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('UPTIME_PING_URL must be a clean HTTPS ping URL');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${failed ? '/fail' : ''}`;
  const response = await fetcher(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Uptime heartbeat returned HTTP ${response.status}`);
  return { sent: true, failed };
}

export async function runUptimeHeartbeat({ env, healthCheck, requestId, fetcher = fetch, logger = console }) {
  const request = new Request('https://sift.internal/health');
  try {
    const response = await healthCheck(request);
    if (!response.ok) throw new Error('Internal /health returned HTTP ' + response.status);
    await pingUptimeMonitor(env, false, fetcher);
    logger.log(JSON.stringify({ event: 'monitoring.heartbeat_ok', requestId, timestamp: new Date().toISOString() }));
    return { ok: true };
  } catch (error) {
    const incident = monitoringIncident(error, request, requestId, 'uptime');
    logger.error(JSON.stringify(incident));
    try { await pingUptimeMonitor(env, true, fetcher); }
    catch (pingError) { logger.warn(JSON.stringify({ event: 'monitoring.uptime_failure_signal_failed', requestId, errorName: pingError instanceof Error ? pingError.name : 'Error' })); }
    try { await sendTelegramAlert(env, incident, fetcher); }
    catch (deliveryError) { logger.warn(JSON.stringify({ event: 'monitoring.telegram_delivery_failed', requestId, errorName: deliveryError instanceof Error ? deliveryError.name : 'Error' })); }
    return { ok: false, incident };
  }
}

export async function matchesMonitoringTestToken(expected, received) {
  if (!expected || !received) return false;
  const encoder = new TextEncoder();
  const [expectedDigest, receivedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
    crypto.subtle.digest('SHA-256', encoder.encode(received)),
  ]);
  const left = new Uint8Array(expectedDigest);
  const right = new Uint8Array(receivedDigest);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

