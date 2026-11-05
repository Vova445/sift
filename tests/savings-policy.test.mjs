import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSavingsCsv, parseSavingsAmount, validateSavingsEntry } from '../lib/savings-policy.js';

test('Savings entry requires a saved report, a supported outcome, a positive UAH amount, and explicit confirmation', () => {
  assert.deepEqual(validateSavingsEntry({ scanId: 'scan_1', outcome: 'not_bought', amount: '149.90', confirmed: true }), { ok: true, value: { scanId: 'scan_1', outcome: 'not_bought', amountMinor: 14990 } });
  for (const amount of ['', '0', '-1', '1.239', '10000001', '1e4', 'NaN']) assert.equal(parseSavingsAmount(amount), null, `accepted ${amount}`);
  assert.equal(validateSavingsEntry({ scanId: 'scan_1', outcome: 'not_bought', amount: '15.00' }).ok, false);
  assert.equal(validateSavingsEntry({ scanId: 'scan_1', outcome: 'charged_back', amount: '15.00', confirmed: true }).ok, false);
  assert.equal(validateSavingsEntry({ scanId: '../other', outcome: 'refunded', amount: '15.00', confirmed: true }).ok, false);
});

test('Savings CSV has UTF-8 BOM, Excel delimiter, human labels, and formula injection protection', () => {
  const csv = buildSavingsCsv([{ confirmedAt: '2026-11-04T12:00:00.000Z', title: '=HYPERLINK("https://bad.test")', outcome: 'refunded', amountMinor: 14990 }]);
  assert.ok(csv.startsWith('\uFEFFsep=;'));
  assert.ok(csv.includes('Повернув кошти'));
  assert.ok(csv.includes('149.90'));
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('внесено й підтверджено користувачем') || csv.includes('Внесено й підтверджено користувачем'));
});
