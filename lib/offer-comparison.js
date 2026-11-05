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
  const requiredEvidence = [
    { key: 'renewal', kinds: ['renewal'] },
    { key: 'cancellation', kinds: ['cancellation'] },
    { key: 'refund', kinds: ['refund', 'warning'] },
    { key: 'trial', kinds: ['trial'] },
    { key: 'penalty', kinds: ['penalty', 'warning'] },
  ];
  const unresolved = report => requiredEvidence.flatMap(({ key, kinds }) => {
    const found = (report?.findings || []).some(item => {
      if (!kinds.includes(item.kind) || !['high', 'medium'].includes(item.confidence) || item.unresolved === true) return false;
      if (item.kind !== 'warning') return true;
      const text = `${item.title || ''} ${item.summary || ''} ${item.evidence || ''}`.toLowerCase();
      return key === 'refund'
        ? /refund|refundable|non[- ]?refundable|money back|повернен|відшкодуван/i.test(text)
        : /penalt|fee|chargeback|non[- ]?refundable|штраф|збор|компенсац/i.test(text);
    });
    return found ? [] : [key];
  });
  const leftUnresolved = unresolved(left), rightUnresolved = unresolved(right);
  const completeEvidence = leftUnresolved.length === 0 && rightUnresolved.length === 0;
  const canDeclareWinner = sameCurrency && completeEvidence;
  let priceWinner = null;
  let verdict;
  if (canDeclareWinner) {
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
  } else if (sameCurrency) {
    const unknown = [...new Set([...leftUnresolved, ...rightUnresolved])];
    const names = { renewal: 'автопродовження', cancellation: 'скасування', refund: 'повернення коштів', trial: 'пробний період', penalty: 'штрафи' };
    verdict = `Не оголошуємо переможця: не всі важливі умови підтверджено (${unknown.map(kind => names[kind] || kind).join(', ')}). За знайденими регулярними цінами за рік: ${leftCost.amount.toFixed(2)} ${leftCost.currency} та ${rightCost.amount.toFixed(2)} ${rightCost.currency}; це не підсумкова рекомендація.`;
  } else if (leftCost.reason === 'mixed-currency' || rightCost.reason === 'mixed-currency' || (leftCost.amount !== null && rightCost.amount !== null)) {
    verdict = 'Не оголошуємо переможця: у пропозицій різні або змішані валюти, і Sift не конвертує їх без надійного курсу.';
  } else {
    verdict = 'Не оголошуємо переможця: не вдалося підтвердити періодичну ціну для обох пропозицій. Звірте суми та періоди оплати у першоджерелах.';
  }
  const clarityWinner = canDeclareWinner ? left.score === right.score ? 'tie' : left.score > right.score ? 'left' : 'right' : null;
  return { leftCost, rightCost, priceWinner, clarityWinner, verdict, comparable: canDeclareWinner, completeEvidence };
}
