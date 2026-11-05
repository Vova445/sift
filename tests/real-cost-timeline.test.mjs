import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPurchaseTerms, unresolvedConditions } from '../lib/analyzer-core.js';
import { buildRealCostTimeline } from '../lib/real-cost-timeline.js';

const anchor = new Date('2026-11-04T12:00:00.000Z');
function analyzedReport(text) {
  const extracted = extractPurchaseTerms(text);
  return {
    ...extracted,
    unknowns: unresolvedConditions(extracted.findings, extracted.prices, extracted.priceDetails, 'https://example.test/terms'),
  };
}

const verifiedReports = [
  {
    name: 'regular monthly plan',
    text: 'The Individual plan costs $12 per month. Subscription is billed monthly.',
    expected: { total: 144, payments: 12, currency: 'USD' },
  },
  {
    name: '14-day trial followed by monthly billing',
    text: 'Start a 14-day free trial. Then the subscription is $9.99 per month and billed monthly.',
    expected: { total: 119.88, payments: 12, firstDate: '2026-11-18' },
  },
  {
    name: 'first month free, then recurring monthly price',
    text: 'The Individual plan is $11.99 per month, first month free for new subscribers.',
    expected: { total: 131.89, payments: 11, firstDate: '2026-12-04' },
  },
  {
    name: 'annual prepaid plan',
    text: 'The plan costs $89 annually and renews each year.',
    expected: { total: 89, payments: 1 },
  },
  {
    name: 'explicit price increase with separate cancellation fee and refund window',
    text: 'For the first 3 months you pay $5 per month, then the price increases to $10 per month. Early cancellation fee is $20. Request a refund within 14 days of purchase.',
    expected: { total: 105, payments: 12, increase: '2027-02-04', penalty: '20 USD', refund: '2026-11-18' },
  },
];

test('five evidence-backed report cases produce the expected 12-month spend and key dates', () => {
  for (const fixture of verifiedReports) {
    const timeline = buildRealCostTimeline(analyzedReport(fixture.text), anchor);
    assert.equal(timeline.total, fixture.expected.total, fixture.name);
    assert.equal(timeline.payments.length, fixture.expected.payments, fixture.name);
    if (fixture.expected.currency) assert.equal(timeline.currency, fixture.expected.currency, fixture.name);
    if (fixture.expected.firstDate) assert.equal(timeline.payments[0].date, fixture.expected.firstDate, fixture.name);
    if (fixture.expected.firstDate) assert.equal(timeline.events.find(event => event.kind === 'firstCharge')?.date, fixture.expected.firstDate, fixture.name);
    if (fixture.expected.increase) assert.equal(timeline.events.find(event => event.kind === 'increase')?.date, fixture.expected.increase, fixture.name);
    if (fixture.expected.penalty) assert.match(timeline.events.find(event => event.kind === 'penalty')?.detail || '', new RegExp(fixture.expected.penalty), fixture.name);
    if (fixture.expected.refund) assert.equal(timeline.events.find(event => event.kind === 'refund')?.date, fixture.expected.refund, fixture.name);
    assert.equal(timeline.months.length, 12, fixture.name);
    assert.equal(timeline.months.at(-1).cumulative, fixture.expected.total, fixture.name);
  }
});

test('does not invent a cost when price period or evidence is unknown or hidden', () => {
  const missingCadence = analyzedReport('Subscription price is $49.99.');
  assert.equal(buildRealCostTimeline(missingCadence, anchor).total, null);
  const lowConfidence = analyzedReport('Pricing starts at $10 per month depending on location.');
  assert.equal(buildRealCostTimeline(lowConfidence, anchor).total, null);
  const locked = analyzedReport('The plan costs $12 per month.');
  locked.lockedCount = 3;
  assert.equal(buildRealCostTimeline(locked, anchor).total, null);
});

test('does not mix different tiers into a made-up average or select one silently', () => {
  const report = analyzedReport('Basic plan costs $8 per month. Premium plan costs $15 per month.');
  const timeline = buildRealCostTimeline(report, anchor);
  assert.equal(timeline.total, null);
  assert.match(timeline.unavailableReason, /кілька тарифів/);
});

test('a possible penalty is informational and never changes recurring spend', () => {
  const base = analyzedReport('The plan costs $12 per month.');
  const withPenalty = analyzedReport('The plan costs $12 per month. Early cancellation fee applies if you terminate before the end of the term.');
  const baseTimeline = buildRealCostTimeline(base, anchor);
  const penaltyTimeline = buildRealCostTimeline(withPenalty, anchor);
  assert.equal(penaltyTimeline.total, baseTimeline.total);
  assert.equal(penaltyTimeline.events.find(event => event.kind === 'penalty')?.date, null);
  assert.match(penaltyTimeline.events.find(event => event.kind === 'penalty')?.detail || '', /не включено/);
});

test('does not present refund processing time as a refund eligibility deadline', () => {
  const report = analyzedReport('Refunds are processed within 14 business days after approval.');
  const event = buildRealCostTimeline(report, anchor).events.find(item => item.kind === 'refund');
  assert.ok(event);
  assert.equal(event.date, null);
});

test('shows a non-refundable clause as a warning instead of a refund opportunity', () => {
  const report = analyzedReport('The subscription payment is non-refundable under all circumstances.');
  const timeline = buildRealCostTimeline(report, anchor);
  assert.equal(timeline.events.find(event => event.kind === 'refund')?.title, 'Повернення коштів');
  assert.match(timeline.events.find(event => event.kind === 'refund')?.detail || '', /не повертається/);
});

test('does not place a first charge on an invented date when trial duration is missing', () => {
  const report = analyzedReport('A free trial is available. The subscription costs $12 per month.');
  const timeline = buildRealCostTimeline(report, anchor);
  assert.equal(timeline.total, null);
  assert.match(timeline.unavailableReason, /тривалість невідома/);
});

test('marks monthly spend as a scenario when auto-renewal is not confirmed', () => {
  const timeline = buildRealCostTimeline(analyzedReport('The plan costs $12 per month.'), anchor);
  assert.equal(timeline.total, 144);
  assert.ok(timeline.notes.some(note => /Автопродовження не підтверджено/.test(note)));
});
