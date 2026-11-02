import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYZE_REQUESTS_PER_MINUTE, AUTH_REQUESTS_PER_MINUTE, rollingWindowResult } from '../lib/request-rate-limit-policy.js';

test('auth is limited to five requests in a rolling minute', () => {
  const now = 1_800_000_012_345;
  assert.equal(AUTH_REQUESTS_PER_MINUTE, 5);
  assert.equal(rollingWindowResult({ currentCount: 4, windowStartedAt: now - 20_000, now, limit: AUTH_REQUESTS_PER_MINUTE }).allowed, true);
  assert.equal(rollingWindowResult({ currentCount: 5, windowStartedAt: now - 20_000, now, limit: AUTH_REQUESTS_PER_MINUTE }).allowed, false);
});

test('analyze limits are tier-specific and do not burst across a clock-minute boundary', () => {
  assert.deepEqual(ANALYZE_REQUESTS_PER_MINUTE, { free: 3, one: 5, pro: 30 });
  const startedAt = 1_800_000_059_000;
  const justBeforeClockBoundary = 1_800_000_060_000;
  const blocked = rollingWindowResult({ currentCount: 3, windowStartedAt: startedAt, now: justBeforeClockBoundary, limit: 3 });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfter > 0 && blocked.retryAfter <= 59);
  const afterRollingWindowExpires = rollingWindowResult({ currentCount: 999, windowStartedAt: startedAt, now: startedAt + 60_000, limit: 3 });
  assert.equal(afterRollingWindowExpires.count, 1);
  assert.equal(afterRollingWindowExpires.allowed, true);
});
