import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileAchievementNotifications } from '../lib/achievement-toast-policy.js';

const earned = (key, earnedAt) => ({ key, earnedAt, title: key });

test('first visit establishes a baseline without toasting historical badges', () => {
  const result = reconcileAchievementNotifications(null, [earned('skeptic', '2026-11-01T10:00:00Z')]);
  assert.deepEqual(result.seen, { skeptic: '2026-11-01T10:00:00Z' });
  assert.deepEqual(result.newlyEarned, []);
});

test('a newly earned badge is queued once and is not repeated after refresh', () => {
  const initial = { skeptic: '2026-11-01T10:00:00Z' };
  const first = reconcileAchievementNotifications(initial, [
    earned('skeptic', '2026-11-01T10:00:00Z'),
    earned('saver', '2026-11-05T10:00:00Z'),
  ]);
  assert.deepEqual(first.newlyEarned.map((badge) => badge.key), ['saver']);

  const refreshed = reconcileAchievementNotifications(first.seen, [
    earned('skeptic', '2026-11-01T10:00:00Z'),
    earned('saver', '2026-11-05T10:00:00Z'),
  ]);
  assert.deepEqual(refreshed.newlyEarned, []);
});

test('a changed unlock timestamp is treated as a new unlock and unearned badges are ignored', () => {
  const result = reconcileAchievementNotifications(
    { skeptic: '2026-11-01T10:00:00Z' },
    [earned('skeptic', '2026-11-05T10:00:00Z'), { key: 'saver', earnedAt: null }],
  );
  assert.deepEqual(result.newlyEarned.map((badge) => badge.key), ['skeptic']);
  assert.deepEqual(result.seen, { skeptic: '2026-11-05T10:00:00Z' });
});
