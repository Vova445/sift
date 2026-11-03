import test from 'node:test';
import assert from 'node:assert/strict';
import { canReserveScan, FREE_MONTHLY_SCAN_LIMIT, scanLimitForPlan } from '../lib/scan-quota-policy.js';

test('monthly scan quota matches Free, One Sift and Pro entitlements', () => {
  assert.equal(FREE_MONTHLY_SCAN_LIMIT, 3);
  assert.equal(scanLimitForPlan('free'), 3);
  assert.equal(scanLimitForPlan('one'), 1);
  assert.equal(scanLimitForPlan('pro'), 999);
  assert.equal(scanLimitForPlan('unknown'), 3);
});

test('atomic reservation policy allows only remaining quota and rejects invalid counters', () => {
  assert.equal(canReserveScan(0, 3), true);
  assert.equal(canReserveScan(2, 3), true);
  assert.equal(canReserveScan(3, 3), false);
  assert.equal(canReserveScan(4, 3), false);
  assert.equal(canReserveScan(-1, 3), false);
  assert.equal(canReserveScan(0, -1), false);
  assert.equal(canReserveScan(0.5, 3), false);
});
