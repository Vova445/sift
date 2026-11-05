const currencyBySymbol = { '$': 'USD', '€': 'EUR', '£': 'GBP', '₴': 'UAH' };

function normalizedPrice(value) {
  const label = String(value || '').replace(/\s+/g, ' ').trim();
  const symbolMatch = label.match(/^([$€£₴])\s*(\d{1,6}(?:[.,]\d{1,2})?)/);
  const codeMatch = label.match(/^(\d{1,6}(?:[.,]\d{1,2})?)\s*(USD|EUR|GBP|UAH|грн)$/i);
  const match = symbolMatch || codeMatch;
  if (!match) return { key: `text:${label.toLocaleLowerCase()}`, label };
  const currency = symbolMatch ? currencyBySymbol[symbolMatch[1]] : codeMatch[2].toUpperCase() === 'ГРН' ? 'UAH' : codeMatch[2].toUpperCase();
  const amount = Number((symbolMatch ? symbolMatch[2] : codeMatch[1]).replace(',', '.'));
  return { key: `${currency}:${Math.round(amount * 100)}`, label };
}

function cadenceFrom(text) {
  const value = String(text || '').toLocaleLowerCase();
  if (/quarter|квартал/.test(value)) return 'quarterly';
  if (/week|щотижн/.test(value)) return 'weekly';
  if (/month|місяц|щомісяч/.test(value)) return 'monthly';
  if (/year|annual|річ|щоріч/.test(value)) return 'yearly';
  if (/day|день|дн\b|щоденн/.test(value)) return 'daily';
  return null;
}

function refundWindowFrom(text) {
  const match = String(text || '').match(/\b(\d{1,3})\s*(?:(business|working|робоч(?:их|і))\s*)?[- ]?(?:day|days|дн(?:і|ів|я)?)\b/i);
  return match ? { days: Number(match[1]), business: Boolean(match[2]) } : null;
}

function hasKind(findings, kind) {
  return findings.some((finding) => finding?.kind === kind);
}

function evidenceFor(findings, kinds) {
  return findings.find((finding) => kinds.includes(finding?.kind))?.evidence?.slice(0, 320) || '';
}

export function purchaseSnapshot(report) {
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const renewalEvidence = evidenceFor(findings, ['renewal']);
  const refundEvidence = evidenceFor(findings, ['refund', 'warning']);
  const prices = Array.isArray(report?.prices)
    ? [...new Map(report.prices.map(normalizedPrice).map((price) => [price.key, price])).values()].sort((a, b) => a.key.localeCompare(b.key))
    : [];

  return {
    version: 1,
    title: String(report?.title || '').slice(0, 140),
    url: String(report?.url || ''),
    prices,
    renewal: {
      present: hasKind(findings, 'renewal'),
      cadence: cadenceFrom(renewalEvidence),
      evidence: renewalEvidence,
    },
    refund: {
      present: hasKind(findings, 'refund') || hasKind(findings, 'warning'),
      nonRefundable: hasKind(findings, 'warning') || /non[- ]?refundable|no refunds?|не підлягає поверненню|кошти не повертаються/i.test(refundEvidence),
      window: refundWindowFrom(refundEvidence),
      evidence: refundEvidence,
    },
  };
}

function displayPrices(prices) {
  return prices.map((price) => price.label).join(', ') || 'ціну не знайдено';
}

function describeRenewal(value) {
  if (!value.present) return 'автоматичне продовження не згадувалося';
  const cadence = value.cadence ? ` (${value.cadence === 'monthly' ? 'щомісяця' : value.cadence === 'yearly' ? 'щороку' : value.cadence === 'weekly' ? 'щотижня' : value.cadence === 'quarterly' ? 'щокварталу' : 'щодня'})` : '';
  return `автоматичне продовження згадується${cadence}`;
}

function describeRefund(value) {
  if (!value.present) return 'умову повернення коштів не знайдено';
  if (value.nonRefundable) return 'знайдена умова про неповоротну оплату';
  if (value.window) return `згадано повернення протягом ${value.window.days} ${value.window.business ? 'робочих ' : ''}днів`;
  return 'знайдена умова повернення коштів';
}

function change(key, label, before, after, explanation, beforeEvidence, afterEvidence) {
  return { key, label, before, after, explanation, beforeEvidence, afterEvidence };
}

export function diffPurchaseSnapshots(before, after) {
  const changes = [];
  const beforePrices = Array.isArray(before?.prices) ? before.prices : [];
  const afterPrices = Array.isArray(after?.prices) ? after.prices : [];
  if (JSON.stringify(beforePrices.map((price) => price.key).sort()) !== JSON.stringify(afterPrices.map((price) => price.key).sort())) {
    changes.push(change('price', 'Ціна', displayPrices(beforePrices), displayPrices(afterPrices), 'Змінилася знайдена сума або набір тарифів. Перевірте актуальну ціну та період списання.', beforePrices.map((price) => price.label).join(', '), afterPrices.map((price) => price.label).join(', ')));
  }

  const beforeRenewal = before?.renewal || { present: false, cadence: null, evidence: '' };
  const afterRenewal = after?.renewal || { present: false, cadence: null, evidence: '' };
  if (beforeRenewal.present !== afterRenewal.present || (beforeRenewal.present && afterRenewal.present && beforeRenewal.cadence !== afterRenewal.cadence)) {
    changes.push(change('renewal', 'Автопродовження', describeRenewal(beforeRenewal), describeRenewal(afterRenewal), 'Змінилася умова автоматичних списань або їхня періодичність.', beforeRenewal.evidence || '', afterRenewal.evidence || ''));
  }

  const beforeRefund = before?.refund || { present: false, nonRefundable: false, window: null, evidence: '' };
  const afterRefund = after?.refund || { present: false, nonRefundable: false, window: null, evidence: '' };
  if (beforeRefund.present !== afterRefund.present || beforeRefund.nonRefundable !== afterRefund.nonRefundable || beforeRefund.window?.days !== afterRefund.window?.days || beforeRefund.window?.business !== afterRefund.window?.business) {
    changes.push(change('refund', 'Повернення коштів', describeRefund(beforeRefund), describeRefund(afterRefund), 'Змінилися умови або строк повернення коштів.', beforeRefund.evidence || '', afterRefund.evidence || ''));
  }

  return changes;
}

