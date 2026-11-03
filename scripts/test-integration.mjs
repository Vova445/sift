import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workDir = await mkdtemp(join(tmpdir(), 'sift-api-integration-'));
const workerPath = join(workDir, 'worker.mjs');
const merchant = 'sift-integration-merchant';
const merchantSecret = 'sift-integration-secret-do-not-use-in-production';
const email = `integration-${randomUUID()}@example.com`;
const password = 'Initial-passphrase-938!';
const appOrigin = 'http://127.0.0.1';
const emailOutbox = [];
let outboundCallCount = 0;
let nextIp = 10;

const termsText = [
  'Pricing is $12.99 per month. The subscription automatically renews monthly unless you cancel.',
  'Refund policy: eligible customers may request a refund within 30 days.',
  'Cancel subscription at any time from account settings.',
  ...Array.from({ length: 100 }, (_, index) => `Additional terms clause ${index + 1} describes the service and billing details.`),
].join(' ');
const termsHtml = `<!doctype html><html><head><title>Subscription Terms</title></head><body><main>${termsText}</main></body></html>`;

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
    emailOutbox.push(JSON.parse(await request.clone().text()));
    return Response.json({ id: `email-${emailOutbox.length}` }, { status: 200 });
  }
  if (url.hostname === 'cloudflare-dns.com') {
    const type = url.searchParams.get('type');
    return Response.json({
      Status: 0,
      Answer: type === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [],
    });
  }
  if (url.hostname === 'shop.example.com') {
    return new Response(termsHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  if (url.hostname === 'api.wayforpay.com') return Response.json({ reasonCode: 4100 });
  return Response.json({ error: `Unexpected integration-test outbound request to ${url.hostname}` }, { status: 502 });
}

async function responseFor(path, { method = 'GET', body, rawBody, cookie, origin = false, ip } = {}) {
  const headers = new Headers();
  if (body !== undefined || rawBody !== undefined) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  if (origin) headers.set('origin', appOrigin);
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
      WAYFORPAY_MERCHANT_DOMAIN: '127.0.0.1',
      WAYFORPAY_SANDBOX_ALLOWLIST: email,
      TURNSTILE_SITE_KEY: 'integration-site-key',
      TURNSTILE_SECRET_KEY: 'integration-secret-key',
      RESEND_API_KEY: 'integration-resend-key',
      AUTH_EMAIL_FROM: 'Sift Integration <no-reply@example.com>',
      DUNNING_CRON_SECRET: 'integration-cron-secret',
      RATE_LIMIT_EDGE_ENABLED: 'false',
    },
    outboundService: mockOutbound,
  });
  await miniflare.ready;

  const db = await miniflare.getD1Database('DB');
  const migrationDir = join(root, 'migrations');
  const migrations = (await readdir(migrationDir)).filter((file) => file.endsWith('.sql')).sort();
  for (const migration of migrations) {
    const sql = await readFile(join(migrationDir, migration), 'utf8');
    for (const statement of sql.split(';').map((item) => item.trim()).filter(Boolean)) await db.prepare(statement).run();
  }

  // Signup: happy path creates D1 user, acceptance record, verification token, and session.
  const consent = { acceptTerms: true, acknowledgePrivacy: true };
  const signup = await responseFor('/api/auth/signup', {
    method: 'POST',
    body: { email, password, turnstileToken: 'valid-signup-token', legalConsent: consent },
  });
  assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
  assert.equal(signup.data.user.email, email);
  assert.equal(signup.data.verification.sent, true);
  const session = sessionFrom(signup.response);
  const unverifiedMe = await responseFor('/api/auth/me', { cookie: session });
  assert.equal(unverifiedMe.response.status, 200);
  assert.equal(unverifiedMe.data.user.emailVerified, false);
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
  const wrongLogin = await responseFor('/api/auth/login', { method: 'POST', body: { email, password: 'wrong password' } });
  assert.equal(wrongLogin.response.status, 401);
  const me = await responseFor('/api/auth/me', { cookie: loginSession });
  assert.equal(me.response.status, 200);
  assert.equal(me.data.user.email, email);
  const anonymousMe = await responseFor('/api/auth/me');
  assert.equal(anonymousMe.response.status, 200);
  assert.equal(anonymousMe.data.user, null);

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
  const scanBody = { url: 'https://shop.example.com/terms', deviceId: 'integration-device-1' };
  const scan = await responseFor('/api/analyze', { method: 'POST', body: scanBody });
  assert.equal(scan.response.status, 200, JSON.stringify(scan.data));
  assert.equal(scan.data.title, 'Subscription Terms');
  assert.deepEqual(scan.data.prices, ['$12.99']);
  assert.equal(scan.data.access.used, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM scans WHERE device_id=?').bind(scanBody.deviceId).first()).count, 1);
  const analyzeInvalid = await responseFor('/api/analyze', { method: 'POST', body: { ...scanBody, url: 'http://127.0.0.1' } });
  assert.equal(analyzeInvalid.response.status, 400);
  assert.equal((await responseFor('/api/analyze', { method: 'POST', body: { deviceId: 'missing-url' } })).response.status, 400);
  const history = await responseFor(`/api/history?deviceId=${encodeURIComponent(scanBody.deviceId)}`);
  assert.equal(history.response.status, 200);
  assert.equal(history.data.items.length, 1);
  assert.equal((await responseFor('/api/history')).response.status, 400);

  // WayForPay checkout: server price and authenticated owner; consent and origin are enforced.
  const billingLogin = await responseFor('/api/auth/login', { method: 'POST', body: { email, password: changedPasswordValue } });
  assert.equal(billingLogin.response.status, 200);
  const billingSession = sessionFrom(billingLogin.response);
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
    method: 'POST', cookie: billingSession, origin: true, body: { plan: 'one', legalConsent: checkoutConsent },
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
  const paymentOrder = await db.prepare('SELECT status FROM payment_orders WHERE order_reference=?').bind(orderReference).first();
  assert.equal(paymentOrder.status, 'paid');
  const credit = await db.prepare('SELECT COUNT(*) AS count FROM subscriptions WHERE id=? AND user_id=? AND plan=\'one\' AND credits=1').bind(orderReference, signup.data.user.id).first();
  assert.equal(credit.count, 1);
  const event = await db.prepare('SELECT processing_status,attempts FROM billing_events WHERE order_reference=? AND event_type=\'Approved\'').bind(orderReference).first();
  assert.deepEqual(event, { processing_status: 'processed', attempts: 1 });
  const badEvent = await db.prepare('SELECT processing_status FROM billing_events WHERE order_reference=? AND signature_valid=0').bind(orderReference).first();
  assert.equal(badEvent.processing_status, 'rejected');

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

  console.log('Integration tests passed: 14 API routes, isolated Miniflare D1, auth, analysis, checkout, history, and WayForPay webhooks.');
  console.log(`Outbound calls were fully stubbed (${outboundCallCount}); email sends captured: ${emailOutbox.length}.`);
} finally {
  await miniflare?.dispose();
  await rm(workDir, { recursive: true, force: true });
}
