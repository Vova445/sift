import test from 'node:test';
import assert from 'node:assert/strict';
import { isPaidPlan, planDetails } from '../lib/plan-catalog.js';

test('paid plans are explicitly allowlisted and catalog values are server-owned', () => {
  assert.equal(isPaidPlan('one'), true);
  assert.equal(isPaidPlan('pro'), true);
  assert.equal(isPaidPlan('free'), false);
  assert.equal(isPaidPlan(undefined), false);
  assert.deepEqual(planDetails('one'), { label: 'One Sift — один повний звіт', uah: 59, usd: '1.49', credits: 1, days: 90 });
  assert.deepEqual(planDetails('pro'), { label: 'Sift Pro — 30 днів', uah: 279, usd: '6.90', credits: 0, days: 30 });
  assert.throws(() => planDetails('free'), { message: 'Unknown paid plan' });
});
