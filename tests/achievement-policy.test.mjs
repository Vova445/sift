import test from 'node:test';
import assert from 'node:assert/strict';
import { isRenewalAchievementFinding, longestAnalysisStreak, normalizeAnalysisDays } from '../lib/achievement-policy.js';

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
