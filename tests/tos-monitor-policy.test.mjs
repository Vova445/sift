import assert from 'node:assert/strict';
import test from 'node:test';
import { diffPurchaseSnapshots, purchaseSnapshot } from '../lib/tos-monitor-policy.js';

function report({ prices = ['$12.99'], renewal = 'The subscription automatically renews monthly.', refund = 'Eligible customers may request a refund within 30 days.' } = {}) {
  return {
    title: 'Terms',
    url: 'https://shop.example.com/terms',
    prices,
    findings: [
      ...(renewal ? [{ kind: 'renewal', evidence: `…${renewal}…` }] : []),
      ...(refund ? [{ kind: 'refund', evidence: `…${refund}…` }] : []),
    ],
  };
}

test('price changes produce a material alert with old and new amounts', () => {
  const changes = diffPurchaseSnapshots(purchaseSnapshot(report()), purchaseSnapshot(report({ prices: ['$14.99'] })));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].key, 'price');
  assert.equal(changes[0].before, '$12.99');
  assert.equal(changes[0].after, '$14.99');
  assert.ok(changes[0].explanation);
});

test('price formatting and case-only text edits do not produce alerts', () => {
  const before = purchaseSnapshot(report({ prices: ['$12.99'], renewal: 'Automatically renews monthly.', refund: 'Refund within 30 days.' }));
  const after = purchaseSnapshot(report({ prices: ['12.99 USD'], renewal: 'AUTOMATICALLY renews monthly!', refund: 'REFUND within 30 days!' }));
  assert.deepEqual(diffPurchaseSnapshots(before, after), []);
});

test('renewal cadence changes are material', () => {
  const before = purchaseSnapshot(report({ renewal: 'The subscription automatically renews monthly.' }));
  const after = purchaseSnapshot(report({ renewal: 'The subscription automatically renews annually.' }));
  assert.deepEqual(diffPurchaseSnapshots(before, after).map((item) => item.key), ['renewal']);
});

test('adding or removing an automatic-renewal term is material', () => {
  const before = purchaseSnapshot(report({ renewal: null }));
  const after = purchaseSnapshot(report());
  assert.deepEqual(diffPurchaseSnapshots(before, after).map((item) => item.key), ['renewal']);
});

test('refund deadline and non-refundable status changes are material', () => {
  const before = purchaseSnapshot(report({ refund: 'Eligible customers may request a refund within 30 days.' }));
  const shorter = purchaseSnapshot(report({ refund: 'Eligible customers may request a refund within 7 days.' }));
  const blocked = purchaseSnapshot(report({ refund: 'All purchases are non-refundable.' }));
  assert.deepEqual(diffPurchaseSnapshots(before, shorter).map((item) => item.key), ['refund']);
  assert.deepEqual(diffPurchaseSnapshots(before, blocked).map((item) => item.key), ['refund']);
});

test('switching between calendar-day and business-day refund windows is material', () => {
  const calendar = purchaseSnapshot(report({ refund: 'Eligible customers may request a refund within 30 days.' }));
  const business = purchaseSnapshot(report({ refund: 'Eligible customers may request a refund within 30 business days.' }));
  assert.deepEqual(diffPurchaseSnapshots(calendar, business).map((item) => item.key), ['refund']);
  assert.match(diffPurchaseSnapshots(calendar, business)[0].after, /робочих днів/);
});

test('title and evidence-only copy edits do not alert', () => {
  const before = purchaseSnapshot(report());
  const after = purchaseSnapshot({ ...report(), title: 'Updated terms', findings: [
    { kind: 'renewal', evidence: 'The SUBSCRIPTION automatically renews monthly.' },
    { kind: 'refund', evidence: 'Eligible customers may request a refund within 30 days!' },
  ] });
  assert.deepEqual(diffPurchaseSnapshots(before, after), []);
});
