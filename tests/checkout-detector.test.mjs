import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import '../extension/checkout-detector.js';

const detector = globalThis.SiftCheckoutDetector;
const realCheckoutPages = [
  ['https://checkout.stripe.com/c/pay/cs_test_9d8c7b6a5f4e3d2c1b0a', 'Checkout'],
  ['https://www.paypal.com/checkoutnow?token=secret-session', 'PayPal'],
  ['https://shop.example.com/checkouts/cn/checkout-id', 'Shopify Checkout'],
  ['https://www.amazon.com/gp/buy/spc/handlers/display.html', 'Amazon Checkout'],
  ['https://www.etsy.com/cart', 'Your cart | Etsy'],
  ['https://www.apple.com/shop/bag', 'Your bag - Apple Store'],
  ['https://www.eventbrite.com/checkout-external?orderId=123456789', 'Complete your order'],
  ['https://secure.wayforpay.com/pay?merchant=store&order=123456', 'Secure payment'],
  ['https://www.airbnb.com/book/stays/12345678', 'Confirm and pay'],
  ['https://checkout.paddle.com/checkout/abc123', 'Paddle checkout'],
];

test('detects ten checkout URL/title patterns from common payment providers without page content', () => {
  for (const [url, title] of realCheckoutPages) {
    assert.equal(detector.isCheckoutPage(url, title), true, `${url} / ${title}`);
  }
});

test('ignores ordinary pages and non-web schemes', () => {
  const ordinary = [
    ['https://example.com/blog/checkout-guide', 'How to checkout safely'],
    ['https://example.com/account/profile', 'Account settings'],
    ['https://example.com/pricing', 'Plans and pricing'],
    ['mailto:billing@example.com', 'Payment'],
    ['chrome://extensions', 'Checkout'],
  ];
  for (const [url, title] of ordinary) assert.equal(detector.isCheckoutPage(url, title), false, url);
});

test('sanitizes credentials, query, fragments and checkout session path tokens', () => {
  const safe = detector.sanitizeCheckoutUrl('https://alice:secret@shop.example/checkouts/cs_test_0123456789abcdef0123456789abcdef?email=buyer%40example.test&session=SECRET#card');
  assert.equal(safe, 'https://shop.example/checkouts/[redacted]');
  assert.doesNotMatch(safe, /alice|secret|buyer|email|session|card/i);
});

test('Sift handoff keeps the URL in a fragment and rejects untrusted app origins', () => {
  const link = detector.createSiftUrl('https://shop.example/checkout?email=buyer%40example.test&token=SECRET#payment');
  const parsed = new URL(link);
  const payload = new URLSearchParams(parsed.hash.slice(1)).get('sift-scan');
  assert.equal(parsed.origin, 'https://sift-app.sift-vova445.workers.dev');
  assert.equal(parsed.search, '');
  assert.equal(payload, 'https://shop.example/checkout');
  assert.doesNotMatch(link, /buyer|email|SECRET|payment/);
  assert.equal(detector.createSiftUrl('https://shop.example/checkout', 'https://attacker.test'), null);
  assert.equal(detector.createSiftUrl('javascript:alert(1)'), null);
});

test('manifest asks for optional per-site access and avoids broad browsing or form permissions', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'scripting']);
  assert.deepEqual(manifest.optional_host_permissions.sort(), ['http://*/*', 'https://*/*']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.permissions.includes('tabs'), false);
  assert.equal(manifest.permissions.includes('webRequest'), false);
});

test('page detector never reads form values or sends page data over the network', async () => {
  const contentScript = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
  assert.doesNotMatch(contentScript, /querySelector(?:All)?\s*\(\s*['"](?:input|textarea|select)|\.value\b|FormData|XMLHttpRequest|\bfetch\s*\(|sendBeacon|WebSocket/);
  assert.match(contentScript, /referrerPolicy\s*=\s*'no-referrer'/);
  assert.match(contentScript, /createSiftUrl\(safeUrl\)/);
});
