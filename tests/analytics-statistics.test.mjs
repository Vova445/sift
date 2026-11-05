import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsComparisonStatus, intervalsOverlap, isAnalyticsMature, wilsonInterval95 } from '../lib/analytics-statistics.js';

test('Wilson interval is wide for a tiny sample and absent for no observations', () => {
  const interval = wilsonInterval95(0, 1);
  assert.ok(interval);
  assert.ok(interval.low < 50 && interval.high > 50);
  assert.equal(wilsonInterval95(0, 0), null);
});

test('analytics maturity requires both 14 days and 50 observations', () => {
  assert.equal(isAnalyticsMature({ observations: 49, observedDays: 30 }), false);
  assert.equal(isAnalyticsMature({ observations: 50, observedDays: 13 }), false);
  assert.equal(isAnalyticsMature({ observations: 50, observedDays: 14 }), true);
});

test('overlapping Wilson intervals are inconclusive, missing intervals are not comparable', () => {
  assert.equal(intervalsOverlap({ low: 10, high: 30 }, { low: 29, high: 40 }), true);
  assert.equal(intervalsOverlap({ low: 10, high: 20 }, { low: 21, high: 40 }), false);
  assert.equal(intervalsOverlap(null, { low: 10, high: 20 }), false);
});

test('overlapping intervals are labelled unproven even before the sample matures', () => {
  assert.equal(analyticsComparisonStatus({ intervalsOverlap: true, hasIntervals: true }), 'unproven');
  assert.equal(analyticsComparisonStatus({ hasIntervals: true, reportReady: true, metricsMature: true }), 'observed-difference');
  assert.equal(analyticsComparisonStatus({ reportReady: false, metricsMature: false }), 'immature');
});
