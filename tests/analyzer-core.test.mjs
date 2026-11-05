import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPageHtml, evaluateClarity, extractPurchaseTerms, unresolvedConditions } from '../lib/analyzer-core.js';

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

test('annual price details annualize only explicit billing periods and keep currencies separate', () => {
  const { priceDetails } = extractPurchaseTerms('Pricing: $12.50 per month, €9 annually, 150 UAH monthly, £6 per year.');
  assert.deepEqual(priceDetails, [
    { amount: 12.5, currency: 'USD', cadence: 'monthly', annualAmount: 150, firstYearAmount: 150, introMonths: 0 },
    { amount: 9, currency: 'EUR', cadence: 'yearly', annualAmount: 9, firstYearAmount: 9, introMonths: 0 },
    { amount: 150, currency: 'UAH', cadence: 'monthly', annualAmount: 1800, firstYearAmount: 1800, introMonths: 0 },
    { amount: 6, currency: 'GBP', cadence: 'yearly', annualAmount: 6, firstYearAmount: 6, introMonths: 0 },
  ]);
  const unknown = extractPurchaseTerms('Subscription price is $49.99.').priceDetails[0];
  assert.equal(unknown.annualAmount, null);
  assert.equal(unknown.cadence, null);
});

test('cancellation penalties surface as evidence without changing the clarity score formula', () => {
  const { findings } = extractPurchaseTerms('The plan renews monthly. Early termination fee applies if you cancel before the end of the term.');
  const penalty = findings.find(({ kind }) => kind === 'penalty');
  assert.ok(penalty);
  assert.match(penalty.evidence, /Early termination fee/i);
  assert.equal(evaluateClarity(findings, ['$10']).score, evaluateClarity(findings.filter(item => item.kind !== 'penalty'), ['$10']).score);
});

test('trial extraction recognizes free month offers on subscription pricing pages',()=>{
  const {findings}=extractPurchaseTerms('The Individual plan is $11.99/month, first month free for new subscribers.');
  assert.match(findings.find(({kind})=>kind==='trial')?.evidence||'',/first month free/i);
  const {priceDetails}=extractPurchaseTerms('The Individual plan is $11.99/month, first month free for new subscribers.');
  assert.deepEqual(priceDetails[0],{amount:11.99,currency:'USD',cadence:'monthly',annualAmount:143.88,firstYearAmount:131.89,introMonths:1});
  const spotify=extractPurchaseTerms('Premium Individual only. $0 for 1 month, then $12.99 per month after.').priceDetails[1];
  assert.deepEqual(spotify,{amount:12.99,currency:'USD',cadence:'monthly',annualAmount:155.88,firstYearAmount:142.89,introMonths:1});
});

test('cancellation extraction recognizes cancel anytime wording',()=>{
  const {findings}=extractPurchaseTerms('The service renews monthly. No commitment. Cancel anytime.');
  assert.ok(findings.some(({kind})=>kind==='cancellation'));
});

test('ambiguous and conditional evidence is marked low confidence and cannot support a buy verdict',()=>{
  const text='Pricing starts at $10 per month. The subscription may automatically renew depending on your region. Refunds may be available within 30 days, subject to local rules. Cancellation policy for this subscription may vary by country.';
  const {findings,prices}=extractPurchaseTerms(text);
  assert.equal(findings.find(item=>item.kind==='price').confidence,'low');
  assert.equal(findings.find(item=>item.kind==='renewal').confidence,'low');
  assert.equal(findings.find(item=>item.kind==='refund').confidence,'low');
  assert.equal(findings.find(item=>item.kind==='cancellation').confidence,'low');
  for(const item of findings)assert.ok(item.evidence.length>0);
  const evaluation=evaluateClarity(findings,prices);
  assert.notEqual(evaluation.decision,'buy');
  assert.match(evaluation.verdict,/не вдалося впевнено визначити/);
  assert.ok(evaluation.score<90);
  const otherwiseComplete=completeFindings.map(finding).concat({kind:'trial',title:'Пробний період',summary:'Не вдалося впевнено визначити',evidence:'A trial may be offered in some regions.',confidence:'low'});
  const conservative=evaluateClarity(otherwiseComplete,['$20']);
  assert.equal(conservative.decision,'wait');
  assert.match(conservative.verdict,/пробний період/);
});

test('missing conditions are explicitly unknown and point back to the source URL',()=>{
  const sourceUrl='https://public.example/terms';
  const unknowns=unresolvedConditions([],[],[],sourceUrl);
  assert.deepEqual(unknowns.map(item=>item.kind),['price','renewal','cancellation','refund','trial','penalty']);
  for(const item of unknowns){
    assert.equal(item.confidence,'low');
    assert.equal(item.sourceUrl,sourceUrl);
    assert.equal(item.evidence,'');
    assert.match(item.summary,/Не вдалося/);
  }
});
