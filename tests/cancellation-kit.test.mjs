import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCancellationKit, cancellationProviderForUrl } from '../lib/cancellation-kit.js';

const verifiedServices = [
  ['https://www.netflix.com/terms', 'netflix', /Finish Cancellation/],
  ['https://support.spotify.com/us/article/terms/', 'spotify', /Cancel subscription/],
  ['https://www.coursera.org/learn/terms', 'coursera', /Purchases/],
  ['https://helpx.adobe.com/legal/terms.html', 'adobe', /Manage plan/],
  ['https://www.primevideo.com/help?nodeId=test', 'prime-video', /End Subscription/],
];

test('recognizes the five verified providers with official instructions', () => {
  for (const [url, id, step] of verifiedServices) {
    const provider = cancellationProviderForUrl(url);
    assert.equal(provider?.id, id, url);
    assert.ok(provider.helpUrl.startsWith('https://'), url);
    const kit = buildCancellationKit({ url, host: new URL(url).hostname, findings: [] }, 'en');
    assert.equal(kit.providerId, id);
    assert.match(kit.steps.join(' '), step);
  }
});

test('provider matching uses full hostname boundaries', () => {
  assert.equal(cancellationProviderForUrl('https://notnetflix.com/terms'), null);
  assert.equal(cancellationProviderForUrl('https://spotify.com.attacker.test/terms'), null);
  assert.equal(cancellationProviderForUrl('javascript:alert(1)'), null);
});

test('cancellation letter quotes only actual visible report evidence', () => {
  const kit = buildCancellationKit({
    url: 'https://www.coursera.org/terms',
    host: 'www.coursera.org',
    prices: ['$49.00'],
    findings: [
      { kind: 'renewal', evidence: '…Your plan automatically renews monthly unless cancelled…' },
      { kind: 'refund', evidence: '…Refund requests are accepted within 14 days…' },
      { kind: 'cancellation', evidence: '…Go to Purchases and cancel the subscription…' },
    ],
  });
  assert.match(kit.email.subject, /Coursera/);
  assert.match(kit.email.body, /automatically renews monthly/);
  assert.match(kit.email.body, /Refund requests are accepted within 14 days/);
  assert.match(kit.email.body, /\[дата\]/);
  assert.match(kit.email.body, /\[сума й валюта\]/);
  assert.equal(kit.evidence.length, 3);
  assert.ok(kit.refundUrl.startsWith('https://'));
  assert.match(kit.disclaimer, /не юридична порада/);
});

test('locked evidence is never invented or copied into the template', () => {
  const kit = buildCancellationKit({
    url: 'https://www.spotify.com/legal/',
    host: 'www.spotify.com',
    lockedCount: 2,
    findings: [{ kind: 'refund', evidence: 'Повний доказ доступний у One Sift або Pro' }],
  });
  assert.equal(kit.hasLockedEvidence, true);
  assert.deepEqual(kit.evidence, []);
  assert.match(kit.email.body, /немає цитати/);
  assert.doesNotMatch(kit.email.body, /Повний доказ доступний/);
});

test('English kit is localized and unknown services get honest general steps', () => {
  const kit = buildCancellationKit({ url: 'https://billing.example.org/terms', findings: [] }, 'en');
  assert.equal(kit.language, 'en');
  assert.equal(kit.providerId, null);
  assert.match(kit.email.subject, /Subscription cancellation request/);
  assert.match(kit.email.body, /Hello,/);
  assert.match(kit.disclaimer, /not legal advice/);
  assert.equal(kit.steps.length, 3);
  assert.equal(kit.helpUrl, null);
});
