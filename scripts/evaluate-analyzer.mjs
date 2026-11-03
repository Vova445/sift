import { appendFile, readFile } from 'node:fs/promises';
import { extractPurchaseTerms } from '../lib/analyzer-core.js';

const datasetPath = process.argv[2] ?? new URL('../data/analyzer-eval.v1.json', import.meta.url);
const dataset = JSON.parse(await readFile(datasetPath, 'utf8'));
const categories = ['price', 'renewal', 'refund'];
const minimumRecall = 0.85;

if (!Array.isArray(dataset.records) || dataset.records.length !== 50) {
  throw new Error(`Expected exactly 50 evaluation records, got ${dataset.records?.length ?? 'none'}.`);
}

const ids = new Set();
const urls = new Set();
for (const record of dataset.records) {
  if (!record.id || ids.has(record.id)) throw new Error(`Missing or duplicate record id: ${record.id}`);
  if (!record.url || urls.has(record.url)) throw new Error(`Missing or duplicate source URL: ${record.url}`);
  if (!record.text?.trim()) throw new Error(`Missing excerpt text: ${record.id}`);
  const parsedUrl = new URL(record.url);
  if (parsedUrl.protocol !== 'https:') throw new Error(`Source must use HTTPS: ${record.id}`);
  for (const category of categories) {
    if (typeof record.gold?.[category] !== 'boolean') {
      throw new Error(`Missing boolean ${category} label: ${record.id}`);
    }
  }
  ids.add(record.id);
  urls.add(record.url);
}

const stats = Object.fromEntries(categories.map((category) => [category, {
  tp: 0, fp: 0, fn: 0, tn: 0, falsePositives: [], falseNegatives: [],
}]));

for (const record of dataset.records) {
  const { findings, prices } = extractPurchaseTerms(record.text);
  const foundKinds = new Set(findings.map(({ kind }) => kind));
  const predicted = {
    price: prices.length > 0,
    renewal: foundKinds.has('renewal'),
    // A non-refundable warning is still evidence that the page states a refund condition.
    refund: foundKinds.has('refund') || foundKinds.has('warning'),
  };

  for (const category of categories) {
    const expected = record.gold[category];
    if (expected && predicted[category]) stats[category].tp += 1;
    else if (!expected && predicted[category]) {
      stats[category].fp += 1;
      stats[category].falsePositives.push(record.id);
    } else if (expected && !predicted[category]) {
      stats[category].fn += 1;
      stats[category].falseNegatives.push(record.id);
    } else stats[category].tn += 1;
  }
}

const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;
const percent = (value) => value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
const lines = [
  `Analyzer evaluation v${dataset.version} (${dataset.records.length} labeled source excerpts; reviewed ${dataset.reviewedOn})`,
  `CI recall floor: ${percent(minimumRecall)} per category`,
];
let failed = false;

for (const category of categories) {
  const result = stats[category];
  const precision = ratio(result.tp, result.tp + result.fp);
  const recall = ratio(result.tp, result.tp + result.fn);
  const support = result.tp + result.fn;
  const passes = recall !== null && recall >= minimumRecall;
  if (!passes) failed = true;
  lines.push(
    `${category.padEnd(7)} precision ${percent(precision).padStart(6)} | recall ${percent(recall).padStart(6)} | TP ${result.tp} FP ${result.fp} FN ${result.fn} TN ${result.tn} | ${passes ? 'PASS' : 'FAIL'} (gold positives ${support})`,
  );
  if (result.falsePositives.length) lines.push(`  false positives: ${result.falsePositives.join(', ')}`);
  if (result.falseNegatives.length) lines.push(`  false negatives: ${result.falseNegatives.join(', ')}`);
}

const output = lines.join('\n');
console.log(output);
if (process.env.GITHUB_STEP_SUMMARY) {
  const markdown = [
    '### Analyzer accuracy evaluation',
    '',
    '| Condition | Precision | Recall | TP | FP | FN | TN | Result |',
    '|---|---:|---:|---:|---:|---:|---:|---|',
    ...categories.map((category) => {
      const result = stats[category];
      const precision = ratio(result.tp, result.tp + result.fp);
      const recall = ratio(result.tp, result.tp + result.fn);
      return `| ${category} | ${percent(precision)} | ${percent(recall)} | ${result.tp} | ${result.fp} | ${result.fn} | ${result.tn} | ${recall >= minimumRecall ? 'PASS' : 'FAIL'} |`;
    }),
    '',
    `Recall floor: ${percent(minimumRecall)} for each condition. Dataset: ${dataset.records.length} fixed labeled excerpts from official pages (v${dataset.version}, reviewed ${dataset.reviewedOn}).`,
  ].join('\n');
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

if (failed) process.exitCode = 1;
