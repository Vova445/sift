import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENT_CATALOG, ACHIEVEMENT_CATALOG_VERSION, achievementProgressLabel, evaluateAchievementCatalog } from '../lib/achievement-catalog.js';

const event = (type, sourceId, payload = {}, createdAt = '2026-11-01T12:00:00.000Z') => ({ type, source_id: sourceId, payload: JSON.stringify(payload), created_at: createdAt });
const badge = (events, key) => evaluateAchievementCatalog(events).find((item) => item.key === key);

test('the versioned catalogue defines exactly the eight required server rules', () => {
  assert.equal(ACHIEVEMENT_CATALOG_VERSION, 1);
  assert.deepEqual(ACHIEVEMENT_CATALOG.map((item) => item.key), ['skeptic', 'renewal_hunter', 'saver', 'timely_stop', 'polyglot', 'guardian', 'streak_7_days', 'mentor']);
  assert.ok(ACHIEVEMENT_CATALOG.every((item) => typeof item.rule === 'function'));
  assert.ok(ACHIEVEMENT_CATALOG.every((item) => typeof item.condition === 'string' && item.condition.length > 0));
});

test('Skeptic unlocks on the third distinct completed analysis, not the second or a duplicate', () => {
  const two = [event('analysis_completed', 'a'), event('analysis_completed', 'b'), event('analysis_completed', 'a')];
  assert.deepEqual(badge(two, 'skeptic')?.unlocked, false);
  assert.equal(badge(two, 'skeptic')?.progress, 2);
  assert.equal(badge([...two, event('analysis_completed', 'c')], 'skeptic')?.unlocked, true);
});

test('Renewal Hunter unlocks at five distinct supported renewal findings', () => {
  const four = Array.from({ length: 4 }, (_, i) => event('autorenew_found', `scan-${i}`));
  assert.equal(badge(four, 'renewal_hunter')?.unlocked, false);
  assert.equal(badge([...four, event('autorenew_found', 'scan-4')], 'renewal_hunter')?.unlocked, true);
});

test('Saver sums confirmed UAH amounts at the recorded official rate and ignores removed or unconvertible entries', () => {
  const base = [
    event('savings_confirmed', 'one-v1', { scanId: 'one', amountMinor: 199_960, uahPerUsd: 40, outcome: 'not_bought' }),
    event('savings_confirmed', 'three-v1', { scanId: 'three', amountMinor: 999_999, uahPerUsd: null }),
  ];
  assert.equal(badge(base, 'saver')?.progress, 4_999);
  assert.equal(badge(base, 'saver')?.unlocked, false);
  const crossed = [...base, event('savings_confirmed', 'one-v2', { scanId: 'one', amountMinor: 200_000, uahPerUsd: 40, outcome: 'not_bought' }, '2026-11-02T12:00:00.000Z')];
  assert.equal(badge(crossed, 'saver')?.progress, 5_000);
  assert.equal(badge(crossed, 'saver')?.unlocked, true);
  assert.equal(badge([...crossed, event('savings_removed', 'one-remove', { scanId: 'one' }, '2026-11-03T12:00:00.000Z')], 'saver')?.progress, 0);
});

test('Timely Stop requires both Cancellation Kit use and a confirmed cancellation for the same report', () => {
  const canceled = event('savings_confirmed', 's1', { scanId: 'scan-1', outcome: 'canceled', amountMinor: 1000, uahPerUsd: 40 });
  assert.equal(badge([canceled], 'timely_stop')?.unlocked, false);
  assert.equal(badge([event('cancellation_kit_used', 'scan-2', { scanId: 'scan-2' }), canceled], 'timely_stop')?.unlocked, false);
  assert.equal(badge([event('cancellation_kit_used', 'scan-1', { scanId: 'scan-1' }), canceled], 'timely_stop')?.unlocked, true);
});

test('Polyglot counts distinct selected target languages, not fragments or repeats', () => {
  const twoLanguages = [event('translation_used', 'a:0:polish', { targetLanguage: 'polish' }), event('translation_used', 'b:0:polish', { targetLanguage: 'polish' }), event('translation_used', 'c:0:german', { targetLanguage: 'german' })];
  assert.equal(badge(twoLanguages, 'polyglot')?.progress, 2);
  assert.equal(badge(twoLanguages, 'polyglot')?.unlocked, false);
  assert.equal(badge([...twoLanguages, event('translation_used', 'a:1:ukrainian', { targetLanguage: 'ukrainian' })], 'polyglot')?.unlocked, true);
});

test('Guardian tracks five currently saved Watchlist reports and a removal changes progress', () => {
  const added = Array.from({ length: 5 }, (_, i) => event('watchlist_added', `scan-${i}:add`, { scanId: `scan-${i}` }));
  assert.equal(badge(added.slice(0, 4), 'guardian')?.unlocked, false);
  assert.equal(badge(added, 'guardian')?.unlocked, true);
  const removed = [...added, event('watchlist_removed', 'scan-0:remove', { scanId: 'scan-0' }, '2026-11-02T12:00:00.000Z')];
  assert.equal(badge(removed, 'guardian')?.progress, 4);
  assert.equal(badge(removed, 'guardian')?.unlocked, false);
});

test('seven-day streak needs seven consecutive UTC dates; duplicates do not add days', () => {
  const six = Array.from({ length: 6 }, (_, i) => event('analysis_completed', `d-${i}`, {}, `2026-11-0${i + 1}T11:00:00.000Z`));
  assert.equal(badge([...six, event('analysis_completed', 'd-5-duplicate', {}, '2026-11-06T18:00:00.000Z')], 'streak_7_days')?.progress, 6);
  assert.equal(badge([...six, event('analysis_completed', 'd-7', {}, '2026-11-07T11:00:00.000Z')], 'streak_7_days')?.unlocked, true);
  assert.equal(badge([...six, event('analysis_completed', 'gap', {}, '2026-11-08T11:00:00.000Z')], 'streak_7_days')?.unlocked, false);
});

test('Mentor unlocks only after a server-recorded completed referral', () => {
  assert.equal(badge([], 'mentor')?.unlocked, false);
  assert.equal(badge([event('referral_completed', 'referred-user-id')], 'mentor')?.unlocked, true);
});

test('progress labels match each badge unit and malformed event payloads fail closed', () => {
  assert.equal(achievementProgressLabel('saver', 2500, 5000), '$25.00 з $50');
  assert.equal(badge([event('savings_confirmed', 'broken', '{bad json')], 'saver')?.progress, 0);
});
