import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPageHtml, evaluateClarity, extractPurchaseTerms } from '../lib/analyzer-core.js';

const finding = (kind) => ({ kind, title: kind, summary: '', evidence: '', severity: 'medium' });
const completeFindings = ['renewal', 'refund', 'cancellation'];

test('Clarity Score is deterministic and recommends buy only when all key terms and price exist', () => {
  const result = evaluateClarity(completeFindings.map(finding), ['$12']);
  assert.equal(result.score, 90);
  assert.equal(result.decision, 'buy');
  assert.match(result.verdict, /ціна, автопродовження, скасування й повернення/);
  assert.deepEqual(result, evaluateClarity(completeFindings.map(finding), ['$12']));
});

test('missing price and terms lower score and produce a precise wait verdict', () => {
  const result = evaluateClarity([], []);
  assert.equal(result.score, 20);
  assert.equal(result.decision, 'wait');
  assert.match(result.verdict, /не підтверджено ціну, умову автопродовження, умови скасування, умови повернення/);
});

test('non-refundable warning closes only when refund and cancellation terms are absent', () => {
  const close = evaluateClarity([finding('warning')], []);
  assert.equal(close.score, 25);
  assert.equal(close.decision, 'close');
  assert.match(close.verdict, /Закрити вкладку/);

  const wait = evaluateClarity([finding('warning'), finding('refund'), finding('cancellation')], ['$4']);
  assert.equal(wait.decision, 'wait');
  assert.match(wait.verdict, /неповоротну оплату/);
});

test('trial and warning affect score while warning keeps otherwise complete terms from buy', () => {
  const result = evaluateClarity([...completeFindings, 'trial', 'warning'].map(finding), ['$8']);
  assert.equal(result.score, 100);
  assert.equal(result.decision, 'wait');
  assert.match(result.verdict, /неповоротну оплату/);
});

test('HTML cleaner strips non-content elements, tags, comments and decodes entities', () => {
  const cleaned = cleanPageHtml('<header>menu</header><main>A &amp; B&nbsp; &#x1F512;<script>hidden()</script><!--gone--><nav>links</nav><p>Terms &lt;ok&gt;</p></main><footer>footer</footer>');
  assert.equal(cleaned, 'A & B  🔒 Terms <ok>');
});

test('purchase term extraction identifies trial, renewal, refund, cancellation and warning evidence', () => {
  const text = 'Free trial for 14 days. The subscription automatically renews monthly. Refund policy available within 30 days. Cancel subscription any time. Payments are non-refundable.';
  const { findings, prices } = extractPurchaseTerms(text);
  assert.deepEqual(findings.map(({ kind }) => kind), ['trial', 'renewal', 'refund', 'cancellation', 'warning']);
  assert.deepEqual(prices, []);
  for (const item of findings) assert.ok(item.evidence.length > 0);
  assert.equal(findings.find(({ kind }) => kind === 'refund').severity, 'good');
  assert.equal(findings.find(({ kind }) => kind === 'warning').severity, 'high');
});

test('purchase terms recognize common recurring-billing and refund eligibility wording', () => {
  const text = 'Membership renews automatically. The plans are billed monthly. You may be eligible for a refund within 30 days. Some purchases are non-refundable, and we do not refund partial periods.';
  const { findings } = extractPurchaseTerms(text);
  const kinds = findings.map(({ kind }) => kind);
  assert.ok(kinds.includes('renewal'));
  assert.ok(kinds.includes('refund'));
  assert.ok(kinds.includes('warning'));
});

test('price parser supports symbols, ISO currency suffixes and Ukrainian hryvnia', () => {
  const { findings, prices } = extractPurchaseTerms('Pricing: $12.50 per month, €9 annually, 150 UAH monthly, 299 грн на місяць, £6 per year and ₴75 тариф.');
  assert.deepEqual(prices, ['$12.50', '€9', '150 UAH', '299 грн', '£6', '₴75']);
  assert.equal(findings.filter(({ kind }) => kind === 'price').length, 6);
});

test('price extraction deduplicates exact values and rejects amounts without price context or legal liability', () => {
  const separator = ' general terms '.repeat(10);
  const { prices } = extractPurchaseTerms(`The price is $10 monthly and $10 monthly.${separator}Liability is limited to $500.${separator}Contact claim support at $8.`);
  assert.deepEqual(prices, ['$10']);
});

test('price parser caps evidence at eight distinct prices', () => {
  const body = Array.from({ length: 10 }, (_, index) => `Price plan ${index + 1} costs $${index + 1} monthly.`).join(' ');
  const { prices, findings } = extractPurchaseTerms(body);
  assert.equal(prices.length, 8);
  assert.equal(findings.filter(({ kind }) => kind === 'price').length, 8);
});
