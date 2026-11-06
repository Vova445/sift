import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { translationHash } from '../lib/ai-cost-policy.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workRoot = join(root, '.wrangler');
await mkdir(workRoot, { recursive: true });
const workDir = await mkdtemp(join(workRoot, 'sift-api-integration-'));
const workerPath = join(workDir, 'worker.mjs');
const merchant = 'sift-integration-merchant';
const merchantSecret = 'sift-integration-secret-do-not-use-in-production';
const email = `integration-${randomUUID()}@example.com`;
const analyticsSessionId=randomUUID();
const password = 'Initial-passphrase-938!';
const appOrigin = 'http://127.0.0.1';
const emailOutbox = [];
const telegramOutbox = [];
let telegramSendFailures = 0;
let telegramGroupMemberCount = 10;
const resendAttemptKeys = [];
let outboundCallCount = 0;
let nextIp = 10;
let providerCheckAmount=59;
let currentPagePrice = '$12.99';
let currentPageTitle = 'Subscription Terms';
let resendFailuresRemaining = 0;

function termsHtml() {
  const termsText = [
    `Pricing is ${currentPagePrice} per month. The subscription automatically renews monthly unless you cancel.`,
    'Refund policy: eligible customers may request a refund within 30 days.',
    'Cancel subscription at any time from account settings.',
    ...Array.from({ length: 100 }, (_, index) => `Additional terms clause ${index + 1} describes the service and billing details.`),
  ].join(' ');
  return `<!doctype html><html><head><title>${currentPageTitle}</title></head><body><main>${termsText}</main></body></html>`;
}

async function mockOutbound(request) {
  outboundCallCount++;
  const url = new URL(request.url);
  if (url.hostname === 'challenges.cloudflare.com') {
    const form = new URLSearchParams(await request.clone().text());
    const token = form.get('response');
    const action = token === 'valid-signup-token' ? 'signup' : token === 'valid-password-reset-token' ? 'password_reset' : '';
    return Response.json({
      success: Boolean(action),
      action,
      hostname: '127.0.0.1',
      'error-codes': action ? [] : ['invalid-input-response'],
    });
  }
  if (url.hostname === 'api.resend.com') {
    const message = JSON.parse(await request.clone().text());
    resendAttemptKeys.push(request.headers.get('idempotency-key'));
    if (resendFailuresRemaining > 0) {
      resendFailuresRemaining--;
      return Response.json({ error: 'temporary provider failure' }, { status: 503 });
    }
    emailOutbox.push(message);
    return Response.json({ id: `email-${emailOutbox.length}` }, { status: 200 });
  }
  if (url.hostname === 'bank.gov.ua') {
    return Response.json([{ rate: 40, exchangedate: '04.11.2026' }]);
  }
  if (url.hostname === 'api.telegram.org') {
    const payload = request.method==='GET'?{}:JSON.parse(await request.clone().text());
    if (telegramSendFailures > 0) { telegramSendFailures--; return Response.json({ ok: false, description: 'temporary Telegram test failure' }, { status: 503 }); }
    if (url.pathname.endsWith('/getChatMemberCount')) return Response.json({ ok: true, result: telegramGroupMemberCount });
    if (url.pathname.endsWith('/sendMessage')) telegramOutbox.push(payload);
    return Response.json({ ok: true, result: { message_id: telegramOutbox.length } });
  }
  if (url.hostname === 'cloudflare-dns.com') {
    const type = url.searchParams.get('type');
    return Response.json({
      Status: 0,
      Answer: type === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [],
    });
  }
  if (url.hostname === 'shop.example.com') {
    return new Response(termsHtml(), { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  if (url.hostname === 'api.wayforpay.com') {
    const payload=JSON.parse(await request.clone().text());
    if(payload.transactionType==='CHECK_STATUS'){
      const data={merchantAccount:merchant,orderReference:payload.orderReference,amount:providerCheckAmount,currency:'UAH',authCode:'000000',cardPan:'444455******1111',transactionStatus:'Approved',reasonCode:1100};
      data.merchantSignature=createHmac('md5',merchantSecret).update([data.merchantAccount,data.orderReference,data.amount,data.currency,data.authCode,data.cardPan,data.transactionStatus,data.reasonCode].join(';'),'utf8').digest('hex');
      return Response.json(data);
    }
    if(payload.transactionType==='REFUND'){
      const data={merchantAccount:merchant,orderReference:payload.orderReference,transactionStatus:'refunded',reasonCode:1100,reason:'ok'};
      data.merchantSignature=createHmac('md5',merchantSecret).update([data.merchantAccount,data.orderReference,data.transactionStatus,data.reasonCode].join(';'),'utf8').digest('hex');
      return Response.json(data);
    }
    return Response.json({ reasonCode: 4100 });
  }
  return Response.json({ error: `Unexpected integration-test outbound request to ${url.hostname}` }, { status: 502 });
}

async function responseFor(path, { method = 'GET', body, rawBody, cookie, origin = false, ip, authorization, scheduledCron, telegramSecret } = {}) {
  const headers = new Headers();
  if (body !== undefined || rawBody !== undefined) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  if (origin) headers.set('origin', typeof origin === 'string' ? origin : appOrigin);
  if (authorization) headers.set('authorization', authorization);
  if (scheduledCron) headers.set('x-scheduled-cron', scheduledCron);
  if (telegramSecret) headers.set('x-telegram-bot-api-secret-token', telegramSecret);
  headers.set('cf-connecting-ip', ip || `198.51.100.${nextIp++}`);
  const response = await miniflare.dispatchFetch(`${appOrigin}${path}`, {
    method,
    headers,
    ...(rawBody !== undefined ? { body: rawBody } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, data };
}

function sessionFrom(response) {
  const value = response.headers.get('set-cookie')?.match(/(?:^|;\s*)sift_session=([^;]+)/)?.[1];
  assert.ok(value, 'expected a session cookie');
  return `sift_session=${value}`;
}

function tokenFromEmail(message, route) {
  const anchor = message?.html?.match(/href="([^"]+)"/);
  assert.ok(anchor, `expected a ${route} link in the test email`);
  const url = new URL(anchor[1]);
  assert.equal(url.pathname, route);
  const token = new URLSearchParams(url.hash.slice(1)).get('token');
  assert.ok(token && token.length >= 32, `expected a token for ${route}`);
  return token;
}

function callbackPayload(orderReference, overrides = {}) {
  const data = {
    merchantAccount: merchant,
    orderReference,
    amount: 59,
    currency: 'UAH',
    authCode: '000000',
    cardPan: '444455******1111',
    transactionStatus: 'Approved',
    reasonCode: 1100,
    ...overrides,
  };
  const signedFields = [
    data.merchantAccount,
    data.orderReference,
    data.amount,
    data.currency,
    data.authCode,
    data.cardPan,
    data.transactionStatus,
    data.reasonCode,
  ].map((value) => value === undefined || value === null ? '' : String(value)).join(';');
  data.merchantSignature = createHmac('md5', merchantSecret).update(signedFields, 'utf8').digest('hex');
  return data;
}

let miniflare;
try {
  await build({
    absWorkingDir: root,
    entryPoints: ['tests/fixtures/api-integration-worker.ts'],
    outfile: workerPath,
    bundle: true,
    platform: 'neutral',
    format: 'esm',
    target: 'es2022',
    external: ['cloudflare:workers', 'node:crypto'],
  });

  miniflare = new Miniflare({
    name: 'sift-api-integration',
    scriptPath: workerPath,
    modules: true,
    compatibilityDate: '2026-05-15',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB: 'sift-api-integration' },
    d1Persist: false,
    bindings: {
      APP_BASE_URL: appOrigin,
      WAYFORPAY_MODE: 'sandbox',
      WAYFORPAY_MERCHANT_ACCOUNT: merchant,
      WAYFORPAY_MERCHANT_SECRET: merchantSecret,
      WAYFORPAY_MERCHANT_PASSWORD: 'integration-merchant-password',
      WAYFORPAY_MERCHANT_DOMAIN: '127.0.0.1',
      WAYFORPAY_SANDBOX_ALLOWLIST: email,
      TURNSTILE_SITE_KEY: 'integration-site-key',
      TURNSTILE_SECRET_KEY: 'integration-secret-key',
      REFERRAL_ABUSE_SECRET: 'integration-referral-abuse-secret',
      RESEND_API_KEY: 'integration-resend-key',
      AUTH_EMAIL_FROM: 'Sift Integration <no-reply@example.com>',
      DUNNING_CRON_SECRET: 'integration-cron-secret',
      EMAIL_RADAR_DOMAIN: 'radar.example.test',
      AI_RADAR_ENABLED: 'true',
      AI_DAILY_REQUEST_LIMIT: '1000',
      AI_DAILY_TOKEN_LIMIT: '500000',
      RATE_LIMIT_EDGE_ENABLED: 'false',
      ANALYTICS_ADMIN_EMAIL: email,
      SUPPORT_ADMIN_EMAILS: email,
      TELEGRAM_BOT_TOKEN: 'integration-telegram-token',
      TELEGRAM_BOT_USERNAME: 'sift_integration_bot',
      TELEGRAM_WEBHOOK_SECRET: 'integration-telegram-webhook-secret-long-enough',
    },
    outboundService: mockOutbound,
  });
  await miniflare.ready;

  const db = await miniflare.getD1Database('DB');
  const migrationDir = join(root, 'migrations');
  const migrations = (await readdir(migrationDir)).filter((file) => file.endsWith('.sql')).sort();
  const migrationProbeUser = `migration-probe-${randomUUID()}`;
  const migrationProbeScan = `migration-probe-scan-${randomUUID()}`;
  for (const migration of migrations) {
    if (migration === '0029_event_bus_achievement_progress.sql') {
      const seededAt = new Date(Date.now() - 86_400_000).toISOString();
      await db.prepare(`INSERT INTO users(id,email,password_hash,salt,created_at) VALUES(?,?,?, ?,?)`).bind(migrationProbeUser, `${migrationProbeUser}@example.test`, 'unused-test-hash', 'unused-test-salt', seededAt).run();
      await db.prepare(`INSERT INTO scans(id,device_id,url,title,score,result_json,created_at,user_id) VALUES(?,?,?,?,?,?,?,?)`).bind(migrationProbeScan, 'migration-probe-device', 'https://legacy.example.test/terms', 'Legacy terms', 64, JSON.stringify({ findings: [{ kind: 'renewal', confidence: 'high', evidence: 'Renews monthly' }] }), seededAt, migrationProbeUser).run();
      await db.prepare(`INSERT INTO user_achievement_events(id,user_id,event_type,source_id,created_at) VALUES(?,?,'analysis_saved',?,?)`).bind(randomUUID(), migrationProbeUser, migrationProbeScan, seededAt).run();
      await db.prepare(`INSERT INTO user_achievement_events(id,user_id,event_type,source_id,created_at) VALUES(?,?,'cancellation_kit_used',?,?)`).bind(randomUUID(), migrationProbeUser, migrationProbeScan, seededAt).run();
      await db.prepare(`INSERT INTO user_achievements(user_id,badge_key,issued_at,details_json) VALUES(?,'renewal_spotted',?,?)`).bind(migrationProbeUser, seededAt, JSON.stringify({ sourceId: migrationProbeScan })).run();
    }
    const sql = await readFile(join(migrationDir, migration), 'utf8');
    if (migration === '0035_account_deletion_cascade.sql') await db.prepare(sql).run();
    else for (const statement of sql.split(';').map((item) => item.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  const eventColumns = await db.prepare(`PRAGMA table_info(events)`).all();
  assert.ok(eventColumns.results.some((column) => column.name === 'payload'));
  const achievementColumns = await db.prepare(`PRAGMA table_info(user_achievements)`).all();
  assert.ok(['key', 'unlocked_at', 'progress'].every((name) => achievementColumns.results.some((column) => column.name === name)));
  assert.ok(await db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_user_achievements_user_key'`).first());
  for (const eventType of ['analysis_completed', 'autorenew_found', 'cancellation_kit_used']) {
    assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM events WHERE user_id=? AND type=?`).bind(migrationProbeUser, eventType).first()).count, 1, `migration preserves existing ${eventType} history`);
  }
  assert.ok(await db.prepare(`SELECT key,unlocked_at,progress FROM user_achievements WHERE user_id=? AND key='renewal_spotted'`).bind(migrationProbeUser).first());

  // Account deletion trigger removes legacy rows without a long Worker-side D1 batch.
  const probeEmail = `${migrationProbeUser}@example.test`;
  await db.prepare(`INSERT INTO signups(email,created_at) VALUES(?,?)`).bind(probeEmail, new Date().toISOString()).run();
  await db.prepare(`INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)`).bind(`session-${migrationProbeUser}`, migrationProbeUser, new Date(Date.now()+60_000).toISOString(), new Date().toISOString()).run();
  await db.prepare(`INSERT INTO email_verification_status(user_id,verified_at) VALUES(?,?)`).bind(migrationProbeUser, new Date().toISOString()).run();
  await db.prepare(`INSERT INTO email_verification_tokens(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)`).bind(`verify-${migrationProbeUser}`, migrationProbeUser, new Date(Date.now()+60_000).toISOString(), new Date().toISOString()).run();
  const probeWatchlistId = `watch-${migrationProbeUser}`;
  await db.prepare(`INSERT INTO watchlist(id,user_id,scan_id,status,note,created_at,updated_at) VALUES(?,?,?,'considering','',?,?)`).bind(probeWatchlistId, migrationProbeUser, migrationProbeScan, new Date().toISOString(), new Date().toISOString()).run();
  await db.prepare(`DELETE FROM users WHERE id=?`).bind(migrationProbeUser).run();
  for (const [table, column, value] of [
    ['users','id',migrationProbeUser], ['scans','id',migrationProbeScan], ['watchlist','id',probeWatchlistId],
    ['sessions','user_id',migrationProbeUser], ['email_verification_status','user_id',migrationProbeUser],
    ['email_verification_tokens','user_id',migrationProbeUser], ['events','user_id',migrationProbeUser],
    ['user_achievements','user_id',migrationProbeUser], ['signups','email',probeEmail],
  ]) assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column}=?`).bind(value).first()).count, 0, `account deletion removes ${table}`);

  // Signup: happy path creates D1 user, acceptance record, verification token, and session.
  const health = await responseFor('/health');
  assert.equal(health.response.status, 200, JSON.stringify(health.data));
  assert.equal(health.data.status, 'ok');
  assert.equal(health.data.checks.database, 'ok');

  // Explicit opt-in visit and a real successful analysis form the first two steps.
  const visitEvent=await responseFor('/api/analytics/event',{method:'POST',body:{stage:'visit',sessionId:analyticsSessionId},origin:true});
  assert.equal(visitEvent.response.status,200,JSON.stringify(visitEvent.data));
  assert.equal((await responseFor('/api/analytics/event',{method:'POST',body:{stage:'visit',sessionId:analyticsSessionId},origin:true})).response.status,200);
  assert.equal((await responseFor('/api/analytics/event',{method:'POST',body:{stage:'analyze',sessionId:analyticsSessionId},origin:true})).response.status,200);
  assert.equal((await responseFor('/api/analytics/event',{method:'POST',body:{stage:'paywall',sessionId:randomUUID()}})).response.status,403);
  assert.equal((await responseFor('/api/analytics/event',{method:'POST',body:{stage:'visit'},origin:true})).response.status,400);
  const scanBody={url:'https://shop.example.com/terms',deviceId:'integration-device-1',analyticsSessionId};
  const scan=await responseFor('/api/analyze',{method:'POST',body:scanBody});
  assert.equal(scan.response.status,200,JSON.stringify(scan.data));
  assert.equal(scan.data.title,'Subscription Terms');
  assert.deepEqual(scan.data.prices,['$12.99']);
  assert.ok(scan.data.findings.every(item=>['high','medium','low'].includes(item.confidence)&&item.sourceUrl===scan.data.url));
  assert.ok(Array.isArray(scan.data.unknowns));
  assert.equal(scan.data.access.used,1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM scans WHERE device_id=?').bind(scanBody.deviceId).first()).count,1);

  const consent = { acceptTerms: true, acknowledgePrivacy: true };
  const signup = await responseFor('/api/auth/signup', {
    method: 'POST',
    body: { email, password, turnstileToken: 'valid-signup-token', legalConsent: consent,analyticsSessionId },
  });
  assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
  assert.equal(signup.data.user.email, email);
  assert.equal(signup.data.verification.sent, true);
  const session = sessionFrom(signup.response);
  const unverifiedMe = await responseFor('/api/auth/me', { cookie: session });
  assert.equal(unverifiedMe.response.status, 200);
  assert.equal(unverifiedMe.data.user.emailVerified, false);
  assert.equal((await responseFor('/api/dark-patterns',{method:'POST',rawBody:'{}'})).response.status,401);
  assert.equal((await responseFor('/api/dark-patterns',{method:'POST',rawBody:'{}',cookie:session})).response.status,403);
  assert.equal((await responseFor('/api/analytics/funnel',{cookie:session})).response.status,403);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM users WHERE email=?').bind(email).first()).count, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM legal_acceptances WHERE user_id=?').bind(signup.data.user.id).first()).count, 1);

  // Signup negatives: missing legal consent and duplicate email.
  const badSignup = await responseFor('/api/auth/signup', {
    method: 'POST', body: { email: 'bad-consent@example.com', password, turnstileToken: 'valid-signup-token' },
  });
  assert.equal(badSignup.response.status, 400);
  const duplicateSignup = await responseFor('/api/auth/signup', {
    method: 'POST', body: { email, password, turnstileToken: 'valid-signup-token', legalConsent: consent },
  });
  assert.equal(duplicateSignup.response.status, 400);

  // Email verification: successful one-time use, then invalid replay and unknown-token errors.
  const verificationToken = tokenFromEmail(emailOutbox.at(-1), '/verify-email');
  const verified = await responseFor('/api/auth/verify-email', { method: 'POST', body: { token: verificationToken } });
  assert.equal(verified.response.status, 200);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM email_verification_status WHERE user_id=?').bind(signup.data.user.id).first()).count, 1);
  const verificationReplay = await responseFor('/api/auth/verify-email', { method: 'POST', body: { token: verificationToken } });
  assert.equal(verificationReplay.response.status, 409);
  const verificationInvalid = await responseFor('/api/auth/verify-email', { method: 'POST', body: { token: 'unknown-verification-token-000000000000' } });
  assert.equal(verificationInvalid.response.status, 400);

  // Login and identity routes: correct credentials, wrong credentials, authenticated and anonymous.
  const login = await responseFor('/api/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(login.response.status, 200);
  const loginSession = sessionFrom(login.response);
  const darkPatternFlagOff=await responseFor('/api/admin/support',{method:'POST',cookie:loginSession,origin:true,body:{action:'set_flag',key:'dark_pattern_detector',enabled:false,reason:'Integration kill switch test'}});
  assert.equal(darkPatternFlagOff.response.status,200,JSON.stringify(darkPatternFlagOff.data));
  const darkPatternDisabled=await responseFor('/api/dark-patterns',{method:'POST',rawBody:'{}',cookie:loginSession});
  assert.equal(darkPatternDisabled.response.status,503);
  assert.match(darkPatternDisabled.data.error,/Детектор тимчасово вимкнений/);
  const darkPatternFlagOn=await responseFor('/api/admin/support',{method:'POST',cookie:loginSession,origin:true,body:{action:'set_flag',key:'dark_pattern_detector',enabled:true,reason:'Integration kill switch test complete'}});
  assert.equal(darkPatternFlagOn.response.status,200,JSON.stringify(darkPatternFlagOn.data));
  const darkPatternWithoutProvider=await responseFor('/api/dark-patterns',{method:'POST',rawBody:'{}',cookie:loginSession});
  assert.equal(darkPatternWithoutProvider.response.status,503);
  assert.match(darkPatternWithoutProvider.data.error,/AI-аналіз скриншотів зараз недоступний/);
  const wrongLogin = await responseFor('/api/auth/login', { method: 'POST', body: { email, password: 'wrong password' } });
  assert.equal(wrongLogin.response.status, 401);
  const me = await responseFor('/api/auth/me', { cookie: loginSession });
  assert.equal(me.response.status, 200, JSON.stringify(me.data));
  assert.equal(me.data.user.email, email);
  const anonymousMe = await responseFor('/api/auth/me');
  assert.equal(anonymousMe.response.status, 200);
  assert.equal(anonymousMe.data.user, null);

  // Public domain index: explicit opt-in, independent-account threshold, privacy boundary, and reviewed owner reply.
  assert.equal((await responseFor('/api/domain-index/consent')).response.status, 401);
  assert.equal((await responseFor('/api/domain-index/corrections',{method:'POST',body:{domain:'example.com'},origin:false})).response.status,403);
  assert.equal((await responseFor('/api/domain-index/example.com')).response.status,404);
  const domainCreatedAt=new Date().toISOString(),domainName='example.com';
  const domainSample=(id,userId,score,when)=>{
    const url=`https://www.${domainName}/terms?account=${encodeURIComponent(userId)}`;
    const result={url,title:'Terms',score,prices:['$9/month'],findings:[{kind:'price'},{kind:'renewal'},{kind:'cancellation'}]};
    return db.prepare(`INSERT INTO scans(id,device_id,url,title,score,result_json,created_at,user_id) VALUES(?,?,?,?,?,?,?,?)`).bind(id,`domain-device-${id}`,url,'Terms',score,JSON.stringify(result),when,userId);
  };
  const primaryDomainScan=randomUUID();
  await domainSample(primaryDomainScan,signup.data.user.id,60,domainCreatedAt).run();
  const defaultDomainConsent=await responseFor('/api/domain-index/consent',{cookie:loginSession});
  assert.equal(defaultDomainConsent.response.status,200,JSON.stringify(defaultDomainConsent.data));
  assert.equal(defaultDomainConsent.data.enabled,false,'domain index participation is off by default');
  assert.equal(defaultDomainConsent.data.contributionCount,0);
  const unverifiedDomainUserId=randomUUID(),unverifiedToken=`integration-domain-unverified-${randomUUID()}`,unverifiedEmail=`domain-index-unverified-${randomUUID()}@example.net`,unverifiedAt=new Date().toISOString(),unverifiedHash=createHash('sha256').update(unverifiedToken).digest('hex');
  await db.prepare(`INSERT INTO users(id,email,password_hash,salt,created_at) VALUES(?,?,?,'integration-salt',?)`).bind(unverifiedDomainUserId,unverifiedEmail,'integration-hash',unverifiedAt).run();
  await db.prepare(`INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)`).bind(unverifiedHash,unverifiedDomainUserId,new Date(Date.now()+86400_000).toISOString(),unverifiedAt).run();
  const unverifiedUserHash=createHash('sha256').update(`sift-domain-index-v1:${unverifiedDomainUserId}`).digest('hex');
  await db.prepare(`INSERT INTO domain_index_observations(domain,user_hash,clarity_score,indicators_json,report_count,first_seen_at,last_seen_at) VALUES('unverified.example.net',?,66,'{}',1,?,?)`).bind(unverifiedUserHash,unverifiedAt,unverifiedAt).run();
  const unverifiedDomainOptIn=await responseFor('/api/domain-index/consent',{method:'POST',cookie:`sift_session=${unverifiedToken}`,origin:true,body:{enabled:true}});
  assert.equal(unverifiedDomainOptIn.response.status,403,'unverified email cannot enable domain index participation');
  const unverifiedDomainDelete=await responseFor('/api/domain-index/consent',{method:'POST',cookie:`sift_session=${unverifiedToken}`,origin:true,body:{action:'delete_contributions'}});
  assert.equal(unverifiedDomainDelete.response.status,200,'an unverified account can still erase prior contributions');
  assert.equal(unverifiedDomainDelete.data.enabled,false);
  assert.equal(unverifiedDomainDelete.data.removedContributions,1);
  assert.equal(unverifiedDomainDelete.data.contributionCount,0);
  const primaryOptIn=await responseFor('/api/domain-index/consent',{method:'POST',cookie:loginSession,origin:true,body:{enabled:true}});
  assert.equal(primaryOptIn.response.status,200,JSON.stringify(primaryOptIn.data));
  assert.equal(primaryOptIn.data.enabled,true);
  for(let index=0;index<4;index++){
    const userId=randomUUID(),token=`integration-domain-${randomUUID()}`,sampleEmail=`domain-index-${index}-${randomUUID()}@example.net`,createdAt=new Date().toISOString(),hash=createHash('sha256').update(token).digest('hex');
    await db.prepare(`INSERT INTO users(id,email,password_hash,salt,created_at) VALUES(?,?,?,'integration-salt',?)`).bind(userId,sampleEmail,'integration-hash',createdAt).run();
    await db.prepare(`INSERT INTO email_verification_status(user_id,verified_at) VALUES(?,?)`).bind(userId,createdAt).run();
    await db.prepare(`INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)`).bind(hash,userId,new Date(Date.now()+86400_000).toISOString(),createdAt).run();
    await domainSample(randomUUID(),userId,70+index*10,createdAt).run();
    const opted=await responseFor('/api/domain-index/consent',{method:'POST',cookie:`sift_session=${token}`,origin:true,body:{enabled:true}});
    assert.equal(opted.response.status,200,JSON.stringify(opted.data));
  }
  const unconsentedUserId=randomUUID(),unconsentedEmail=`domain-index-no-consent-${randomUUID()}@example.net`,unconsentedAt=new Date().toISOString();
  await db.prepare(`INSERT INTO users(id,email,password_hash,salt,created_at) VALUES(?,?,?,'integration-salt',?)`).bind(unconsentedUserId,unconsentedEmail,'integration-hash',unconsentedAt).run();
  await db.prepare(`INSERT INTO email_verification_status(user_id,verified_at) VALUES(?,?)`).bind(unconsentedUserId,unconsentedAt).run();
  await domainSample(randomUUID(),unconsentedUserId,100,unconsentedAt).run();
  const domainProfile=await responseFor('/api/domain-index/example.com');
  assert.equal(domainProfile.response.status,200,JSON.stringify(domainProfile.data));
  assert.equal(domainProfile.response.headers.get('cache-control'),'no-store');
  assert.equal(domainProfile.data.sampleCount,5);
  assert.equal(domainProfile.data.clarityScore,80);
  assert.equal(domainProfile.data.domain,'example.com');
  assert.equal(domainProfile.data.ownerResponse,null);
  const domainColumns=await db.prepare(`PRAGMA table_info(domain_index_observations)`).all();
  assert.ok(!domainColumns.results.some(column=>['user_id','email','url','evidence'].includes(column.name)));
  const correctionColumns=await db.prepare(`PRAGMA table_info(domain_correction_requests)`).all();
  assert.ok(correctionColumns.results.some(column=>column.name==='owner_attested_at'));
  assert.ok(correctionColumns.results.some(column=>column.name==='owner_verified_at'));
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM domain_index_observations WHERE domain=? AND user_hash=?`).bind(domainName,createHash('sha256').update(`sift-domain-index-v1:${unconsentedUserId}`).digest('hex')).first()).count,0);
  const duplicateDomainScan=randomUUID();
  await domainSample(duplicateDomainScan,signup.data.user.id,80,new Date(Date.now()+1000).toISOString()).run();
  const domainReconsent=await responseFor('/api/domain-index/consent',{method:'POST',cookie:loginSession,origin:true,body:{enabled:true}});
  assert.equal(domainReconsent.response.status,200);
  const domainAfterBackfill=(await responseFor('/api/domain-index/example.com')).data;
  assert.equal(domainAfterBackfill.sampleCount,5,'multiple scans from one account count as one independent sample');
  assert.equal(domainAfterBackfill.clarityScore,84,'backfill selects the newest report for each account');
  const invalidDomainCorrection=await responseFor('/api/domain-index/corrections',{method:'POST',origin:true,body:{domain:'localhost',contactName:'Owner',contactEmail:'owner@example.com',organization:'Example',message:'Please correct this result because it is not accurate.'}});
  assert.equal(invalidDomainCorrection.response.status,400);
  const missingOwnerAttestation=await responseFor('/api/domain-index/corrections',{method:'POST',origin:true,body:{domain:'www.example.com',contactName:'Site representative',contactEmail:'press@example.com',organization:'Example Service',message:'The listed billing interval should include the annual renewal terms shown on our current terms page.',evidenceUrl:'https://example.com/terms'}});
  assert.equal(missingOwnerAttestation.response.status,400);
  const ownerCorrection=await responseFor('/api/domain-index/corrections',{method:'POST',origin:true,body:{domain:'www.example.com',contactName:'Site representative',contactEmail:'press@example.com',organization:'Example Service',message:'The listed billing interval should include the annual renewal terms shown on our current terms page.',evidenceUrl:'https://example.com/terms',ownerAttests:true}});
  assert.equal(ownerCorrection.response.status,201,JSON.stringify(ownerCorrection.data));
  assert.ok((await db.prepare(`SELECT owner_attested_at FROM domain_correction_requests WHERE domain='example.com'`).first()).owner_attested_at);
  const correctionQueue=await responseFor('/api/admin/domain-corrections',{cookie:loginSession});
  assert.equal(correctionQueue.response.status,200);
  assert.equal(correctionQueue.data.requests.length,1);
  const correctionId=correctionQueue.data.requests[0].id;
  const invalidPublish=await responseFor('/api/admin/domain-corrections',{method:'POST',cookie:loginSession,origin:true,body:{id:correctionId,action:'publish',response:'Too short'}});
  assert.equal(invalidPublish.response.status,400);
  const unverifiedPublish=await responseFor('/api/admin/domain-corrections',{method:'POST',cookie:loginSession,origin:true,body:{id:correctionId,action:'publish',response:'The service states that its current subscription renews annually. Please review the linked official terms for the latest details.'}});
  assert.equal(unverifiedPublish.response.status,400);
  const correctionPublished=await responseFor('/api/admin/domain-corrections',{method:'POST',cookie:loginSession,origin:true,body:{id:correctionId,action:'publish',ownerVerified:true,sourceVerified:true,response:'The service states that its current subscription renews annually. Please review the linked official terms for the latest details.'}});
  assert.equal(correctionPublished.response.status,200,JSON.stringify(correctionPublished.data));
  assert.ok((await db.prepare(`SELECT owner_verified_at FROM domain_correction_requests WHERE id=?`).bind(correctionId).first()).owner_verified_at);
  assert.equal((await db.prepare(`SELECT verified_by FROM domain_owner_responses WHERE request_id=?`).bind(correctionId).first()).verified_by,signup.data.user.id);
  const domainAfterResponse=await responseFor('/api/domain-index/example.com');
  assert.equal(domainAfterResponse.response.status,200);
  assert.equal(domainAfterResponse.data.ownerResponse.organization,'Example Service');
  assert.equal(domainAfterResponse.data.ownerResponse.response.startsWith('The service states'),true);
  assert.equal(JSON.stringify(domainAfterResponse.data).includes('press@example.com'),false);
  const deleteOnlyContributions=await responseFor('/api/domain-index/consent',{method:'POST',cookie:loginSession,origin:true,body:{action:'delete_contributions'}});
  assert.equal(deleteOnlyContributions.response.status,200,JSON.stringify(deleteOnlyContributions.data));
  assert.equal(deleteOnlyContributions.data.enabled,true,'delete-only keeps the opt-in active');
  assert.equal(deleteOnlyContributions.data.contributionCount,0);
  assert.ok(deleteOnlyContributions.data.removedContributions>0);
  assert.equal((await responseFor('/api/domain-index/example.com')).response.status,404,'deleting one account contribution drops the public sample below threshold');
  const domainOptOut=await responseFor('/api/domain-index/consent',{method:'POST',cookie:loginSession,origin:true,body:{enabled:false}});
  assert.equal(domainOptOut.response.status,200);
  assert.equal(domainOptOut.data.enabled,false);
  assert.equal(domainOptOut.data.contributionCount,0);
  assert.ok(domainOptOut.data.removedContributions>=0);
  assert.equal((await responseFor('/api/domain-index/example.com')).response.status,404,'public profile is hidden below the independent-account threshold');

  // Verification resend: auth required; verified addresses return a safe no-op success.
  const resendAnonymous = await responseFor('/api/auth/email-verification/resend', { method: 'POST', origin: true });
  assert.equal(resendAnonymous.response.status, 401);
  const resendVerified = await responseFor('/api/auth/email-verification/resend', { method: 'POST', cookie: loginSession, origin: true });
  assert.equal(resendVerified.response.status, 200);
  assert.equal(resendVerified.data.sent, false);

  // Forgot/reset password: generic response, successful reset, one-time token, and session revocation.
  const forgot = await responseFor('/api/auth/password/forgot', {
    method: 'POST', body: { email, turnstileToken: 'valid-password-reset-token' },
  });
  assert.equal(forgot.response.status, 200);
  const forgotUnknown = await responseFor('/api/auth/password/forgot', {
    method: 'POST', body: { email: 'nobody@example.com', turnstileToken: 'valid-password-reset-token' },
  });
  assert.equal(forgotUnknown.response.status, 200);
  assert.equal(forgotUnknown.data.message, forgot.data.message);
  const resetToken = tokenFromEmail(emailOutbox.at(-1), '/reset-password');
  const resetPasswordValue = 'Reset-passphrase-284!';
  const reset = await responseFor('/api/auth/password/reset', {
    method: 'POST', body: { token: resetToken, password: resetPasswordValue, turnstileToken: 'valid-password-reset-token' },
  });
  assert.equal(reset.response.status, 200);
  const resetReplay = await responseFor('/api/auth/password/reset', {
    method: 'POST', body: { token: resetToken, password: resetPasswordValue, turnstileToken: 'valid-password-reset-token' },
  });
  assert.equal(resetReplay.response.status, 400);
  const revokedSession = await responseFor('/api/auth/me', { cookie: loginSession });
  assert.equal(revokedSession.data.user, null);
  const resetLogin = await responseFor('/api/auth/login', { method: 'POST', body: { email, password: resetPasswordValue } });
  assert.equal(resetLogin.response.status, 200);

  // Password change: wrong old password is rejected; success revokes the current session.
  const changeCookie = sessionFrom(resetLogin.response);
  const wrongChange = await responseFor('/api/auth/password/change', {
    method: 'POST', cookie: changeCookie, origin: true,
    body: { currentPassword: 'incorrect password', newPassword: 'Changed-passphrase-992!' },
  });
  assert.equal(wrongChange.response.status, 401);
  const changedPasswordValue = 'Changed-passphrase-992!';
  const changed = await responseFor('/api/auth/password/change', {
    method: 'POST', cookie: changeCookie, origin: true,
    body: { currentPassword: resetPasswordValue, newPassword: changedPasswordValue },
  });
  assert.equal(changed.response.status, 200, JSON.stringify(changed.data));
  assert.equal((await responseFor('/api/auth/me', { cookie: changeCookie })).data.user, null);
  assert.equal((await responseFor('/api/auth/password/change', { method: 'POST', body: {} })).response.status, 401);

  // Logout: authenticated session is revoked, and anonymous logout is idempotent.
  const changedLogin = await responseFor('/api/auth/login', { method: 'POST', body: { email, password: changedPasswordValue } });
  assert.equal(changedLogin.response.status, 200);
  const logoutCookie = sessionFrom(changedLogin.response);
  const logout = await responseFor('/api/auth/logout', { method: 'POST', cookie: logoutCookie });
  assert.equal(logout.response.status, 200);
  assert.match(logout.response.headers.get('set-cookie') || '', /Max-Age=0/);
  assert.equal((await responseFor('/api/auth/me', { cookie: logoutCookie })).data.user, null);
  assert.equal((await responseFor('/api/auth/logout', { method: 'POST' })).response.status, 200);

  // Analyze API: successful HTML fetch creates a persisted report; SSRF input fails and refunds quota.
  const analyzeInvalid = await responseFor('/api/analyze', { method: 'POST', body: { ...scanBody, url: 'http://127.0.0.1' } });
  assert.equal(analyzeInvalid.response.status, 400);
  assert.equal((await responseFor('/api/analyze', { method: 'POST', body: { deviceId: 'missing-url' } })).response.status, 400);
  const history = await responseFor(`/api/history?deviceId=${encodeURIComponent(scanBody.deviceId)}`);
  assert.equal(history.response.status, 200);
  assert.equal(history.data.items.length, 1);
  assert.equal(history.data.items[0].result.findings[0].sourceUrl,scan.data.url);
  assert.equal(history.data.items[0].result.findings[0].confidence,scan.data.findings[0].confidence);
  assert.deepEqual(history.data.items[0].result.unknowns,scan.data.unknowns);
  assert.equal((await responseFor('/api/history')).response.status, 400);

  // WayForPay checkout: server price and authenticated owner; consent and origin are enforced.
  const billingLogin = await responseFor('/api/auth/login', { method: 'POST', body: { email, password: changedPasswordValue } });
  assert.equal(billingLogin.response.status, 200);
  const billingSession = sessionFrom(billingLogin.response);
  const accountSummary=await responseFor('/api/account?deviceId=integration-device-1',{cookie:billingSession});
  assert.equal(accountSummary.response.status,200,JSON.stringify(accountSummary.data));
  assert.equal(accountSummary.data.canViewAnalytics,true);
  assert.equal(accountSummary.data.canAccessSupport,true);
  const supportConsole=await responseFor('/api/admin/support',{cookie:billingSession});
  assert.equal(supportConsole.response.status,200);
  assert.equal(supportConsole.data.billingMode,'sandbox');
  const adminSearch=await responseFor('/api/admin/support?q=integration-',{cookie:billingSession});
  assert.equal(adminSearch.response.status,200);
  assert.ok(adminSearch.data.users.some(user=>user.id===signup.data.user.id));
  assert.equal((await responseFor('/api/admin/support?q=integration-')).response.status,401);

  // Weekly ToS monitoring: Pro-only setup, a D1 baseline, a material price alert, and no cosmetic alert.
  assert.equal((await responseFor('/api/tos-monitoring')).response.status,401);
  const tosMissingOrigin = await responseFor('/api/tos-monitoring', {
    method: 'POST', cookie: billingSession, body: { scanId: 'missing', enabled: true },
  });
  assert.equal(tosMissingOrigin.response.status, 403);
  const tosNow = new Date().toISOString();
  const tosExpiry = new Date(Date.now() + 30 * 864e5).toISOString();
  const tosSubscriptionId = `integration-tos-pro-${randomUUID()}`;
  await db.prepare(`INSERT INTO subscriptions(id,user_id,plan,status,credits,test_mode,created_at,expires_at,updated_at)
    VALUES(?,?,'pro','active',0,0,?,?,?)`).bind(tosSubscriptionId, signup.data.user.id, tosNow, tosExpiry, tosNow).run();
  await db.prepare(`UPDATE subscriptions SET status='expired' WHERE id=?`).bind(tosSubscriptionId).run();
  assert.equal((await responseFor('/api/tos-monitoring', { cookie: billingSession })).response.status, 403);
  await db.prepare(`UPDATE subscriptions SET status='active' WHERE id=?`).bind(tosSubscriptionId).run();
  const tosScan = await responseFor('/api/analyze', {
    method: 'POST', cookie: billingSession,
    body: { url: 'https://shop.example.com/terms', deviceId: 'tos-monitor-device' },
  });
  assert.equal(tosScan.response.status, 200, JSON.stringify(tosScan.data));
  assert.deepEqual(tosScan.data.prices, ['$12.99']);
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM events WHERE user_id=? AND type='analysis_completed' AND source_id=?`).bind(signup.data.user.id, tosScan.data.id).first()).count, 1);
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM events WHERE user_id=? AND type='autorenew_found' AND source_id=?`).bind(signup.data.user.id, tosScan.data.id).first()).count, 1);
  const analysisEvent = await db.prepare(`SELECT payload FROM events WHERE user_id=? AND type='analysis_completed' AND source_id=?`).bind(signup.data.user.id, tosScan.data.id).first();
  assert.equal(analysisEvent.payload.includes('shop.example.com'), false, 'event payload omits URL and raw evidence');
  const translationFindingIndex = tosScan.data.findings.findIndex((finding) => typeof finding.evidence === 'string' && finding.evidence.length > 0);
  assert.ok(translationFindingIndex >= 0);
  const translationSourceHash = await translationHash(tosScan.data.findings[translationFindingIndex].evidence);
  await db.prepare(`INSERT INTO translation_cache(source_hash,translation,created_at) VALUES(?,?,?)`).bind(translationSourceHash, 'Тестовий переклад умови.', new Date().toISOString()).run();
  const translated = await responseFor('/api/translate', { method: 'POST', cookie: billingSession, body: { scanId: tosScan.data.id, findingIndex: translationFindingIndex } });
  assert.equal(translated.response.status, 200, JSON.stringify(translated.data));
  assert.equal(translated.data.translation, 'Тестовий переклад умови.');
  const translatedAgain = await responseFor('/api/translate', { method: 'POST', cookie: billingSession, body: { scanId: tosScan.data.id, findingIndex: translationFindingIndex } });
  assert.equal(translatedAgain.response.status, 200);
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM events WHERE user_id=? AND type='translation_used' AND source_id=?`).bind(signup.data.user.id, `${tosScan.data.id}:${translationFindingIndex}:ukrainian`).first()).count, 1, 'translation events are idempotent per report fragment and language');
  for (const targetLanguage of ['polish', 'german']) {
    const languageHash = await translationHash(tosScan.data.findings[translationFindingIndex].evidence, undefined, 'english', targetLanguage);
    await db.prepare(`INSERT INTO translation_cache(source_hash,translation,created_at) VALUES(?,?,?)`).bind(languageHash, `Cached ${targetLanguage} translation.`, new Date().toISOString()).run();
    const response = await responseFor('/api/translate', { method: 'POST', cookie: billingSession, body: { scanId: tosScan.data.id, findingIndex: translationFindingIndex, targetLanguage } });
    assert.equal(response.response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.translation, `Cached ${targetLanguage} translation.`);
  }

  // Developer integrations: Pro-only API keys, shared rate limits, Telegram linking, groups, and saved reports.
  const openApi = await responseFor('/api/v1/openapi.json');
  assert.equal(openApi.response.status, 200);
  assert.equal(openApi.data.openapi, '3.1.0');
  assert.ok(openApi.data.paths['/api/v1/analyze']);
  assert.equal((await responseFor('/api/v1/analyze', { method: 'POST', body: { url: 'https://shop.example.com/terms' } })).response.status, 401);
  assert.equal((await responseFor('/api/developer/keys')).response.status, 401);
  assert.equal((await responseFor('/api/developer/keys', { method: 'POST', cookie: billingSession, body: { label: 'missing origin' } })).response.status, 403);
  const apiKeyCreated = await responseFor('/api/developer/keys', { method: 'POST', cookie: billingSession, origin: true, body: { label: 'Integration test key' } });
  assert.equal(apiKeyCreated.response.status, 201, JSON.stringify(apiKeyCreated.data));
  const apiKey = apiKeyCreated.data.secret;
  const apiKeyId = apiKeyCreated.data.key.id;
  assert.match(apiKey, /^sift_sk_[a-f\d]{64}$/);
  const storedApiKey = await db.prepare(`SELECT key_hash,key_prefix FROM developer_api_keys WHERE id=? AND user_id=?`).bind(apiKeyId, signup.data.user.id).first();
  assert.equal(storedApiKey.key_hash, createHash('sha256').update(apiKey).digest('hex'));
  assert.notEqual(storedApiKey.key_hash, apiKey);
  assert.equal(storedApiKey.key_prefix, apiKey.slice(0, 16));
  const listedKeys = await responseFor('/api/developer/keys', { cookie: billingSession });
  assert.equal(listedKeys.response.status, 200);
  assert.ok(listedKeys.data.keys.some((item) => item.id === apiKeyId));
  assert.ok(!JSON.stringify(listedKeys.data).includes(apiKey), 'list endpoint never returns the secret key');
  const apiReport = await responseFor('/api/v1/analyze', { method: 'POST', body: { url: 'https://shop.example.com/terms?source=api' }, authorization: `Bearer ${apiKey}` });
  assert.equal(apiReport.response.status, 200, JSON.stringify(apiReport.data));
  assert.equal(apiReport.data.score, 90);
  assert.ok(apiReport.data.findings.some((finding) => finding.evidence));
  assert.ok(await db.prepare(`SELECT id FROM scans WHERE id=? AND user_id=?`).bind(apiReport.data.id, signup.data.user.id).first());
  assert.ok((await db.prepare(`SELECT last_used_at FROM developer_api_keys WHERE id=?`).bind(apiKeyId).first()).last_used_at);
  assert.equal((await responseFor('/api/v1/analyze', { method: 'POST', body: { url: 'http://127.0.0.1' }, authorization: `Bearer ${apiKey}` })).response.status, 400);
  const proStatesBeforeExpiry = await db.prepare(`SELECT id,status FROM subscriptions WHERE user_id=? AND plan='pro'`).bind(signup.data.user.id).all();
  await db.prepare(`UPDATE subscriptions SET status='expired' WHERE user_id=? AND plan='pro'`).bind(signup.data.user.id).run();
  assert.equal((await responseFor('/api/v1/analyze', { method: 'POST', body: { url: 'https://shop.example.com/terms?expired=api' }, authorization: `Bearer ${apiKey}` })).response.status, 403, 'the server blocks API access immediately after Pro expires');
  await db.batch((proStatesBeforeExpiry.results || []).map((row) => db.prepare(`UPDATE subscriptions SET status=? WHERE id=?`).bind(row.status, row.id)));

  const telegramLinkMissingOrigin = await responseFor('/api/telegram/link', { method: 'POST', cookie: billingSession, body: {} });
  assert.equal(telegramLinkMissingOrigin.response.status, 403);
  const telegramLink = await responseFor('/api/telegram/link', { method: 'POST', cookie: billingSession, origin: true, body: {} });
  assert.equal(telegramLink.response.status, 200, JSON.stringify(telegramLink.data));
  assert.match(telegramLink.data.code, /^[a-f\d]{48}$/);
  assert.match(telegramLink.data.startUrl, /^https:\/\/t\.me\/sift_integration_bot\?start=/);
  const storedLinkCode = await db.prepare(`SELECT code_hash,used_at FROM telegram_link_codes WHERE user_id=?`).bind(signup.data.user.id).first();
  assert.equal(storedLinkCode.code_hash, createHash('sha256').update(telegramLink.data.code).digest('hex'));
  assert.equal(storedLinkCode.used_at, null);
  const telegramWebhookSecret = 'integration-telegram-webhook-secret-long-enough';
  const privateLinkUpdate = { update_id: 880001, message: { message_id: 1, from: { id: 9001, username: 'sift_test_owner', first_name: 'Owner' }, chat: { id: 9001, type: 'private' }, text: `/start ${telegramLink.data.code}` } };
  assert.equal((await responseFor('/api/telegram/webhook', { method: 'POST', body: privateLinkUpdate })).response.status, 401);
  const linkedTelegram = await responseFor('/api/telegram/webhook', { method: 'POST', body: privateLinkUpdate, telegramSecret: telegramWebhookSecret });
  assert.equal(linkedTelegram.response.status, 200, JSON.stringify(linkedTelegram.data));
  assert.equal((await db.prepare(`SELECT user_id,telegram_username FROM telegram_accounts WHERE telegram_user_id='9001'`).first()).user_id, signup.data.user.id);
  const sentBeforeDuplicate = telegramOutbox.length;
  assert.equal((await responseFor('/api/telegram/webhook', { method: 'POST', body: privateLinkUpdate, telegramSecret: telegramWebhookSecret })).data.duplicate, true);
  assert.equal(telegramOutbox.length, sentBeforeDuplicate, 'Telegram retries do not send duplicate replies');
  const privateReportUpdate = { update_id: 880002, message: { message_id: 2, from: { id: 9001, username: 'sift_test_owner', first_name: 'Owner' }, chat: { id: 9001, type: 'private' }, text: 'https://shop.example.com/terms?source=telegram-private' } };
  const reportsBeforeBotReply = await db.prepare(`SELECT COUNT(*) AS count FROM scans WHERE user_id=?`).bind(signup.data.user.id).first();
  telegramSendFailures = 1;
  const failedPrivateReportReply = await responseFor('/api/telegram/webhook', { method: 'POST', body: privateReportUpdate, telegramSecret: telegramWebhookSecret });
  assert.equal(failedPrivateReportReply.response.status, 503, 'a failed Telegram delivery requests webhook retry');
  const reportsAfterFirstBotReply = await db.prepare(`SELECT COUNT(*) AS count FROM scans WHERE user_id=?`).bind(signup.data.user.id).first();
  assert.equal(reportsAfterFirstBotReply.count, reportsBeforeBotReply.count + 1, 'analysis is saved before Telegram delivery');
  const privateReport = await responseFor('/api/telegram/webhook', { method: 'POST', body: privateReportUpdate, telegramSecret: telegramWebhookSecret });
  assert.equal(privateReport.response.status, 200, JSON.stringify(privateReport.data));
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM scans WHERE user_id=?`).bind(signup.data.user.id).first()).count, reportsAfterFirstBotReply.count, 'webhook retry reuses the cached reply and does not duplicate the report');
  assert.ok(telegramOutbox.at(-1).text.includes('Sift · 90/100'));
  assert.ok(telegramOutbox.at(-1).text.includes('Звіт збережено в Dashboard'));
  const telegramPrivateReportId = (await db.prepare(`SELECT id FROM scans WHERE user_id=? AND url LIKE '%source=telegram-private'`).bind(signup.data.user.id).first()).id;

  const groupChatId = -1001_000_001;
  const oversizedGroupId=-1001_000_099;
  telegramGroupMemberCount=11;
  const oversizedGroupUpdate={update_id:8800025,message:{message_id:25,from:{id:9001,username:'sift_test_owner',first_name:'Owner'},chat:{id:oversizedGroupId,type:'supergroup',title:'Too many members'},text:'/allowgroup'}};
  const oversizedGroupAttempt=await responseFor('/api/telegram/webhook',{method:'POST',body:oversizedGroupUpdate,telegramSecret:telegramWebhookSecret});
  assert.equal(oversizedGroupAttempt.response.status,200);
  assert.ok(telegramOutbox.at(-1).text.includes('максимум із 10 учасниками'));
  assert.equal(await db.prepare(`SELECT chat_id FROM telegram_group_authorizations WHERE chat_id=?`).bind(String(oversizedGroupId)).first(),null,'groups over the member cap cannot be authorized');
  telegramGroupMemberCount=10;
  const allowGroupUpdate = { update_id: 880003, message: { message_id: 3, from: { id: 9001, username: 'sift_test_owner', first_name: 'Owner' }, chat: { id: groupChatId, type: 'supergroup', title: 'Sift beta 10' }, text: '/allowgroup' } };
  assert.equal((await responseFor('/api/telegram/webhook', { method: 'POST', body: allowGroupUpdate, telegramSecret: telegramWebhookSecret })).response.status, 200);
  assert.equal((await db.prepare(`SELECT owner_user_id FROM telegram_group_authorizations WHERE chat_id=?`).bind(String(groupChatId)).first()).owner_user_id, signup.data.user.id);
  const unauthorizedGroupBefore = await db.prepare(`SELECT COUNT(*) AS count FROM scans WHERE user_id=?`).bind(signup.data.user.id).first();
  const unauthorizedGroupMessage = { update_id: 880004, message: { message_id: 4, from: { id: 9100, first_name: 'Guest' }, chat: { id: -1001_000_002, type: 'supergroup', title: 'Other group' }, text: 'https://shop.example.com/terms?blocked=group' } };
  await responseFor('/api/telegram/webhook', { method: 'POST', body: unauthorizedGroupMessage, telegramSecret: telegramWebhookSecret });
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM scans WHERE user_id=?`).bind(signup.data.user.id).first()).count, unauthorizedGroupBefore.count, 'a group without owner authorization cannot consume analysis quota');

  const groupMembers = Array.from({ length: 10 }, (_, index) => ({ id: 9200 + index, first_name: `Member ${index + 1}` }));
  for (let index = 0; index < groupMembers.length; index++) {
    const update = { update_id: 880010 + index, message: { message_id: 10 + index, from: groupMembers[index], chat: { id: groupChatId, type: 'supergroup', title: 'Sift beta 10' }, text: `https://shop.example.com/terms?group-member=${index + 1}` } };
    const response = await responseFor('/api/telegram/webhook', { method: 'POST', body: update, telegramSecret: telegramWebhookSecret });
    assert.equal(response.response.status, 200, JSON.stringify(response.data));
    assert.ok(telegramOutbox.at(-1).text.includes('Sift · 90/100'));
    assert.equal(telegramOutbox.at(-1).chat_id, groupChatId);
  }
  const groupReports = await db.prepare(`SELECT COUNT(*) AS count FROM scans WHERE user_id=? AND url LIKE '%group-member=%'`).bind(signup.data.user.id).first();
  assert.equal(groupReports.count, 10, 'all ten group members can use the explicitly authorized group and reports belong to its Pro owner');
  assert.equal((await responseFor('/api/telegram/link', { cookie: billingSession })).data.telegram.authorizedGroups, 1);

  telegramGroupMemberCount=11;
  const growthBeyondCap={update_id:880029,message:{message_id:29,from:{id:9200,first_name:'Member 1'},chat:{id:groupChatId,type:'supergroup',title:'Sift beta 10'},text:'https://shop.example.com/terms?group-over-cap'}};
  const beforeOverCapScans=await db.prepare(`SELECT COUNT(*) AS count FROM scans WHERE user_id=?`).bind(signup.data.user.id).first();
  await responseFor('/api/telegram/webhook',{method:'POST',body:growthBeyondCap,telegramSecret:telegramWebhookSecret});
  assert.ok(telegramOutbox.at(-1).text.includes('Груповий доступ призупинено'));
  assert.equal(await db.prepare(`SELECT chat_id FROM telegram_group_authorizations WHERE chat_id=?`).bind(String(groupChatId)).first(),null,'a group that grows beyond 10 members is automatically disabled');
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM scans WHERE user_id=?`).bind(signup.data.user.id).first()).count,beforeOverCapScans.count,'oversized groups do not consume analysis quota');
  telegramGroupMemberCount=10;
  const reallowGroup={update_id:8800291,message:{message_id:291,from:{id:9001,username:'sift_test_owner',first_name:'Owner'},chat:{id:groupChatId,type:'supergroup',title:'Sift beta 10'},text:'/allowgroup'}};
  await responseFor('/api/telegram/webhook',{method:'POST',body:reallowGroup,telegramSecret:telegramWebhookSecret});

  const disableGroup = { update_id: 880030, message: { message_id: 30, from: { id: 9001, first_name: 'Owner' }, chat: { id: groupChatId, type: 'supergroup', title: 'Sift beta 10' }, text: '/disablegroup' } };
  await responseFor('/api/telegram/webhook', { method: 'POST', body: disableGroup, telegramSecret: telegramWebhookSecret });
  assert.equal(await db.prepare(`SELECT chat_id FROM telegram_group_authorizations WHERE chat_id=?`).bind(String(groupChatId)).first(), null);
  const unlink = await responseFor('/api/telegram/link', { method: 'DELETE', cookie: billingSession, origin: true });
  assert.equal(unlink.response.status, 200, JSON.stringify(unlink.data));
  assert.equal(await db.prepare(`SELECT telegram_user_id FROM telegram_accounts WHERE user_id=?`).bind(signup.data.user.id).first(), null);
  assert.equal((await responseFor('/api/telegram/link', { cookie: billingSession })).data.telegram.linked, false);

  assert.ok(await db.prepare(`SELECT id FROM scans WHERE id=? AND user_id=?`).bind(telegramPrivateReportId, signup.data.user.id).first());

  // Savings Tracker: confirm three different outcomes, aggregate exact kopecks, and exercise CSV/update/delete ownership rules.
  assert.equal((await responseFor('/api/savings')).response.status, 401);
  const savingsExportUnauthed = await responseFor('/api/savings/export');
  assert.equal(savingsExportUnauthed.response.status, 401, JSON.stringify(savingsExportUnauthed.data));
  const savingsNoOrigin = await responseFor('/api/savings', { method: 'POST', cookie: billingSession, body: { scanId: tosScan.data.id, outcome: 'not_bought', amount: '20.00', confirmed: true } });
  assert.equal(savingsNoOrigin.response.status, 403);
  const savingsWrongOrigin = await responseFor('/api/savings', { method: 'POST', cookie: billingSession, origin: 'https://attacker.example', body: { scanId: tosScan.data.id, outcome: 'not_bought', amount: '20.00', confirmed: true } });
  assert.equal(savingsWrongOrigin.response.status, 403);
  const savingsUnauthed = await responseFor('/api/savings', { method: 'POST', origin: true, body: { scanId: tosScan.data.id, outcome: 'not_bought', amount: '20.00', confirmed: true } });
  assert.equal(savingsUnauthed.response.status, 401);
  assert.equal((await responseFor('/api/savings', { method: 'POST', cookie: billingSession, origin: true, body: { scanId: tosScan.data.id, outcome: 'not_bought', amount: '20.00' } })).response.status, 400);
  assert.equal((await responseFor('/api/savings', { method: 'POST', cookie: billingSession, origin: true, body: { scanId: scan.data.id, outcome: 'not_bought', amount: '20.00', confirmed: true } })).response.status, 404);
  const savingsScanTwo = await responseFor('/api/analyze', { method: 'POST', cookie: billingSession, body: { url: 'https://shop.example.com/terms?savings=2', deviceId: `savings-device-${randomUUID()}` } });
  const savingsScanThree = await responseFor('/api/analyze', { method: 'POST', cookie: billingSession, body: { url: 'https://shop.example.com/terms?savings=3', deviceId: `savings-device-${randomUUID()}` } });
  assert.equal(savingsScanTwo.response.status, 200, JSON.stringify(savingsScanTwo.data));
  assert.equal(savingsScanThree.response.status, 200, JSON.stringify(savingsScanThree.data));
  const savingsOne = await responseFor('/api/savings', { method: 'POST', cookie: billingSession, origin: true, body: { scanId: tosScan.data.id, outcome: 'not_bought', amount: '20.00', confirmed: true } });
  const savingsTwo = await responseFor('/api/savings', { method: 'POST', cookie: billingSession, origin: true, body: { scanId: savingsScanTwo.data.id, outcome: 'canceled', amount: '15.50', confirmed: true } });
  const savingsThree = await responseFor('/api/savings', { method: 'POST', cookie: billingSession, origin: true, body: { scanId: savingsScanThree.data.id, outcome: 'refunded', amount: '10.25', confirmed: true } });
  assert.equal(savingsOne.response.status, 201, JSON.stringify(savingsOne.data));
  assert.equal(savingsOne.data.fxAvailable, true);
  assert.equal(savingsTwo.response.status, 201, JSON.stringify(savingsTwo.data));
  assert.equal(savingsThree.response.status, 201, JSON.stringify(savingsThree.data));
  assert.equal((await responseFor('/api/savings', { method: 'POST', cookie: billingSession, origin: true, body: { scanId: tosScan.data.id, outcome: 'not_bought', amount: '20.00', confirmed: true } })).response.status, 409);
  const savingsList = await responseFor('/api/savings', { cookie: billingSession });
  assert.equal(savingsList.response.status, 200, JSON.stringify(savingsList.data));
  assert.equal(savingsList.data.entries.length, 3);
  assert.equal(savingsList.data.summary.entryCount, 3);
  assert.equal(savingsList.data.summary.monthMinor, 4575);
  assert.equal(savingsList.data.summary.yearMinor, 4575);
  assert.equal(savingsList.data.summary.currency, 'UAH');
  const savingsUpdate = await responseFor('/api/savings', { method: 'PUT', cookie: billingSession, origin: true, body: { scanId: savingsScanTwo.data.id, outcome: 'canceled', amount: '30.00', confirmed: true } });
  assert.equal(savingsUpdate.response.status, 200, JSON.stringify(savingsUpdate.data));
  assert.equal((await responseFor('/api/savings', { cookie: billingSession })).data.summary.monthMinor, 6025);
  const savingsCurrentYear = new Date().toISOString().slice(0, 4);
  const savingsPreviousMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 15)).toISOString();
  const savingsPreviousYear = new Date(Date.UTC(new Date().getUTCFullYear() - 1, 6, 15)).toISOString();
  await db.prepare('UPDATE savings_entries SET confirmed_at=? WHERE id=?').bind(savingsPreviousMonth, savingsThree.data.entryId).run();
  await db.prepare('UPDATE savings_entries SET confirmed_at=? WHERE id=?').bind(savingsPreviousYear, savingsOne.data.entryId).run();
  const bucketedSavings = await responseFor('/api/savings', { cookie: billingSession });
  assert.equal(bucketedSavings.data.summary.monthMinor, 3000);
  assert.equal(bucketedSavings.data.summary.yearMinor, savingsPreviousMonth.slice(0, 4) === savingsCurrentYear ? 4025 : 3000);
  const savingsCsv = await responseFor('/api/savings/export', { cookie: billingSession });
  assert.equal(savingsCsv.response.status, 200);
  assert.match(savingsCsv.response.headers.get('content-type'), /text\/csv; charset=utf-8/);
  assert.match(savingsCsv.response.headers.get('content-disposition'), /sift-savings\.csv/);
  // Response.text() uses TextDecoder, which removes the UTF-8 BOM; the policy-level test checks the BOM bytes.
  assert.ok(savingsCsv.data.startsWith('sep=;'));
  assert.ok(savingsCsv.data.includes('Скасував'));
  assert.ok(savingsCsv.data.includes('30.00'));
  assert.ok(savingsCsv.data.includes('Внесено й підтверджено користувачем'));
  const savingsDelete = await responseFor('/api/savings', { method: 'DELETE', cookie: billingSession, origin: true, body: { entryId: savingsList.data.entries.find((item) => item.scanId === savingsScanThree.data.id).id } });
  assert.equal(savingsDelete.response.status, 200, JSON.stringify(savingsDelete.data));
  const savingsAfterDelete = await responseFor('/api/savings', { cookie: billingSession });
  assert.equal(savingsAfterDelete.data.entries.length, 2);
  assert.equal(savingsAfterDelete.data.summary.entryCount, 2);
  assert.equal(savingsAfterDelete.data.summary.monthMinor, 3000);
  assert.equal((await responseFor('/api/savings', { method: 'DELETE', cookie: billingSession, origin: true, body: { entryId: 'not-owned' } })).response.status, 404);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM savings_entries WHERE user_id=?').bind(signup.data.user.id).first()).count, 2);

  // Server-issued achievements: only owned, persisted analysis and Cancellation Kit events count; repeats are idempotent.
  assert.equal((await responseFor('/api/achievements')).response.status, 401);
  assert.equal((await responseFor('/api/achievements/cancellation-kit', { method: 'POST', cookie: billingSession, body: { scanId: tosScan.data.id } })).response.status, 403);
  assert.equal((await responseFor('/api/achievements/cancellation-kit', { method: 'POST', cookie: billingSession, body: { scanId: scan.data.id }, origin: true })).response.status, 404);
  const kitEvent = await responseFor('/api/achievements/cancellation-kit', { method: 'POST', cookie: billingSession, body: { scanId: tosScan.data.id, badgeKey: 'streak_7_days' }, origin: true });
  assert.equal(kitEvent.response.status, 200, JSON.stringify(kitEvent.data));
  assert.equal((await responseFor('/api/achievements/cancellation-kit', { method: 'POST', cookie: billingSession, body: { scanId: tosScan.data.id }, origin: true })).response.status, 200);
  const achievementData = await responseFor('/api/achievements', { cookie: billingSession });
  assert.equal(achievementData.response.status, 200, JSON.stringify(achievementData.data));
  assert.equal(achievementData.data.userId, signup.data.user.id);
  assert.equal(achievementData.data.badges.length, 8);
  assert.equal(achievementData.data.catalogVersion, 1);
  const completedAnalyses = (await db.prepare(`SELECT COUNT(DISTINCT source_id) AS count FROM events WHERE user_id=? AND type='analysis_completed'`).bind(signup.data.user.id).first()).count;
  assert.equal(achievementData.data.badges.find((badge) => badge.key === 'skeptic')?.current, Math.min(completedAnalyses, 3));
  assert.equal(Boolean(achievementData.data.badges.find((badge) => badge.key === 'skeptic')?.earnedAt), completedAnalyses >= 3);
  assert.ok(achievementData.data.badges.find((badge) => badge.key === 'polyglot')?.earnedAt);
  assert.equal(achievementData.data.badges.find((badge) => badge.key === 'timely_stop')?.earnedAt, null);
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM user_achievements WHERE user_id=? AND key='polyglot'`).bind(signup.data.user.id).first()).count, 1);
  assert.equal(JSON.parse((await db.prepare(`SELECT progress FROM user_achievements WHERE user_id=? AND key='polyglot'`).bind(signup.data.user.id).first()).progress).current, 3);
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM events WHERE user_id=? AND type='cancellation_kit_used' AND source_id=?`).bind(signup.data.user.id, tosScan.data.id).first()).count, 1, 'replaying the same cancellation action is deduplicated');

  // Public verdict sharing: only the report owner can publish a minimal card, and revocation blocks the public token.
  assert.equal((await responseFor('/api/public-verdict',{method:'POST',body:{scanId:tosScan.data.id},origin:true})).response.status,401);
  assert.equal((await responseFor('/api/public-verdict',{method:'POST',cookie:billingSession,body:{scanId:tosScan.data.id}})).response.status,403);
  assert.equal((await responseFor('/api/public-verdict',{method:'POST',cookie:billingSession,body:{scanId:scan.data.id},origin:true})).response.status,404);
  const publicShareCreate=await responseFor('/api/public-verdict',{method:'POST',cookie:billingSession,body:{scanId:tosScan.data.id},origin:true});
  assert.equal(publicShareCreate.response.status,201,JSON.stringify(publicShareCreate.data));
  const publicShareUrl=new URL(publicShareCreate.data.share.url);
  assert.equal(publicShareUrl.origin,appOrigin);
  assert.equal(publicShareUrl.search,'');
  assert.equal(publicShareUrl.pathname.split('/')[1],'share');
  const publicToken=publicShareUrl.pathname.split('/').at(-1);
  assert.match(publicToken,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(publicShareCreate.data.share.score,tosScan.data.score);
  const publicCard=await responseFor(`/api/public-verdict/${publicToken}`);
  assert.equal(publicCard.response.status,200,JSON.stringify(publicCard.data));
  assert.deepEqual(Object.keys(publicCard.data).sort(),['decision','score']);
  assert.deepEqual({score:publicCard.data.score,decision:publicCard.data.decision},{score:tosScan.data.score,decision:tosScan.data.decision});
  assert.equal(JSON.stringify(publicCard.data).includes('shop.example.com'),false);
  const managedShare=await responseFor(`/api/public-verdict?scanId=${encodeURIComponent(tosScan.data.id)}`,{cookie:billingSession});
  assert.equal(managedShare.response.status,200);
  assert.equal(managedShare.data.share.url,publicShareUrl.toString());
  const repeatedCreate=await responseFor('/api/public-verdict',{method:'POST',cookie:billingSession,body:{scanId:tosScan.data.id},origin:true});
  assert.equal(repeatedCreate.response.status,201);
  assert.equal(repeatedCreate.data.share.url,publicShareUrl.toString());
  assert.equal((await responseFor('/api/public-verdict',{method:'DELETE',cookie:billingSession,body:{scanId:tosScan.data.id}})).response.status,403);
  const revokeShare=await responseFor('/api/public-verdict',{method:'DELETE',cookie:billingSession,body:{scanId:tosScan.data.id},origin:true});
  assert.equal(revokeShare.response.status,200);
  assert.equal(revokeShare.data.revoked,true);
  assert.equal((await responseFor(`/api/public-verdict/${publicToken}`)).response.status,404);
  assert.equal((await responseFor(`/api/public-verdict?scanId=${encodeURIComponent(tosScan.data.id)}`,{cookie:billingSession})).data.share,null);
  const refreshedShare=await responseFor('/api/public-verdict',{method:'POST',cookie:billingSession,body:{scanId:tosScan.data.id},origin:true});
  assert.equal(refreshedShare.response.status,201);
  assert.notEqual(refreshedShare.data.share.url,publicShareUrl.toString());

  const tosPlanner = await responseFor('/api/watchlist', {
    method: 'POST', cookie: billingSession, origin: true,
    body: { scanId: tosScan.data.id, status: 'considering' },
  });
  assert.equal(tosPlanner.response.status, 200, JSON.stringify(tosPlanner.data));
  const tosWatchlistId = tosPlanner.data.items[0].id;
  const watchlistRepeat = await responseFor('/api/watchlist', { method: 'POST', cookie: billingSession, origin: true, body: { scanId: tosScan.data.id, status: 'considering', note: 'Повторна спроба' } });
  assert.equal(watchlistRepeat.response.status, 200, JSON.stringify(watchlistRepeat.data));
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM events WHERE user_id=? AND type='watchlist_added' AND source_id=?`).bind(signup.data.user.id, tosScan.data.id).first()).count, 1, 'watchlist retries do not create duplicate events');
  const tosEnabled = await responseFor('/api/tos-monitoring', {
    method: 'POST', cookie: billingSession, origin: true,
    body: { scanId: tosScan.data.id, enabled: true },
  });
  assert.equal(tosEnabled.response.status, 200, JSON.stringify(tosEnabled.data));
  assert.equal(tosEnabled.data.item.enabled, true);
  assert.equal(tosEnabled.data.item.checked_at, null);
  assert.ok(Date.parse(tosEnabled.data.item.next_check_at) > Date.now());
  assert.equal((await responseFor('/api/tos-monitoring', { cookie: billingSession })).data.activeCount, 1);
  await db.prepare(`UPDATE tos_monitor_subscriptions SET last_error='test retry',lease_until=? WHERE watchlist_id=?`)
    .bind(new Date(Date.now() + 30_000).toISOString(), tosWatchlistId).run();
  const tosBusyRetry = await responseFor('/api/tos-monitoring', {
    method: 'POST', cookie: billingSession, origin: true,
    body: { scanId: tosScan.data.id, action: 'retry' },
  });
  assert.equal(tosBusyRetry.response.status, 409, 'manual retry does not overlap a live monitoring lease');
  assert.equal((await db.prepare(`SELECT last_error FROM tos_monitor_subscriptions WHERE watchlist_id=?`).bind(tosWatchlistId).first()).last_error, 'test retry');
  await db.prepare(`UPDATE tos_monitor_subscriptions SET lease_until=NULL WHERE watchlist_id=?`).bind(tosWatchlistId).run();
  const tosManualRetry = await responseFor('/api/tos-monitoring', {
    method: 'POST', cookie: billingSession, origin: true,
    body: { scanId: tosScan.data.id, action: 'retry' },
  });
  assert.equal(tosManualRetry.response.status, 200, JSON.stringify(tosManualRetry.data));
  assert.match(tosManualRetry.data.message, /найближчий запланований запуск/i);
  assert.equal(tosManualRetry.data.item.last_error, null);
  assert.ok(Date.parse(tosManualRetry.data.item.next_check_at) <= Date.now() + 1_000, 'manual retry is queued immediately despite worker/runner millisecond skew');

  currentPagePrice = '$14.99';
  resendFailuresRemaining = 1;
  await db.prepare(`UPDATE tos_monitor_subscriptions SET next_check_at=? WHERE watchlist_id=?`)
    .bind(new Date(Date.now() - 1000).toISOString(), tosWatchlistId).run();
  const outboxBeforeTos = emailOutbox.length;
  const tosPriceAlert = await responseFor('/api/internal/tos-monitoring', {
    method: 'POST', authorization: 'Bearer integration-cron-secret', scheduledCron: '0 8 * * 1',
  });
  assert.equal(tosPriceAlert.response.status, 503, JSON.stringify(tosPriceAlert.data));
  assert.equal(tosPriceAlert.data.checked, 1);
  assert.equal(tosPriceAlert.data.changed, 1);
  assert.equal(tosPriceAlert.data.alertsSent, 0);
  assert.equal(tosPriceAlert.data.emailFailures, 1);
  assert.equal(emailOutbox.length, outboxBeforeTos);
  assert.equal((await db.prepare(`SELECT delivery_status,attempts FROM tos_monitor_events WHERE watchlist_id=?`).bind(tosWatchlistId).first()).delivery_status, 'pending');
  const retryEventTime = new Date(Date.now() - 2 * 3600e3).toISOString();
  await db.prepare(`UPDATE tos_monitor_events SET last_attempt_at=?,lease_until=NULL WHERE watchlist_id=?`).bind(retryEventTime, tosWatchlistId).run();
  const tosRetry = await responseFor('/api/internal/tos-monitoring', {
    method: 'POST', authorization: 'Bearer integration-cron-secret', scheduledCron: '0 * * * *',
  });
  assert.equal(tosRetry.response.status, 200, JSON.stringify(tosRetry.data));
  assert.equal(tosRetry.data.checked, 0);
  assert.equal(tosRetry.data.alertsSent, 1);
  assert.equal(emailOutbox.length, outboxBeforeTos + 1);
  assert.equal(resendAttemptKeys.at(-1), resendAttemptKeys.at(-2));
  const tosEmail = emailOutbox.at(-1);
  assert.match(tosEmail.subject, /змінилися умови/i);
  assert.match(tosEmail.html, /\$12\.99/);
  assert.match(tosEmail.html, /\$14\.99/);
  assert.match(tosEmail.html, /Ціна/);
  assert.match(tosEmail.html, /Перевірити першоджерело/);
  assert.equal((await db.prepare(`SELECT delivery_status FROM tos_monitor_events WHERE watchlist_id=?`).bind(tosWatchlistId).first()).delivery_status, 'sent');
  const tosRepeatedCron = await responseFor('/api/internal/tos-monitoring', {
    method: 'POST', authorization: 'Bearer integration-cron-secret', scheduledCron: '0 * * * *',
  });
  assert.equal(tosRepeatedCron.response.status, 200);
  assert.equal(tosRepeatedCron.data.checked, 0);
  assert.equal(tosRepeatedCron.data.alertsSent, 0);
  assert.equal(emailOutbox.length, outboxBeforeTos + 1);

  // Formatting/title-only edits are not material and must not send another message.
  currentPagePrice = '14.99 USD';
  currentPageTitle = 'Updated legal page';
  await db.prepare(`UPDATE tos_monitor_subscriptions SET next_check_at=? WHERE watchlist_id=?`)
    .bind(new Date(Date.now() - 1000).toISOString(), tosWatchlistId).run();
  const tosCosmeticRun = await responseFor('/api/internal/tos-monitoring', {
    method: 'POST', authorization: 'Bearer integration-cron-secret', scheduledCron: '0 8 * * 1',
  });
  assert.equal(tosCosmeticRun.response.status, 200, JSON.stringify(tosCosmeticRun.data));
  assert.equal(tosCosmeticRun.data.checked, 1);
  assert.equal(tosCosmeticRun.data.changed, 0);
  assert.equal(tosCosmeticRun.data.alertsSent, 0);
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM tos_monitor_events WHERE watchlist_id=?`).bind(tosWatchlistId).first()).count, 1);
  const tosFlagOff = await responseFor('/api/admin/support', {
    method: 'POST', cookie: billingSession, origin: true,
    body: { action: 'set_flag', key: 'tos_monitoring', enabled: false, reason: 'Integration kill-switch check' },
  });
  assert.equal(tosFlagOff.response.status, 200, JSON.stringify(tosFlagOff.data));
  assert.equal((await responseFor('/api/tos-monitoring', { cookie: billingSession })).response.status, 503);
  await responseFor('/api/admin/support', {
    method: 'POST', cookie: billingSession, origin: true,
    body: { action: 'set_flag', key: 'tos_monitoring', enabled: true, reason: 'Integration test completed' },
  });
  const tosDisabled = await responseFor('/api/tos-monitoring', {
    method: 'POST', cookie: billingSession, origin: true,
    body: { scanId: tosScan.data.id, enabled: false },
  });
  assert.equal(tosDisabled.response.status, 200, JSON.stringify(tosDisabled.data));
  assert.equal(tosDisabled.data.item.enabled, false);
  assert.equal((await responseFor('/api/tos-monitoring', {
    method: 'POST', cookie: billingSession, origin: true,
    body: { scanId: tosScan.data.id, action: 'retry' },
  })).response.status, 404, 'manual retry is only available for an active monitor');
  const tosNoActive = await responseFor('/api/internal/tos-monitoring', {
    method: 'POST', authorization: 'Bearer integration-cron-secret',
  });
  assert.equal(tosNoActive.response.status, 200);
  assert.equal(tosNoActive.data.email, 'no_active');

  const checkoutConsent = { ...consent, acceptRefund: true, requestImmediatePerformance: true };
  const checkoutAnonymous = await responseFor('/api/billing/wayforpay/checkout', {
    method: 'POST', body: { plan: 'one', legalConsent: checkoutConsent }, origin: true,
  });
  assert.equal(checkoutAnonymous.response.status, 401);
  const checkoutNoConsent = await responseFor('/api/billing/wayforpay/checkout', {
    method: 'POST', cookie: billingSession, origin: true, body: { plan: 'one' },
  });
  assert.equal(checkoutNoConsent.response.status, 400);
  const checkoutWrongOrigin = await responseFor('/api/billing/wayforpay/checkout', {
    method: 'POST', cookie: billingSession, body: { plan: 'one', legalConsent: checkoutConsent },
  });
  assert.equal(checkoutWrongOrigin.response.status, 403);
  const checkoutBadPlan = await responseFor('/api/billing/wayforpay/checkout', {
    method: 'POST', cookie: billingSession, origin: true, body: { plan: 'free', legalConsent: checkoutConsent },
  });
  assert.equal(checkoutBadPlan.response.status, 400);
  const checkout = await responseFor('/api/billing/wayforpay/checkout', {
    method: 'POST', cookie: billingSession, origin: true, body: { plan: 'one', legalConsent: checkoutConsent,analyticsSessionId },
  });
  assert.equal(checkout.response.status, 200, JSON.stringify(checkout.data));
  assert.equal(checkout.data.price.uah, 59);
  assert.equal(checkout.data.testMode, true);
  const orderReference = checkout.data.fields.orderReference;
  assert.match(orderReference, /^sift_[a-f\d]{32}$/);
  assert.equal((await db.prepare('SELECT status FROM payment_orders WHERE order_reference=?').bind(orderReference).first()).status, 'pending');

  // Callback: malformed and unsigned events fail; a valid callback is idempotent and grants one credit.
  const callbackMalformed = await responseFor('/api/billing/wayforpay/callback', { method: 'POST', rawBody: '{bad json' });
  assert.equal(callbackMalformed.response.status, 400);
  const invalidCallback = callbackPayload(orderReference, { transactionStatus: 'Declined' });
  invalidCallback.merchantSignature = '0'.repeat(32);
  const invalidCallbackResult = await responseFor('/api/billing/wayforpay/callback', { method: 'POST', body: invalidCallback });
  assert.equal(invalidCallbackResult.response.status, 400);
  const validCallback = callbackPayload(orderReference);
  const paidCallback = await responseFor('/api/billing/wayforpay/callback', { method: 'POST', body: validCallback });
  assert.equal(paidCallback.response.status, 200, JSON.stringify(paidCallback.data));
  assert.equal(paidCallback.data.status, 'accept');
  const callbackReplay = await responseFor('/api/billing/wayforpay/callback', { method: 'POST', body: validCallback });
  assert.equal(callbackReplay.response.status, 200);
  const paymentOrder = await db.prepare('SELECT status,analytics_session_hash FROM payment_orders WHERE order_reference=?').bind(orderReference).first();
  assert.equal(paymentOrder.status, 'paid');
  assert.equal(paymentOrder.analytics_session_hash,null);
  const credit = await db.prepare('SELECT COUNT(*) AS count FROM subscriptions WHERE id=? AND user_id=? AND plan=\'one\' AND credits=1').bind(orderReference, signup.data.user.id).first();
  assert.equal(credit.count, 1);
  const event = await db.prepare('SELECT processing_status,attempts FROM billing_events WHERE order_reference=? AND event_type=\'Approved\'').bind(orderReference).first();
  assert.deepEqual(event, { processing_status: 'processed', attempts: 1 });
  const badEvent = await db.prepare('SELECT processing_status FROM billing_events WHERE order_reference=? AND signature_valid=0').bind(orderReference).first();
  assert.equal(badEvent.processing_status, 'rejected');
  const supportDetails=await responseFor(`/api/admin/support?userId=${encodeURIComponent(signup.data.user.id)}`,{cookie:billingSession});
  assert.equal(supportDetails.response.status,200,JSON.stringify(supportDetails.data));
  assert.equal(supportDetails.data.user.email,email);
  assert.ok(supportDetails.data.billingEvents.some(event=>event.order_reference===orderReference&&event.processing_status==='processed'));

  // Funnel reporting is private and counts only ordered, deduplicated stages.
  const funnel=await responseFor('/api/analytics/funnel',{cookie:billingSession});
  assert.equal(funnel.response.status,200,JSON.stringify(funnel.data));
  assert.deepEqual(funnel.data.funnel,{visit:1,analyze:1,signup:1,paywall:1,pay:1});
  assert.equal((await responseFor('/api/analytics/funnel')).response.status,401);
  const sessionHash=createHash('sha256').update(analyticsSessionId).digest('hex');
  const funnelRows=await db.prepare('SELECT COUNT(*) AS count FROM analytics_events WHERE session_hash=?').bind(sessionHash).first();
  assert.equal(funnelRows.count,5);
  await db.prepare(`INSERT INTO analytics_events(id,session_hash,stage,created_at) VALUES(?,?,?,?)`).bind(randomUUID(),createHash('sha256').update(randomUUID()).digest('hex'),'visit',new Date(Date.now()-91*864e5).toISOString()).run();
  await db.prepare(`INSERT INTO achievement_experiment_assignments(experiment_key,user_id,variant,assigned_at,expires_at) VALUES('badge_progress_visibility_v1',?,'progress',?,?)`)
    .bind(signup.data.user.id,new Date(Date.now()-100*864e5).toISOString(),new Date(Date.now()-1).toISOString()).run();
  await db.prepare(`INSERT INTO domain_index_observations(domain,user_hash,clarity_score,indicators_json,first_seen_at,last_seen_at) VALUES('expired.example','expired-hash',50,'{}',?,?)`).bind(new Date(Date.now()-366*864e5).toISOString(),new Date(Date.now()-366*864e5).toISOString()).run();
  const retention=await responseFor('/api/internal/privacy-retention',{method:'POST',authorization:'Bearer integration-cron-secret'});
  assert.equal(retention.response.status,200,JSON.stringify(retention.data));
  assert.equal(retention.data.analyticsDeleted,1);
  assert.equal(retention.data.domainObservationsDeleted,1);
  assert.equal(retention.data.experimentAssignmentsDeleted,1);
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM domain_index_observations WHERE domain='expired.example'`).first()).count,0);

  const mismatchedCheckout = await responseFor('/api/billing/wayforpay/checkout', {
    method: 'POST', cookie: billingSession, origin: true, body: { plan: 'one', legalConsent: checkoutConsent },
  });
  assert.equal(mismatchedCheckout.response.status, 200);
  const mismatchedReference = mismatchedCheckout.data.fields.orderReference;
  const wrongAmount = callbackPayload(mismatchedReference, { amount: 99 });
  const wrongAmountResult = await responseFor('/api/billing/wayforpay/callback', { method: 'POST', body: wrongAmount });
  assert.equal(wrongAmountResult.response.status, 400);
  assert.equal((await db.prepare('SELECT status FROM payment_orders WHERE order_reference=?').bind(mismatchedReference).first()).status, 'pending');
  assert.equal((await db.prepare('SELECT processing_status FROM billing_events WHERE order_reference=? AND signature_valid=1').bind(mismatchedReference).first()).processing_status, 'rejected');

  // Status route: owner can read paid status; malformed, unknown and anonymous requests are denied.
  const paymentStatus = await responseFor(`/api/billing/wayforpay/status?reference=${encodeURIComponent(orderReference)}`, { cookie: billingSession });
  assert.equal(paymentStatus.response.status, 200, JSON.stringify(paymentStatus.data));
  assert.equal(paymentStatus.data.status, 'paid');
  assert.equal((await responseFor('/api/billing/wayforpay/status?reference=bad', { cookie: billingSession })).response.status, 400);
  assert.equal((await responseFor('/api/billing/wayforpay/status?reference=sift_00000000000000000000000000000000', { cookie: billingSession })).response.status, 404);
  assert.equal((await responseFor(`/api/billing/wayforpay/status?reference=${encodeURIComponent(orderReference)}`)).response.status, 401);

  // Support case: provider confirms a real paid Pro order that has no subscription row.
  const supportProReference=`sift_${'a'.repeat(32)}`,supportRefundReference=`sift_${'b'.repeat(32)}`,supportOneReference=`sift_${'c'.repeat(32)}`,now=new Date().toISOString(),future=new Date(Date.now()+30*864e5).toISOString();
  await db.prepare(`INSERT INTO payment_orders(order_reference,user_id,plan,amount_uah,currency,status,test_mode,created_at,updated_at,expires_at) VALUES(?,?,'pro',279,'UAH','paid',0,?,?,?)`).bind(supportProReference,signup.data.user.id,now,now,future).run();
  providerCheckAmount=279;
  const reconcile=await responseFor('/api/admin/support',{method:'POST',cookie:billingSession,origin:true,body:{action:'reconcile_pro',orderReference:supportProReference}});
  assert.equal(reconcile.response.status,200,JSON.stringify(reconcile.data));
  assert.equal((await db.prepare(`SELECT status FROM subscriptions WHERE id=? AND user_id=?`).bind(supportProReference,signup.data.user.id).first()).status,'active');
  assert.equal((await db.prepare(`SELECT action FROM support_audit_log WHERE action='reconcile_pro' AND order_reference=?`).bind(supportProReference).first()).action,'reconcile_pro');
  await db.prepare(`INSERT INTO payment_orders(order_reference,user_id,plan,amount_uah,currency,status,test_mode,created_at,updated_at,expires_at) VALUES(?,?,'one',59,'UAH','pending',0,?,?,?)`).bind(supportOneReference,signup.data.user.id,now,now,future).run();
  providerCheckAmount=59;
  const reconcileOne=await responseFor('/api/admin/support',{method:'POST',cookie:billingSession,origin:true,body:{action:'reconcile_payment',orderReference:supportOneReference}});
  assert.equal(reconcileOne.response.status,200,JSON.stringify(reconcileOne.data));
  assert.equal((await db.prepare(`SELECT status FROM payment_orders WHERE order_reference=?`).bind(supportOneReference).first()).status,'paid');
  assert.equal((await db.prepare(`SELECT status,credits FROM subscriptions WHERE id=? AND plan='one'`).bind(supportOneReference).first()).credits,1);
  assert.equal((await db.prepare(`SELECT action FROM support_audit_log WHERE action='reconcile_payment' AND order_reference=?`).bind(supportOneReference).first()).action,'reconcile_payment');
  const liveRefundInSandbox=await responseFor('/api/admin/support/refund',{method:'POST',cookie:billingSession,origin:true,body:{orderReference:supportProReference,reason:'Customer request: subscription was accidental',confirmation:true}});
  assert.equal(liveRefundInSandbox.response.status,409,'sandbox must reject production payment refunds');

  // Support refund: server-sourced amount, signed provider response, idempotency, entitlement revocation.
  await db.prepare(`INSERT INTO payment_orders(order_reference,user_id,plan,amount_uah,currency,status,test_mode,created_at,updated_at,expires_at) VALUES(?,?,'one',59,'UAH','paid',1,?,?,?)`).bind(supportRefundReference,signup.data.user.id,now,now,future).run();
  await db.prepare(`INSERT INTO subscriptions(id,user_id,plan,status,credits,test_mode,created_at,expires_at,updated_at) VALUES(?,?,'one','active',1,1,?,?,?)`).bind(supportRefundReference,signup.data.user.id,now,future,now).run();
  const badRefund=await responseFor('/api/admin/support/refund',{method:'POST',cookie:billingSession,origin:true,body:{orderReference:supportRefundReference,reason:'Customer request: duplicate purchase',confirmation:'NO'}});
  assert.equal(badRefund.response.status,400);
  const refund=await responseFor('/api/admin/support/refund',{method:'POST',cookie:billingSession,origin:true,body:{orderReference:supportRefundReference,reason:'Customer request: duplicate purchase',confirmation:true}});
  assert.equal(refund.response.status,200,JSON.stringify(refund.data));
  assert.equal(refund.data.mode,'sandbox');
  assert.match(refund.data.message,/тестове повернення/);
  assert.equal((await db.prepare(`SELECT status FROM payment_orders WHERE order_reference=?`).bind(supportRefundReference).first()).status,'refunded');
  assert.equal((await db.prepare(`SELECT status,credits FROM subscriptions WHERE id=?`).bind(supportRefundReference).first()).status,'expired');
  const duplicateRefund=await responseFor('/api/admin/support/refund',{method:'POST',cookie:billingSession,origin:true,body:{orderReference:supportRefundReference,reason:'Customer request: duplicate purchase',confirmation:true}});
  assert.ok([409,429].includes(duplicateRefund.response.status));
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM support_refunds WHERE order_reference=?`).bind(supportRefundReference).first()).count,1);
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM support_audit_log WHERE action='refund_completed' AND order_reference=?`).bind(supportRefundReference).first()).count,1);
  assert.equal(JSON.parse((await db.prepare(`SELECT details_json FROM support_audit_log WHERE action='refund_completed' AND order_reference=?`).bind(supportRefundReference).first()).details_json).mode,'sandbox');

  const flagCsrf=await responseFor('/api/admin/support',{method:'POST',cookie:billingSession,body:{action:'set_flag',key:'ai_translation',enabled:false,reason:'Provider outage mitigation'}});
  assert.equal(flagCsrf.response.status,403);
  const flagUpdate=await responseFor('/api/admin/support',{method:'POST',cookie:billingSession,origin:true,body:{action:'set_flag',key:'ai_translation',enabled:false,reason:'Provider outage mitigation'}});
  assert.equal(flagUpdate.response.status,200,JSON.stringify(flagUpdate.data));
  assert.equal((await db.prepare(`SELECT enabled FROM support_feature_flags WHERE flag_key='ai_translation'`).first()).enabled,0);
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM support_audit_log WHERE action='set_feature_flag' AND json_extract(details_json,'$.key')='ai_translation'`).first()).count,1);
  await responseFor('/api/admin/support',{method:'POST',cookie:billingSession,origin:true,body:{action:'set_flag',key:'ai_translation',enabled:true,reason:'Provider restored'}});
  await responseFor('/api/admin/support',{method:'POST',cookie:billingSession,origin:true,body:{action:'set_flag',key:'email_reminders',enabled:false,reason:'Pause while reviewing delivery'}});
  const disabledReminders=await responseFor('/api/internal/email-reminders',{method:'POST',authorization:'Bearer integration-cron-secret'});
  assert.equal(disabledReminders.response.status,200);
  assert.equal(disabledReminders.data.email,'feature_disabled');
  await responseFor('/api/admin/support',{method:'POST',cookie:billingSession,origin:true,body:{action:'set_flag',key:'email_reminders',enabled:true,reason:'Reminder delivery confirmed'}});

  // Subscription Radar: Pro-only address, MIME parsing, evidence-checked imports, deduplication,
  // three-day delivery with one-click unsubscribe, immediate deletion, and seven-day retention.
  assert.equal((await responseFor('/api/subscription-radar')).response.status,401);
  const radarWrongOrigin=await responseFor('/api/subscription-radar',{method:'POST',cookie:billingSession,body:{action:'create'}});
  assert.equal(radarWrongOrigin.response.status,403);
  await db.prepare(`UPDATE subscriptions SET status='expired' WHERE user_id=? AND plan='pro'`).bind(signup.data.user.id).run();
  const radarFree=await responseFor('/api/subscription-radar',{cookie:billingSession});
  assert.equal(radarFree.response.status,403);
  await db.prepare(`UPDATE subscriptions SET status='active' WHERE id=?`).bind(tosSubscriptionId).run();
  const radarCreated=await responseFor('/api/subscription-radar',{method:'POST',cookie:billingSession,origin:true,body:{action:'create'}});
  assert.equal(radarCreated.response.status,200,JSON.stringify(radarCreated.data));
  assert.match(radarCreated.data.address,/^radar\+[a-f0-9]{50}@radar\.example\.test$/);
  const radarAddress=radarCreated.data.address,radarToken=radarAddress.match(/^radar\+([a-f0-9]{50})@/)[1];
  const radarRotated=await responseFor('/api/subscription-radar',{method:'POST',cookie:billingSession,origin:true,body:{action:'rotate'}});
  assert.equal(radarRotated.response.status,200);
  assert.notEqual(radarRotated.data.address,radarAddress);
  const activeRadarAddress=radarRotated.data.address,activeRadarToken=activeRadarAddress.match(/^radar\+([a-f0-9]{50})@/)[1];
  assert.equal((await db.prepare(`SELECT enabled FROM subscription_radar_addresses WHERE user_id=? AND token=?`).bind(signup.data.user.id,radarToken).first()),null);
  assert.equal((await db.prepare(`SELECT enabled FROM subscription_radar_addresses WHERE user_id=? AND token=?`).bind(signup.data.user.id,activeRadarToken).first()).enabled,1);
  const radarNoData=await responseFor('/api/subscription-radar',{cookie:billingSession});
  assert.equal(radarNoData.data.configured,true);
  assert.equal(radarNoData.data.rawEmailStorage,'never');
  assert.equal(radarNoData.data.items.length,0);

  const radarTodayParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const radarToday=`${radarTodayParts.find(part=>part.type==='year').value}-${radarTodayParts.find(part=>part.type==='month').value}-${radarTodayParts.find(part=>part.type==='day').value}`;
  const radarServices=[
    {service:'Netflix Premium',currency:'USD',amount:15.49,quote:'USD $15.49',variant:'plain'},
    {service:'Spotify Family',currency:'EUR',amount:17.99,quote:'EUR €17.99',variant:'html'},
    {service:'Adobe Creative Cloud',currency:'GBP',amount:59.99,quote:'GBP £59.99',variant:'alternative'},
    {service:'Dropbox Plus',currency:'UAH',amount:11.99,quote:'UAH ₴11.99',variant:'attachment'},
    {service:'Notion Plus',currency:'USD',amount:10,quote:'USD $10.00',variant:'quoted-printable'},
    {service:'iCloud+ Storage',currency:'UAH',amount:149,quote:'UAH ₴149.00',variant:'forwarded'},
    {service:'YouTube Premium',currency:'USD',amount:13.99,quote:'USD $13.99',variant:'base64'},
    {service:'Canva Pro',currency:'PLN',amount:54.99,quote:'PLN 54.99 zł',variant:'table'},
    {service:'Figma Professional',currency:'CAD',amount:24,quote:'CAD 24.00',variant:'utf8'},
    {service:'Amazon Prime',currency:'JPY',amount:1290,quote:'JPY ¥1290',variant:'mixed'},
  ].map((item,index)=>{
    const chargeDate=new Date(Date.parse(`${radarToday}T00:00:00.000Z`)+(3+index*4)*864e5).toISOString().slice(0,10);
    const dateEvidence=new Date(`${chargeDate}T00:00:00.000Z`).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
    return{...item,chargeDate,dateEvidence,plain:`Your ${item.service} subscription is active.\nThe next charge is ${item.quote} on ${dateEvidence}.`,mockResult:{is_subscription:true,service_name:item.service,amount:item.amount,currency:item.currency,next_charge_date:chargeDate,price_evidence:item.quote,date_evidence:dateEvidence,confidence:0.98}};
  });
  const mimeFor=(item,index)=>{
    const headers=`From: billing@receipts.example\r\nTo: ${activeRadarAddress}\r\nSubject: ${item.service} renewal confirmation\r\nMessage-ID: <radar-${index}@receipts.example>\r\nMIME-Version: 1.0\r\n`;
    if(item.variant==='html')return `${headers}Content-Type: text/html; charset=utf-8\r\n\r\n<html><body><p>Your ${item.service} subscription is active.</p><p>The next charge is ${item.quote} on ${item.dateEvidence}.</p></body></html>`;
    if(item.variant==='alternative')return `${headers}Content-Type: multipart/alternative; boundary="radar-boundary-${index}"\r\n\r\n--radar-boundary-${index}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${item.plain}\r\n--radar-boundary-${index}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>${item.plain.replaceAll('\n','<br>')}</p>\r\n--radar-boundary-${index}--`;
    if(item.variant==='attachment')return `${headers}Content-Type: multipart/mixed; boundary="radar-file-${index}"\r\n\r\n--radar-file-${index}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${item.plain}\r\n--radar-file-${index}\r\nContent-Type: application/pdf; name="receipt.pdf"\r\nContent-Disposition: attachment; filename="receipt.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0xLjQKJSVFT0Y=\r\n--radar-file-${index}--`;
    if(item.variant==='quoted-printable')return `${headers}Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${item.plain.replaceAll(' ','=20').replaceAll('\n','=0A\r\n')}`;
    if(item.variant==='forwarded')return `${headers}Content-Type: text/plain; charset=utf-8\r\n\r\n---------- Forwarded message ---------\r\nFrom: billing@receipts.example\r\n\r\n${item.plain}`;
    if(item.variant==='base64')return `${headers}Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(item.plain,'utf8').toString('base64')}`;
    if(item.variant==='table')return `${headers}Content-Type: text/html; charset=utf-8\r\n\r\n<table><tr><td>${item.service} renewal</td></tr><tr><td>Next charge</td><td>${item.quote}</td><td>${item.dateEvidence}</td></tr></table>`;
    if(item.variant==='utf8')return `${headers}Content-Type: text/plain; charset=utf-8\r\n\r\n${item.plain}\r\nДякуємо за підписку.`;
    if(item.variant==='mixed')return `${headers}Content-Type: multipart/alternative; boundary="mix-${index}"\r\n\r\n--mix-${index}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${item.plain}\r\n--mix-${index}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<b>${item.plain}</b>\r\n--mix-${index}--`;
    return `${headers}Content-Type: text/plain; charset=utf-8\r\n\r\n${item.plain}`;
  };
  const authResults='mx.cloudflare.net; dmarc=pass header.from=receipts.example; spf=pass smtp.mailfrom=receipts.example; dkim=pass header.d=receipts.example';
  const firstRadarMail=mimeFor(radarServices[0],0);
  const badRadarAuth=await responseFor('/__test/subscription-radar/email',{method:'POST',body:{raw:firstRadarMail,recipient:activeRadarAddress,authenticationResults:'mx.cloudflare.net; dmarc=fail',mockResult:radarServices[0].mockResult}});
  assert.equal(badRadarAuth.data.status,'rejected');
  const forgedRadarAuth=await responseFor('/__test/subscription-radar/email',{method:'POST',body:{raw:firstRadarMail,recipient:activeRadarAddress,authenticationResults:'mx.cloudflare.net; dmarc=fail, mx.cloudflare.net; dmarc=pass',mockResult:radarServices[0].mockResult}});
  assert.equal(forgedRadarAuth.data.status,'rejected');
  const unknownRadarAddress=await responseFor('/__test/subscription-radar/email',{method:'POST',body:{raw:firstRadarMail,recipient:`radar+${'0'.repeat(50)}@radar.example.test`,authenticationResults:authResults,mockResult:radarServices[0].mockResult}});
  assert.equal(unknownRadarAddress.data.status,'rejected');
  for(let index=0;index<radarServices.length;index++){
    const sample=radarServices[index],result=await responseFor('/__test/subscription-radar/email',{method:'POST',body:{raw:mimeFor(sample,index),recipient:activeRadarAddress,authenticationResults:authResults,mockResult:sample.mockResult}});
    assert.equal(result.data.status,'processed',`${sample.variant}: ${JSON.stringify(result.data)}`);
  }
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM subscription_radar_items WHERE user_id=?`).bind(signup.data.user.id).first()).count,10);
  const replay=await responseFor('/__test/subscription-radar/email',{method:'POST',body:{raw:firstRadarMail,recipient:activeRadarAddress,authenticationResults:authResults,mockResult:radarServices[0].mockResult}});
  assert.equal(replay.data.duplicate,true);
  const secondForward=`${firstRadarMail}\r\nX-Forwarded-By: integration fixture\r\n`;
  const sameServiceAndDate=await responseFor('/__test/subscription-radar/email',{method:'POST',body:{raw:secondForward,recipient:activeRadarAddress,authenticationResults:authResults,mockResult:radarServices[0].mockResult}});
  assert.equal(sameServiceAndDate.data.status,'processed');
  const deduplicatedItem=await db.prepare(`SELECT source_count FROM subscription_radar_items WHERE user_id=? AND service_key='netflix-premium' AND next_charge_date=?`).bind(signup.data.user.id,radarServices[0].chargeDate).first();
  assert.equal(deduplicatedItem.source_count,2);
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM subscription_radar_items WHERE user_id=?`).bind(signup.data.user.id).first()).count,10);
  const invalidEvidence=await responseFor('/__test/subscription-radar/email',{method:'POST',body:{raw:`${firstRadarMail}\r\nX-Forwarded-By: evidence-test\r\n`,recipient:activeRadarAddress,authenticationResults:authResults,mockResult:{...radarServices[0].mockResult,price_evidence:'USD $999.99'}}});
  assert.equal(invalidEvidence.data.status,'needs_review');
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM subscription_radar_items WHERE user_id=?`).bind(signup.data.user.id).first()).count,10);
  const radarColumns=await db.prepare(`PRAGMA table_info(subscription_radar_receipts)`).all();
  assert.ok(!radarColumns.results.some(column=>['raw_body','sender','subject','email_text'].includes(column.name)));
  const radarReminderBefore=emailOutbox.length;
  const radarReminderRun=await responseFor('/__test/subscription-radar/reminders',{method:'POST',body:{now:new Date().toISOString()}});
  assert.equal(radarReminderRun.data.sent,1,JSON.stringify(radarReminderRun.data));
  assert.equal(emailOutbox.length,radarReminderBefore+1);
  const radarReminderEmail=emailOutbox.at(-1);
  assert.match(radarReminderEmail.subject,/за 3 дні/i);
  assert.match(radarReminderEmail.html,/Netflix Premium/);
  assert.match(radarReminderEmail.html,/наступне списання/i);
  assert.equal(radarReminderEmail.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
  const radarReminderAgain=await responseFor('/__test/subscription-radar/reminders',{method:'POST',body:{now:new Date().toISOString()}});
  assert.equal(radarReminderAgain.data.sent,0);
  assert.equal(emailOutbox.length,radarReminderBefore+1);
  const radarUnsubscribeHref=radarReminderEmail.html.match(/href="([^"]*\/api\/email-reminders\/unsubscribe\?token=[^"]+)"/);
  assert.ok(radarUnsubscribeHref);
  const radarUnsubscribe=await responseFor(new URL(radarUnsubscribeHref[1]).pathname+new URL(radarUnsubscribeHref[1]).search);
  assert.equal(radarUnsubscribe.response.status,200);
  assert.equal((await db.prepare(`SELECT enabled FROM email_reminder_preferences WHERE user_id=?`).bind(signup.data.user.id).first()).enabled,0);
  const radarDeleteAll=await responseFor('/api/subscription-radar',{method:'DELETE',cookie:billingSession,origin:true,body:{action:'purge_data'}});
  assert.equal(radarDeleteAll.response.status,200,JSON.stringify(radarDeleteAll.data));
  assert.equal(radarDeleteAll.data.items.length,0);
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM subscription_radar_receipts WHERE user_id=?`).bind(signup.data.user.id).first()).count,0);
  await db.prepare(`INSERT INTO subscription_radar_receipts(id,user_id,message_hash,status,received_at,expires_at) VALUES(?,?,'expired-radar-test-hash','needs_review',?,?)`).bind(randomUUID(),signup.data.user.id,new Date(Date.now()-8*864e5).toISOString(),new Date(Date.now()-1000).toISOString()).run();
  const radarCron=await responseFor('/api/internal/subscription-radar',{method:'POST',authorization:'Bearer integration-cron-secret'});
  assert.equal(radarCron.response.status,200,JSON.stringify(radarCron.data));
  assert.equal(radarCron.data.expiredReceipts,1);
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM subscription_radar_receipts WHERE user_id=?`).bind(signup.data.user.id).first()).count,0);
  const radarFlagOff=await responseFor('/api/admin/support',{method:'POST',cookie:billingSession,origin:true,body:{action:'set_flag',key:'subscription_radar',enabled:false,reason:'Integration kill-switch test'}});
  assert.equal(radarFlagOff.response.status,200,JSON.stringify(radarFlagOff.data));
  assert.equal((await responseFor('/api/subscription-radar',{cookie:billingSession})).response.status,503);
  const radarDisabled=await responseFor('/__test/subscription-radar/email',{method:'POST',body:{raw:firstRadarMail,recipient:activeRadarAddress,authenticationResults:authResults,mockResult:radarServices[0].mockResult}});
  assert.equal(radarDisabled.data.status,'rejected');
  assert.equal(radarDisabled.data.reason,'feature_disabled');
  await responseFor('/api/admin/support',{method:'POST',cookie:billingSession,origin:true,body:{action:'set_flag',key:'subscription_radar',enabled:true,reason:'Integration test completed'}});

  // Shared family/team space: separate WayForPay pass, invite link, server-checked roles, and shared calendar CRUD.
  assert.equal((await responseFor('/api/spaces')).response.status, 401);
  const spaceCreate = await responseFor('/api/spaces', { method: 'POST', cookie: billingSession, origin: true, body: { title: 'Команда Sift' } });
  assert.equal(spaceCreate.response.status, 201, JSON.stringify(spaceCreate.data));
  const spaceId = spaceCreate.data.space.id;
  assert.equal(spaceCreate.data.space.status, 'pending');
  assert.equal(spaceCreate.data.space.role, 'owner');
  const spaceNoOrigin = await responseFor('/api/spaces', { method: 'POST', cookie: billingSession, body: { title: 'No CSRF' } });
  assert.equal(spaceNoOrigin.response.status, 403);
  assert.equal((await responseFor(`/api/spaces/${spaceId}/invites`, { method: 'POST', cookie: billingSession, origin: true, body: {} })).response.status, 409, 'invites stay closed before the separate space payment');
  assert.equal((await responseFor(`/api/spaces/${spaceId}/checkout`, { method: 'POST', cookie: billingSession, body: { legalConsent: checkoutConsent }, origin: 'https://attacker.example' })).response.status, 403);
  assert.equal((await responseFor(`/api/spaces/${spaceId}/checkout`, { method: 'POST', cookie: billingSession, origin: true, body: {} })).response.status, 400);
  const spaceCheckout = await responseFor(`/api/spaces/${spaceId}/checkout`, { method: 'POST', cookie: billingSession, origin: true, body: { amountUah: 1, plan: 'free', legalConsent: checkoutConsent } });
  assert.equal(spaceCheckout.response.status, 200, JSON.stringify(spaceCheckout.data));
  assert.equal(spaceCheckout.data.price.uah, 119);
  assert.equal(spaceCheckout.data.price.termDays, 30);
  assert.equal(spaceCheckout.data.price.autoRenew, false);
  assert.equal(spaceCheckout.data.fields.amount, 119, 'provider amount is fixed by the server regardless of client plan or amount');
  const spacePaymentReference = spaceCheckout.data.fields.orderReference;
  assert.match(spacePaymentReference, /^space_[a-f\d]{32}$/);
  assert.equal((await db.prepare(`SELECT amount_uah,status FROM shared_space_orders WHERE order_reference=?`).bind(spacePaymentReference).first()).amount_uah, 119);
  assert.ok((await db.prepare(`SELECT order_reference FROM shared_space_legal_acceptances WHERE order_reference=? AND user_id=?`).bind(spacePaymentReference, signup.data.user.id).first()));
  const wrongSpaceAmount = callbackPayload(spacePaymentReference, { amount: 118 });
  assert.equal((await responseFor('/api/billing/wayforpay/callback', { method: 'POST', body: wrongSpaceAmount })).response.status, 400);
  const paidSpaceCallback = callbackPayload(spacePaymentReference, { amount: 119 });
  const spacePaidEvent = await responseFor('/api/billing/wayforpay/callback', { method: 'POST', body: paidSpaceCallback });
  assert.equal(spacePaidEvent.response.status, 200, JSON.stringify(spacePaidEvent.data));
  const firstSpaceExpiry = (await db.prepare(`SELECT expires_at FROM shared_spaces WHERE id=?`).bind(spaceId).first()).expires_at;
  assert.ok(Date.parse(firstSpaceExpiry) > Date.now());
  assert.equal((await db.prepare(`SELECT status FROM shared_spaces WHERE id=?`).bind(spaceId).first()).status, 'active');
  assert.equal((await db.prepare(`SELECT status FROM shared_space_orders WHERE order_reference=?`).bind(spacePaymentReference).first()).status, 'paid');
  assert.equal((await responseFor('/api/billing/wayforpay/callback', { method: 'POST', body: paidSpaceCallback })).response.status, 200);
  assert.equal((await db.prepare(`SELECT expires_at FROM shared_spaces WHERE id=?`).bind(spaceId).first()).expires_at, firstSpaceExpiry, 'replayed webhook does not extend the pass twice');
  assert.deepEqual(await db.prepare(`SELECT processing_status,attempts FROM billing_events WHERE order_reference=? AND event_type='Approved'`).bind(spacePaymentReference).first(), { processing_status: 'processed', attempts: 1 });
  const memberLimit = await responseFor(`/api/spaces/${spaceId}/billing?reference=${encodeURIComponent(spacePaymentReference)}`, { cookie: billingSession });
  assert.equal(memberLimit.response.status, 200);
  assert.equal(memberLimit.data.status, 'paid');
  const distinctReplay = callbackPayload(spacePaymentReference, { amount: 119, authCode: '000001' });
  assert.equal((await responseFor('/api/billing/wayforpay/callback', { method: 'POST', body: distinctReplay })).response.status, 200);
  assert.equal((await db.prepare(`SELECT expires_at FROM shared_spaces WHERE id=?`).bind(spaceId).first()).expires_at, firstSpaceExpiry, 'a second signed event for the same order cannot add another term');
  const renewalCheckout = await responseFor(`/api/spaces/${spaceId}/checkout`, { method: 'POST', cookie: billingSession, origin: true, body: { legalConsent: checkoutConsent } });
  assert.equal(renewalCheckout.response.status, 200);
  const renewalReference = renewalCheckout.data.fields.orderReference;
  providerCheckAmount = 119;
  const reconciledRenewal = await responseFor(`/api/spaces/${spaceId}/billing?reference=${encodeURIComponent(renewalReference)}`, { cookie: billingSession });
  assert.equal(reconciledRenewal.response.status, 200, JSON.stringify(reconciledRenewal.data));
  assert.equal(reconciledRenewal.data.status, 'paid', 'the authenticated status check reconciles a separate WayForPay payment');
  const secondSpaceExpiry = (await db.prepare(`SELECT expires_at FROM shared_spaces WHERE id=?`).bind(spaceId).first()).expires_at;
  assert.ok(Date.parse(secondSpaceExpiry) > Date.parse(firstSpaceExpiry) + 29 * 864e5, 'renewals append 30 days instead of resetting remaining access');

  const spaceInvite = await responseFor(`/api/spaces/${spaceId}/invites`, { method: 'POST', cookie: billingSession, origin: true, body: {} });
  assert.equal(spaceInvite.response.status, 201, JSON.stringify(spaceInvite.data));
  const inviteUrl = new URL(spaceInvite.data.invite.url);
  const inviteToken = inviteUrl.searchParams.get('invite');
  assert.match(inviteToken || '', /^[a-f\d]{64}$/);
  const storedInviteHash = (await db.prepare(`SELECT token_hash FROM shared_space_invites WHERE id=?`).bind(spaceInvite.data.invite.id).first()).token_hash;
  assert.equal(storedInviteHash, createHash('sha256').update(inviteToken).digest('hex'));
  assert.notEqual(storedInviteHash, inviteToken);
  assert.equal((await responseFor(`/api/spaces/${spaceId}/checkout`, { method: 'POST', cookie: billingSession, origin: true, body: { legalConsent: checkoutConsent } })).response.status, 200);

  const secondEmail = `shared-member-${randomUUID()}@example.com`;
  const secondPassword = 'Shared-member-passphrase-462!';
  const secondSignup = await responseFor('/api/auth/signup', { method: 'POST', origin: true, body: { email: secondEmail, password: secondPassword, turnstileToken: 'valid-signup-token', legalConsent: consent } });
  assert.equal(secondSignup.response.status, 201, JSON.stringify(secondSignup.data));
  const unverifiedSecondSession = sessionFrom(secondSignup.response);
  assert.equal((await responseFor('/api/spaces', { method: 'POST', cookie: unverifiedSecondSession, origin: true, body: { title: 'Unverified' } })).response.status, 403);
  const secondVerificationToken = tokenFromEmail(emailOutbox.at(-1), '/verify-email');
  assert.equal((await responseFor('/api/auth/verify-email', { method: 'POST', body: { token: secondVerificationToken } })).response.status, 200);
  const secondLogin = await responseFor('/api/auth/login', { method: 'POST', body: { email: secondEmail, password: secondPassword } });
  assert.equal(secondLogin.response.status, 200);
  const secondSession = sessionFrom(secondLogin.response);
  assert.equal((await responseFor('/api/developer/keys', { method: 'POST', cookie: secondSession, origin: true, body: { label: 'Free account' } })).response.status, 403, 'Free accounts cannot create API keys');
  assert.equal((await responseFor('/api/spaces', { method: 'POST', cookie: secondSession, origin: true, body: { title: 'Тест' } })).response.status, 201);
  const memberOwnSpace = (await responseFor('/api/spaces', { cookie: secondSession })).data.spaces[0];
  const memberOwnCheckout = await responseFor(`/api/spaces/${memberOwnSpace.id}/checkout`, { method: 'POST', cookie: secondSession, origin: true, body: { legalConsent: checkoutConsent } });
  assert.equal(memberOwnCheckout.response.status, 403, 'a member role cannot bill another owner’s space');
  const acceptedInvite = await responseFor('/api/spaces/invites/accept', { method: 'POST', cookie: secondSession, origin: true, body: { token: inviteToken } });
  assert.equal(acceptedInvite.response.status, 200, JSON.stringify(acceptedInvite.data));
  assert.equal(acceptedInvite.data.spaceId, spaceId);
  assert.equal((await responseFor(`/api/spaces/${spaceId}`, { cookie: secondSession })).data.space.role, 'member');
  assert.equal((await responseFor(`/api/spaces/${spaceId}/invites`, { method: 'POST', cookie: secondSession, origin: true, body: {} })).response.status, 403);
  assert.equal((await responseFor(`/api/spaces/${spaceId}`, { method: 'PATCH', cookie: secondSession, origin: true, body: { action: 'remove_member', memberId: signup.data.user.id } })).response.status, 403);
  assert.equal((await responseFor(`/api/spaces/${spaceId}/checkout`, { method: 'POST', cookie: secondSession, origin: true, body: { legalConsent: checkoutConsent } })).response.status, 403);
  const ownerItem = await responseFor(`/api/spaces/${spaceId}/items`, { method: 'POST', cookie: billingSession, origin: true, body: { title: 'Cloud storage', serviceUrl: 'https://shop.example.com/account', amountMinor: 89900, currency: 'UAH', nextChargeDate: '2026-12-14', assignedToUserId: secondSignup.data.user.id, note: 'Перевірити план перед списанням' } });
  assert.equal(ownerItem.response.status, 201, JSON.stringify(ownerItem.data));
  const ownerItemId = ownerItem.data.space.items[0].id;
  assert.equal(ownerItem.data.space.items[0].assigned_email, secondEmail);
  const memberCannotChangeOwnerItem = await responseFor(`/api/spaces/${spaceId}/items`, { method: 'PUT', cookie: secondSession, origin: true, body: { itemId: ownerItemId, title: 'Hijacked', status: 'active' } });
  assert.equal(memberCannotChangeOwnerItem.response.status, 404, 'members can only edit items they created');
  const memberItem = await responseFor(`/api/spaces/${spaceId}/items`, { method: 'POST', cookie: secondSession, origin: true, body: { title: 'Video plan', amountMinor: 129900, currency: 'USD', nextChargeDate: '2026-11-20', assignedToUserId: signup.data.user.id } });
  assert.equal(memberItem.response.status, 201, JSON.stringify(memberItem.data));
  assert.equal(memberItem.data.space.items.length, 2);
  const memberItemId = memberItem.data.space.items.find((item) => item.title === 'Video plan').id;
  const ownerSharedView = await responseFor(`/api/spaces/${spaceId}`, { cookie: billingSession });
  assert.equal(ownerSharedView.response.status, 200);
  assert.equal(ownerSharedView.data.space.items.length, 2, 'owner and member read the same shared watchlist and calendar');
  const memberItemUpdated = await responseFor(`/api/spaces/${spaceId}/items`, { method: 'PUT', cookie: secondSession, origin: true, body: { itemId: memberItemId, title: 'Video plan annual', amountMinor: 129900, currency: 'USD', status: 'canceling' } });
  assert.equal(memberItemUpdated.response.status, 200);
  assert.equal(memberItemUpdated.data.space.items.find((item) => item.id === memberItemId).status, 'canceling');
  assert.equal((await responseFor(`/api/spaces/${spaceId}/items`, { method: 'DELETE', cookie: secondSession, origin: true, body: { itemId: memberItemId } })).response.status, 200);
  assert.equal((await responseFor(`/api/spaces/${spaceId}/items`, { cookie: billingSession })).data.items.length, 1);
  assert.equal((await responseFor(`/api/spaces/${spaceId}`, { cookie: secondSession })).data.space.members.length, 2);
  assert.equal((await responseFor(`/api/spaces/${spaceId}/invites`, { method: 'DELETE', cookie: billingSession, origin: true, body: { inviteId: spaceInvite.data.invite.id } })).response.status, 200);
  assert.equal((await responseFor('/api/spaces/invites/accept', { method: 'POST', cookie: secondSession, origin: true, body: { token: inviteToken } })).response.status, 410, 'revoked links cannot be reused even by a previous member');
  assert.equal((await responseFor(`/api/spaces/${spaceId}`, { method: 'PATCH', cookie: billingSession, origin: true, body: { action: 'remove_member', memberId: secondSignup.data.user.id } })).response.status, 200);
  assert.equal((await responseFor(`/api/spaces/${spaceId}`, { cookie: secondSession })).response.status, 404, 'removed members immediately lose server-side access');
  assert.equal((await responseFor(`/api/spaces/${spaceId}/items`, { cookie: secondSession })).response.status, 404);
  assert.equal((await db.prepare(`SELECT assigned_to_user_id FROM shared_space_items WHERE id=?`).bind(ownerItemId).first()).assigned_to_user_id, null);

  // Force the shared Pro bucket over its exact 30/min limit; the API uses the same server-side counter as web/Telegram.
  const accountRateHash = createHash('sha256').update(`analyze:pro\0account\0${signup.data.user.id}`).digest('hex');
  const rateStartedAt = Date.now() - 1000;
  await db.prepare(`INSERT OR REPLACE INTO request_rate_limits(key_hash,window_started_at,request_count,expires_at) VALUES(?,?,30,?)`).bind(accountRateHash, rateStartedAt, Date.now() + 120_000).run();
  const overLimit = await responseFor('/api/v1/analyze', { method: 'POST', body: { url: 'https://shop.example.com/terms?rate-limit' }, authorization: `Bearer ${apiKey}` });
  assert.equal(overLimit.response.status, 429, JSON.stringify(overLimit.data));
  assert.ok(Number(overLimit.response.headers.get('retry-after')) >= 1);
  await db.prepare(`DELETE FROM request_rate_limits WHERE key_hash=?`).bind(accountRateHash).run();
  const revokeApiKey = await responseFor('/api/developer/keys', { method: 'DELETE', cookie: billingSession, origin: true, body: { id: apiKeyId } });
  assert.equal(revokeApiKey.response.status, 200, JSON.stringify(revokeApiKey.data));
  assert.equal((await responseFor('/api/v1/analyze', { method: 'POST', body: { url: 'https://shop.example.com/terms' }, authorization: `Bearer ${apiKey}` })).response.status, 401, 'revoked API keys stop working immediately');
  const cancelNow = new Date().toISOString(), cancelExpiry = new Date(Date.now() + 30 * 864e5).toISOString();
  const cancelSubscriptionId = `integration-cancel-pro-${randomUUID()}`;
  await db.prepare(`INSERT INTO subscriptions(id,user_id,plan,status,credits,test_mode,created_at,expires_at,updated_at,recurring_order_reference)
    VALUES(?,?,'pro','active',0,1,?,?,?,?)`).bind(cancelSubscriptionId, signup.data.user.id, cancelNow, cancelExpiry, cancelNow, `sift-recurring-${randomUUID()}`).run();
  assert.equal((await responseFor('/api/billing/subscription/cancel', { method: 'POST', cookie: billingSession })).response.status, 403, 'subscription cancellation requires same-origin validation');
  const canceledSubscription = await responseFor('/api/billing/subscription/cancel', { method: 'POST', cookie: billingSession, origin: true });
  assert.equal(canceledSubscription.response.status, 200, JSON.stringify(canceledSubscription.data));
  assert.equal(canceledSubscription.data.subscription.cancel_at_period_end, 1);
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM events WHERE user_id=? AND type='subscription_canceled' AND source_id=?`).bind(signup.data.user.id, cancelSubscriptionId).first()).count, 1);
  const referralOwnerIp = '198.51.100.200';
  const referralLink = await responseFor('/api/referral?deviceId=ref-owner-device-001', { cookie: billingSession, ip: referralOwnerIp });
  assert.equal(referralLink.response.status, 200, JSON.stringify(referralLink.data));
  const referralToken = new URL(referralLink.data.url).pathname.split('/').at(-1);
  assert.match(referralToken, /^[A-Za-z0-9_-]{43}$/);
  const referralOwnerHashes = await db.prepare(`SELECT owner_ip_hash,owner_device_hash FROM referral_links WHERE owner_user_id=?`).bind(signup.data.user.id).first();
  assert.match(referralOwnerHashes.owner_ip_hash, /^[a-f\d]{64}$/);
  assert.match(referralOwnerHashes.owner_device_hash, /^[a-f\d]{64}$/);
  const referredEmail = `referral-${randomUUID()}@example.com`;
  const referredSignup = await responseFor('/api/auth/signup', { method: 'POST', ip: '198.51.100.201', body: { email: referredEmail, password, turnstileToken: 'valid-signup-token', legalConsent: consent, referralToken, deviceId: 'ref-new-device-001' } });
  assert.equal(referredSignup.response.status, 201, JSON.stringify(referredSignup.data));
  const referredVerifyToken = tokenFromEmail(emailOutbox.at(-1), '/verify-email');
  const referredVerified = await responseFor('/api/auth/verify-email', { method: 'POST', body: { token: referredVerifyToken } });
  assert.equal(referredVerified.response.status, 200, JSON.stringify(referredVerified.data));
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM events WHERE user_id=? AND type='referral_completed'`).bind(signup.data.user.id).first()).count, 1);
  const referredAchievement = await responseFor('/api/achievements', { cookie: billingSession });
  assert.ok(referredAchievement.data.badges.find((badge) => badge.key === 'mentor')?.earnedAt);
  assert.equal(referredAchievement.data.confirmedReferrals, 1, 'dashboard referral count includes only email-confirmed referrals');
  assert.equal(referredAchievement.data.recentStreak.length, 7, 'achievement API returns exactly seven UTC activity markers');
  assert.ok(referredAchievement.data.badges.every((badge) => typeof badge.condition === 'string' && badge.condition.length > 0));

  const mentorReward = await db.prepare(`SELECT id,status FROM rewards WHERE user_id=? AND reward_key='badge:mentor:one_credit'`).bind(signup.data.user.id).first();
  assert.ok(mentorReward, 'completed, verified referral creates one idempotent mentor reward ledger row');
  await responseFor('/api/achievements', { cookie: billingSession });
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM rewards WHERE user_id=? AND reward_key='badge:mentor:one_credit'`).bind(signup.data.user.id).first()).count, 1, 'replaying achievement projection does not duplicate a reward');

  const repeatedDeviceSignup = await responseFor('/api/auth/signup', { method: 'POST', ip: '198.51.100.202', body: { email: `ref-device-repeat-${randomUUID()}@example.com`, password, turnstileToken: 'valid-signup-token', legalConsent: consent, referralToken, deviceId: 'ref-new-device-001' } });
  assert.equal(repeatedDeviceSignup.response.status, 201, JSON.stringify(repeatedDeviceSignup.data));
  for (let index = 0; index < 5; index++) {
    const fakeIp = index === 0 ? '198.51.100.201' : referralOwnerIp;
    const fakeSignup = await responseFor('/api/auth/signup', { method: 'POST', ip: fakeIp, body: { email: `ref-same-ip-${index}-${randomUUID()}@example.com`, password, turnstileToken: 'valid-signup-token', legalConsent: consent, referralToken, deviceId: `ref-fake-device-${index}-001` } });
    assert.equal(fakeSignup.response.status, 201, JSON.stringify(fakeSignup.data));
  }
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM referral_attributions WHERE referrer_user_id=?`).bind(signup.data.user.id).first()).count, 1, 'same-IP or repeated-device accounts do not increase referral attribution');
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM events WHERE user_id=? AND type='referral_completed'`).bind(signup.data.user.id).first()).count, 1);
  const referralIdentityHashes = await db.prepare(`SELECT referee_email_hash,referee_device_hash,referee_ip_hash FROM referral_attributions WHERE referee_user_id=?`).bind(referredSignup.data.user.id).first();
  assert.ok(Object.values(referralIdentityHashes).every((value) => /^[a-f\d]{64}$/.test(value)), 'referral abuse checks store keyed fingerprints, not raw email, device ID or IP');

  const quotaEmail = `reward-quota-${randomUUID()}@example.com`;
  const quotaSignup = await responseFor('/api/auth/signup', { method: 'POST', ip: '198.51.100.203', body: { email: quotaEmail, password, turnstileToken: 'valid-signup-token', legalConsent: consent } });
  assert.equal(quotaSignup.response.status, 201, JSON.stringify(quotaSignup.data));
  const quotaSession = sessionFrom(quotaSignup.response);
  const quarterKey = `${new Date().getUTCFullYear()}-Q${Math.floor(new Date().getUTCMonth() / 3) + 1}`;
  const quarterNow = new Date().toISOString(), quarterExpiry = new Date(Date.now() + 90 * 864e5).toISOString();
  for (let index = 0; index < 3; index++) {
    await db.prepare(`INSERT INTO rewards(id,user_id,reward_key,reward_type,status,quarter_key,created_at,expires_at,metadata_json) VALUES(?,? ,?,'one_credit','available',?,?,?,'{}')`)
      .bind(randomUUID(), quotaSignup.data.user.id, `integration:quarter-credit:${index}`, quarterKey, quarterNow, quarterExpiry).run();
  }
  for (let index = 0; index < 3; index++) {
    const sourceId = `quota-analysis-${index}`;
    await db.prepare(`INSERT INTO events(id,user_id,type,source_id,payload,created_at) VALUES(?,?,'analysis_completed',?,?,?)`)
      .bind(randomUUID(), quotaSignup.data.user.id, sourceId, JSON.stringify({ scanId: sourceId }), quarterNow).run();
  }
  const quotaProjection = await responseFor('/api/achievements', { cookie: quotaSession });
  assert.equal(quotaProjection.response.status, 200, JSON.stringify(quotaProjection.data));
  const cappedReward = await db.prepare(`SELECT status FROM rewards WHERE user_id=? AND reward_key='badge:skeptic:one_credit'`).bind(quotaSignup.data.user.id).first();
  assert.equal(cappedReward.status, 'capped');
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM rewards WHERE user_id=? AND reward_type='one_credit' AND quarter_key=? AND status!='capped'`).bind(quotaSignup.data.user.id, quarterKey).first()).count, 3, 'quarterly ledger never issues a fourth free credit');
  await responseFor('/api/achievements', { cookie: quotaSession });
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM rewards WHERE user_id=? AND reward_key='badge:skeptic:one_credit'`).bind(quotaSignup.data.user.id).first()).count, 1, 'capped reward remains idempotent on projection replay');
  const quotaWallet = await responseFor('/api/rewards', { cookie: quotaSession });
  assert.equal(quotaWallet.response.status, 200, JSON.stringify(quotaWallet.data));
  assert.equal(quotaWallet.data.currentQuarter, quarterKey);
  assert.equal(quotaWallet.data.quarterlyCreditsUsed, 3, 'wallet reports the three credits charged against this quarter');
  assert.equal(quotaWallet.data.quarterlyCreditLimit, 3);

  // A server-issued achievement credit unlocks One access and is redeemed atomically with its report.
  await db.prepare(`UPDATE subscriptions SET status='expired',expires_at='2000-01-01T00:00:00.000Z',cancel_at_period_end=1 WHERE user_id=?`)
    .bind(signup.data.user.id).run();
  const earnedWallet = await responseFor('/api/rewards', { cookie: billingSession });
  assert.equal(earnedWallet.response.status, 200, JSON.stringify(earnedWallet.data));
  assert.ok(earnedWallet.data.availableOneCredits > 0, 'achievement reward appears as a server-counted One credit');
  const earnedQuarterCount = await db.prepare(`SELECT COUNT(*) AS count FROM rewards WHERE user_id=? AND reward_type='one_credit' AND quarter_key=? AND status!='capped'`).bind(signup.data.user.id, quarterKey).first();
  assert.equal(earnedWallet.data.quarterlyCreditsUsed, earnedQuarterCount.count, 'wallet quota mirrors non-capped server ledger rows');
  assert.equal(earnedWallet.data.quarterlyCreditLimit, 3);
  const rewardedScan = await responseFor('/api/analyze', {
    method: 'POST', cookie: billingSession,
    body: { url: 'https://shop.example.com/terms?reward-credit', deviceId: `reward-credit-${randomUUID()}` },
  });
  assert.equal(rewardedScan.response.status, 200, JSON.stringify(rewardedScan.data));
  const rewardReference = (await db.prepare(`SELECT one_subscription_id FROM scans WHERE id=?`).bind(rewardedScan.data.id).first()).one_subscription_id;
  assert.match(rewardReference, /^reward:/, 'the free reward credit, rather than a paid subscription, funded the report');
  assert.equal((await db.prepare(`SELECT status FROM rewards WHERE reserved_reference IS NULL AND id=?`).bind(rewardReference.slice('reward:'.length)).first()).status, 'redeemed');
  assert.equal((await responseFor('/api/rewards', { cookie: billingSession })).data.availableOneCredits, earnedWallet.data.availableOneCredits - 1);

  // A 50% Pro reward changes the server-created WayForPay order and redeems only on a valid callback.
  const discountRewardId = randomUUID(), rewardCreatedAt = new Date().toISOString(), rewardExpiresAt = new Date(Date.now() + 30 * 864e5).toISOString();
  await db.prepare(`INSERT INTO rewards(id,user_id,reward_key,reward_type,status,created_at,expires_at,metadata_json) VALUES(?,?,'integration:pro-discount','pro_discount_50','available',?,?,'{}')`)
    .bind(discountRewardId, signup.data.user.id, rewardCreatedAt, rewardExpiresAt).run();
  const discountedCheckout = await responseFor('/api/billing/wayforpay/checkout', {
    method: 'POST', cookie: billingSession, origin: true,
    body: { plan: 'pro', legalConsent: checkoutConsent },
  });
  assert.equal(discountedCheckout.response.status, 200, JSON.stringify(discountedCheckout.data));
  assert.equal(discountedCheckout.data.rewardApplied, true);
  assert.equal(discountedCheckout.data.price.uah, 140);
  assert.equal(discountedCheckout.data.price.usd, '3.45');
  assert.equal(discountedCheckout.data.fields.amount, 140);
  assert.equal(discountedCheckout.data.fields.regularAmount, 279, 'the discount applies only to the first Pro payment');
  const discountedReference = discountedCheckout.data.fields.orderReference;
  const discountedOrder = await db.prepare(`SELECT amount_uah,reward_id,status FROM payment_orders WHERE order_reference=?`).bind(discountedReference).first();
  assert.deepEqual(discountedOrder, { amount_uah: 140, reward_id: discountRewardId, status: 'pending' });
  const discountedCallback = callbackPayload(discountedReference, { amount: 140 });
  assert.equal((await responseFor('/api/billing/wayforpay/callback', { method: 'POST', body: discountedCallback })).response.status, 200);
  assert.equal((await db.prepare(`SELECT status FROM rewards WHERE id=?`).bind(discountRewardId).first()).status, 'redeemed');
  const discountedExpiry = (await db.prepare(`SELECT expires_at FROM subscriptions WHERE id=?`).bind(discountedReference).first()).expires_at;
  assert.equal((await responseFor('/api/billing/wayforpay/callback', { method: 'POST', body: discountedCallback })).response.status, 200);
  assert.equal((await db.prepare(`SELECT expires_at FROM subscriptions WHERE id=?`).bind(discountedReference).first()).expires_at, discountedExpiry, 'replayed discount callback does not extend the subscription twice');
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM rewards WHERE user_id=? AND reward_key='integration:pro-discount'`).bind(signup.data.user.id).first()).count, 1);

  // Achievement analytics is admin-only; the A/B assignment is opt-in, stable, and switchable without a worker restart.
  assert.equal((await responseFor('/api/analytics/achievements')).response.status, 401);
  assert.equal((await responseFor('/api/analytics/achievements', { cookie: secondSession })).response.status, 403);
  assert.equal((await responseFor('/api/analytics/achievements', { method: 'POST', cookie: billingSession, body: { enabled: true } })).response.status, 403, 'experiment updates require same-origin protection');
  const experimentStarted = await responseFor('/api/analytics/achievements', { method: 'POST', cookie: billingSession, origin: true, body: { enabled: true } });
  assert.equal(experimentStarted.response.status, 200, JSON.stringify(experimentStarted.data));
  assert.equal(experimentStarted.data.experiment.enabled, true);
  await db.prepare(`UPDATE achievement_experiments SET progress_percent=100 WHERE experiment_key='badge_progress_visibility_v1'`).run();
  const noConsentAssignment = await responseFor('/api/achievements?experimentConsent=denied', { cookie: billingSession });
  assert.equal(noConsentAssignment.response.status, 200);
  assert.equal(noConsentAssignment.data.experiment.assigned, false);
  const progressVariant = await responseFor('/api/achievements?experimentConsent=granted', { cookie: billingSession });
  assert.equal(progressVariant.response.status, 200, JSON.stringify(progressVariant.data));
  assert.equal(progressVariant.data.experiment.variant, 'progress');
  assert.equal(progressVariant.data.experiment.showProgress, true);
  await db.prepare(`DELETE FROM achievement_experiment_assignments WHERE experiment_key='badge_progress_visibility_v1' AND user_id=?`).bind(signup.data.user.id).run();
  await db.prepare(`UPDATE achievement_experiments SET progress_percent=0 WHERE experiment_key='badge_progress_visibility_v1'`).run();
  const controlVariant = await responseFor('/api/achievements?experimentConsent=granted', { cookie: billingSession });
  assert.equal(controlVariant.response.status, 200, JSON.stringify(controlVariant.data));
  assert.equal(controlVariant.data.experiment.variant, 'control');
  assert.equal(controlVariant.data.experiment.showProgress, false);
  const consentedAssignment = controlVariant;
  assert.equal(consentedAssignment.response.status, 200, JSON.stringify(consentedAssignment.data));
  assert.ok(['progress', 'control'].includes(consentedAssignment.data.experiment.variant));
  assert.equal(consentedAssignment.data.experiment.showProgress, consentedAssignment.data.experiment.variant === 'progress');
  const stableAssignment = await responseFor('/api/achievements?experimentConsent=granted', { cookie: billingSession });
  assert.equal(stableAssignment.data.experiment.variant, consentedAssignment.data.experiment.variant, 'variant remains fixed for an account');
  assert.ok(await db.prepare(`SELECT user_id FROM achievement_experiment_assignments WHERE experiment_key='badge_progress_visibility_v1' AND user_id=?`).bind(signup.data.user.id).first());
  const revokeExperimentConsent = await responseFor('/api/achievements?experimentConsent=denied', { cookie: billingSession });
  assert.equal(revokeExperimentConsent.data.experiment.assigned, false);
  assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM achievement_experiment_assignments WHERE user_id=?`).bind(signup.data.user.id).first()).count, 0, 'revoking consent removes the account assignment');
  await db.prepare(`UPDATE achievement_experiments SET progress_percent=50 WHERE experiment_key='badge_progress_visibility_v1'`).run();

  const historicStart = new Date(Date.now() - 40 * 864e5);
  await db.prepare(`UPDATE achievement_experiments SET started_at=? WHERE experiment_key='badge_progress_visibility_v1'`).bind(historicStart.toISOString()).run();
  const syntheticUsers = [];
  const syntheticExpiry = new Date(Date.now() + 50 * 864e5).toISOString();
  for (let index = 0; index < 100; index++) {
    const userId = `experiment-cohort-${index}-${randomUUID()}`;
    const variant = index < 50 ? 'progress' : 'control';
    await db.prepare(`INSERT INTO users(id,email,password_hash,salt,created_at) VALUES(?,?,?,?,?)`).bind(userId, `${userId}@example.test`, 'test-hash', 'test-salt', historicStart.toISOString()).run();
    await db.prepare(`INSERT INTO achievement_experiment_assignments(experiment_key,user_id,variant,assigned_at,expires_at) VALUES('badge_progress_visibility_v1',?,?,?,?)`)
      .bind(userId, variant, historicStart.toISOString(), syntheticExpiry).run();
    syntheticUsers.push({ userId, variant });
  }
  const progressUser = syntheticUsers.find((user) => user.variant === 'progress').userId;
  const controlUser = syntheticUsers.find((user) => user.variant === 'control').userId;
  const atDay = (days) => new Date(historicStart.getTime() + days * 864e5).toISOString();
  for (const [userId, day, source] of [[progressUser, 7.5, 'progress-d7'], [progressUser, 30.5, 'progress-d30'], [controlUser, 7.5, 'control-d7']]) {
    const createdAt = atDay(day);
    await db.prepare(`INSERT INTO events(id,user_id,type,source_id,payload,created_at) VALUES(?,?,'analysis_completed',?,'{}',?)`).bind(randomUUID(), userId, source, createdAt).run();
  }
  await db.prepare(`INSERT INTO user_achievements(user_id,key,unlocked_at,progress) VALUES(?,'skeptic',?,'{}')`).bind(progressUser, atDay(5)).run();
  await db.prepare(`INSERT INTO payment_orders(order_reference,user_id,plan,amount_uah,currency,status,test_mode,created_at,updated_at,expires_at) VALUES(?,?,'pro',279,'UAH','paid',0,?,?,?)`)
    .bind(`sift_${randomUUID().replaceAll('-', '')}`, progressUser, atDay(10), atDay(10), atDay(11)).run();
  const experimentReport = await responseFor('/api/analytics/achievements', { cookie: billingSession });
  assert.equal(experimentReport.response.status, 200, JSON.stringify(experimentReport.data));
  assert.equal(experimentReport.data.experiment.daysRunning, 40);
  assert.equal(experimentReport.data.experiment.reportReady, true, 'two weeks plus 50 mature D7 observations in each arm makes the initial report reviewable');
  const progressGroup = experimentReport.data.groups.find((group) => group.variant === 'progress');
  const controlGroup = experimentReport.data.groups.find((group) => group.variant === 'control');
  assert.equal(progressGroup.assigned, 50);
  assert.equal(controlGroup.assigned, 50);
  assert.deepEqual({ eligible: progressGroup.d7.eligible, returned: progressGroup.d7.returned, rate: progressGroup.d7.rate }, { eligible: 50, returned: 1, rate: 2 });
  assert.deepEqual({ eligible: progressGroup.d30.eligible, returned: progressGroup.d30.returned, rate: progressGroup.d30.rate }, { eligible: 50, returned: 1, rate: 2 });
  assert.deepEqual({ eligible: progressGroup.pro30.eligible, converted: progressGroup.pro30.converted, rate: progressGroup.pro30.rate }, { eligible: 50, converted: 1, rate: 2 });
  assert.deepEqual({ eligible: controlGroup.d7.eligible, returned: controlGroup.d7.returned, rate: controlGroup.d7.rate }, { eligible: 50, returned: 1, rate: 2 });
  assert.deepEqual({ eligible: controlGroup.d30.eligible, returned: controlGroup.d30.returned, rate: controlGroup.d30.rate }, { eligible: 50, returned: 0, rate: 0 });
  assert.deepEqual({ eligible: controlGroup.pro30.eligible, converted: controlGroup.pro30.converted, rate: controlGroup.pro30.rate }, { eligible: 50, converted: 0, rate: 0 });
  assert.ok(progressGroup.d7.interval95.low <= progressGroup.d7.rate && progressGroup.d7.interval95.high >= progressGroup.d7.rate, 'Wilson interval contains the observed D7 rate');
  assert.ok(controlGroup.pro30.interval95.low <= controlGroup.pro30.rate && controlGroup.pro30.interval95.high > controlGroup.pro30.rate, 'zero conversions still show a non-zero uncertainty range');
  assert.ok(experimentReport.data.badgeDistribution.usersWithAnyBadge > 0);
  assert.equal(JSON.stringify(experimentReport.data).includes('@example.test'), false, 'analytics response contains aggregates, not emails');
  await db.prepare(`UPDATE achievement_experiment_assignments SET assigned_at=? WHERE experiment_key='badge_progress_visibility_v1' AND variant='progress'`)
    .bind(new Date(Date.now() - 3 * 864e5).toISOString()).run();
  const immatureReport = await responseFor('/api/analytics/achievements', { cookie: billingSession });
  assert.equal(immatureReport.data.experiment.reportReady, false, 'large assignment count cannot bypass the mature D7 observation threshold');
  await db.prepare(`UPDATE achievement_experiment_assignments SET assigned_at=? WHERE experiment_key='badge_progress_visibility_v1' AND variant='progress'`)
    .bind(historicStart.toISOString()).run();
  const experimentPaused = await responseFor('/api/analytics/achievements', { method: 'POST', cookie: billingSession, origin: true, body: { enabled: false } });
  assert.equal(experimentPaused.response.status, 200, JSON.stringify(experimentPaused.data));
  assert.equal(experimentPaused.data.experiment.enabled, false);
  assert.equal(experimentPaused.data.experiment.startedAt, experimentReport.data.experiment.startedAt, 'pause/resume preserves the experiment cohort and start date');
  console.log('Integration tests passed: server event bus and idempotent achievement projection, auth, analysis, translation/watchlist/cancellation events, billing, shared spaces, API keys, rate limits, and Telegram groups.');
  console.log(`Outbound calls were fully stubbed (${outboundCallCount}); email sends captured: ${emailOutbox.length}; retry idempotency verified.`);
} finally {
  await miniflare?.dispose();
  await rm(workDir, { recursive: true, force: true });
}
