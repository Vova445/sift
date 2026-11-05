export function annualCost(report) {
  const priceFindings = Array.isArray(report?.findings) ? report.findings.filter(item => item?.kind === 'price') : [];
  const options = Array.isArray(report?.priceDetails) ? report.priceDetails.filter((item, index) =>
    (!priceFindings.length || priceFindings[index]?.confidence !== 'low') &&
    item && typeof item.annualAmount === 'number' && Number.isFinite(item.annualAmount) && item.annualAmount >= 0 &&
    typeof item.amount === 'number' && Number.isFinite(item.amount) &&
    ['USD', 'EUR', 'GBP', 'UAH'].includes(item.currency)
  ) : [];
  if (!options.length) return { amount: null, currency: null, cadence: null, sourceAmount: null, reason: priceFindings.some(item => item.confidence === 'low') ? 'low-confidence' : 'missing' };
  const currencies = [...new Set(options.map(item => item.currency))];
  if (currencies.length !== 1) return { amount: null, currency: null, cadence: null, sourceAmount: null, reason: 'mixed-currency' };
  const cheapest = options.reduce((best, item) => item.annualAmount < best.annualAmount ? item : best);
  return { amount: cheapest.annualAmount, currency: cheapest.currency, cadence: cheapest.cadence, sourceAmount: cheapest.amount, firstYearAmount: cheapest.firstYearAmount ?? cheapest.annualAmount, introMonths: cheapest.introMonths || 0, reason: null };
}

export function compareOfferReports(left, right) {
  const leftCost = annualCost(left), rightCost = annualCost(right);
  const sameCurrency = leftCost.amount !== null && rightCost.amount !== null && leftCost.currency === rightCost.currency;
  let priceWinner = null;
  let verdict;
  if (sameCurrency) {
    priceWinner = leftCost.amount === rightCost.amount ? 'tie' : leftCost.amount < rightCost.amount ? 'left' : 'right';
    if (priceWinner === 'tie') verdict = 'За найнижчими знайденими регулярними цінами витрати за 12 місяців однакові.';
    else {
      const cheaper = priceWinner === 'left' ? 'Пропозиція 1' : 'Пропозиція 2';
      const cheaperReport = priceWinner === 'left' ? left : right;
      const otherReport = priceWinner === 'left' ? right : left;
      const risks = report => (report?.findings || []).some(item => item.kind === 'penalty' || item.kind === 'warning') || report?.decision === 'close';
      const delta = Math.abs(leftCost.amount - rightCost.amount);
      verdict = `За знайденою регулярною ціною дешевша ${cheaper} на ${delta.toFixed(2)} ${leftCost.currency} за 12 місяців.`;
      if (risks(cheaperReport) && !risks(otherReport)) verdict += ' У дешевшій пропозиції також знайдено попереджувальну або штрафну умову — звірте доказ перед вибором.';
      else verdict += ' Розрахунок не враховує податки, промокоди та персональні пропозиції.';
    }
  } else if (leftCost.reason === 'mixed-currency' || rightCost.reason === 'mixed-currency' || (leftCost.amount !== null && rightCost.amount !== null)) {
    verdict = 'У пропозицій різні або змішані валюти, тому Sift не оголошує одну дешевшою без надійного курсу конвертації.';
  } else {
    verdict = 'Не вдалося підтвердити періодичну ціну для обох пропозицій. Порівняйте суми та періоди оплати у першоджерелах.';
  }
  const clarityWinner = left.score === right.score ? 'tie' : left.score > right.score ? 'left' : 'right';
  if (clarityWinner !== 'tie') verdict += ` За повнотою знайдених умов вищий Clarity Score у Пропозиції ${clarityWinner === 'left' ? '1' : '2'} (${Math.max(left.score, right.score)}/100).`;
  return { leftCost, rightCost, priceWinner, clarityWinner, verdict, comparable: sameCurrency };
}
