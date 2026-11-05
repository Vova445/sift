import test from 'node:test';
import assert from 'node:assert/strict';
import { isRenewalAchievementFinding, longestAnalysisStreak, normalizeAnalysisDays, recentAnalysisWeek } from '../lib/achievement-policy.js';

const renewal = { kind: 'renewal', confidence: 'high', evidence: 'Automatically renews every month.' };

test('renewal event eligibility requires a non-low-confidence evidence quote', () => {
  assert.equal(isRenewalAchievementFinding(renewal), true);
  assert.equal(isRenewalAchievementFinding([{ ...renewal, confidence: 'low' }, renewal]), true);
  assert.equal(isRenewalAchievementFinding([{ ...renewal, confidence: 'low' }]), false);
  assert.equal(isRenewalAchievementFinding({ ...renewal, confidence: 'low' }), false);
  assert.equal(isRenewalAchievementFinding({ ...renewal, evidence: '  ' }), false);
  assert.equal(isRenewalAchievementFinding(null), false);
});

test('analysis dates are valid, distinct, and sorted', () => {
  assert.deepEqual(normalizeAnalysisDays(['2026-11-02', '2026-11-01', '2026-11-02', 'bad', null]), ['2026-11-01', '2026-11-02']);
});

test('UTC streaks deduplicate same-day analysis and reset across gaps', () => {
  assert.equal(longestAnalysisStreak(['2026-11-01', '2026-11-01', '2026-11-02']), 2);
  assert.equal(longestAnalysisStreak(['2026-11-01', '2026-11-03', '2026-11-04']), 2);
  assert.equal(longestAnalysisStreak([]), 0);
});

test('recent streak row always contains the last seven UTC days and marks each active date once', () => {
  assert.deepEqual(recentAnalysisWeek(['2026-11-01', '2026-11-03', '2026-11-03', 'invalid'], new Date('2026-11-05T21:30:00.000Z')), [
    { date: '2026-10-30', active: false },
    { date: '2026-10-31', active: false },
    { date: '2026-11-01', active: true },
    { date: '2026-11-02', active: false },
    { date: '2026-11-03', active: true },
    { date: '2026-11-04', active: false },
    { date: '2026-11-05', active: false },
  ]);
});
