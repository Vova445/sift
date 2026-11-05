const CADENCE_MONTHS = { monthly: 1, quarterly: 3, 'half-yearly': 6, yearly: 12 };
const SUPPORTED_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'UAH']);

function addMonths(date, count) {
  const targetMonth = date.getUTCMonth() + count;
  const first = new Date(Date.UTC(date.getUTCFullYear(), targetMonth, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return first;
}

function addDays(date, count) {
  return new Date(date.getTime() + count * 86_400_000);
}

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

function durationFromTrial(evidence) {
  const text = String(evidence || '').toLowerCase();
  const match = text.match(/(?:free\s+)?trial(?:\s+(?:of|for))?\s+(\d+)\s*(days?|weeks?|months?|дн(?:ів|і|я)?|тиж(?:день|ні|нів)?|місяц(?:ь|і|ів)?)/i)
    || text.match(/(\d+)\s*[- ]?\s*(days?|weeks?|months?|дн(?:ів|і|я)?|тиж(?:день|ні|нів)?|місяц(?:ь|і|ів)?)\s+(?:free\s+)?trial/i)
    || text.match(/(\d+)\s*(days?|weeks?|months?|дн(?:ів|і|я)?|тиж(?:день|ні|нів)?|місяц(?:ь|і|ів)?)\s+free/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount) || amount < 1 || amount > 365) return null;
  if (/week|тиж/.test(unit)) return { days: amount * 7, months: 0 };
  if (/month|місяц/.test(unit)) return { days: 0, months: amount };
  return { days: amount, months: 0 };
}

function durationMonths(text) {
  const matches = [
    /(?:after|following|for\s+the\s+first|first)\s+(\d+)\s+months?/i,
    /(?:через|протягом\s+перших|перші|після)\s+(\d+)\s+місяц(?:ь|і|ів)?/i,
  ];
  for (const pattern of matches) {
    const found = String(text || '').match(pattern);
    if (found) {
      const value = Number(found[1]);
      if (value >= 1 && value <= 12) return value;
    }
  }
  return null;
}

function explicitIncrease(candidates) {
  if (candidates.length < 2) return null;
  const transitionPattern = /\b(?:then|after\s+that|later|subsequently|increases?\s+to|goes?\s+up\s+to|changes?\s+to)\b|(?:потім|згодом|підвищ\w*\s+до|зрост\w*\s+до)/i;
  const transition = candidates.find(({ amount, finding }) => {
    const evidence = finding.evidence || '';
    const number = String(amount).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const token = new RegExp(`${number}(?![\\d.])`).exec(evidence);
    return Boolean(token && transitionPattern.test(evidence.slice(0, token.index)));
  });
  if (!transition) return null;
  const lower = candidates.filter(item => item.currency === transition.currency && item.amount < transition.amount)
    .sort((a, b) => a.amount - b.amount)[0];
  if (!lower) return null;
  const term = durationMonths(transition.finding.evidence) || durationMonths(lower.finding.evidence) || lower.introMonths || null;
  if (!term) return null;
  return { initial: lower, recurring: transition, afterMonths: term, evidence: transition.finding.evidence };
}

function parseMoneyInEvidence(evidence) {
  const text = String(evidence || '');
  const feeMarker = text.search(/fee|penalt\w*|charge|штраф|пеня|комісі|плата за/i);
  const relevant = feeMarker >= 0 ? text.slice(feeMarker, feeMarker + 150) : text;
  const match = relevant.match(/([$€£₴]\s?\d[\d,]*(?:\.\d{1,2})?|\d[\d,.]*\s?(?:USD|EUR|GBP|UAH|грн))/i);
  if (!match) return null;
  const raw = match[0];
  const normalized = raw.replace(/\s/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const amountMatch = normalized.match(/[\d]+(?:\.\d{1,2})?/);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[0]);
  const currency = /\$/.test(raw) ? 'USD' : /€/.test(raw) ? 'EUR' : /£/.test(raw) ? 'GBP' : /₴|грн|UAH/i.test(raw) ? 'UAH' : /USD/i.test(raw) ? 'USD' : /EUR/i.test(raw) ? 'EUR' : /GBP/i.test(raw) ? 'GBP' : null;
  return amount > 0 && currency ? { amount, currency } : null;
}

function refundWindowDays(evidence) {
  const text = String(evidence || '');
  if (/process(?:ed|ing)?|issu(?:ed|ing)|receive(?:d)?|зарахуван/i.test(text)) return null;
  const patterns = [
    /(?:request|claim|eligible|available|refund).{0,60}\bwithin\s+(\d+)\s+(?:business\s+|working\s+)?days?\b/i,
    /\bwithin\s+(\d+)\s+days?\b.{0,60}(?:purchase|refund|cancel)/i,
    /(?:запит|подат\w*|повернен\w*).{0,60}(?:протягом|у\s+межах)\s+(\d+)\s+дн/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && Number(match[1]) >= 1 && Number(match[1]) <= 365) return Number(match[1]);
  }
  return null;
}

function monthBucket(date, start) {
  let month = 1;
  while (month < 12 && date >= addMonths(start, month)) month += 1;
  return month;
}

function cadenceStep(cadence) {
  if (cadence === 'weekly') return { days: 7, months: 0 };
  const months = CADENCE_MONTHS[cadence];
  return months ? { days: 0, months } : null;
}

/**
 * Build a conservative 12-month projection only from price details with visible,
 * non-low-confidence evidence. Events such as fees and refunds are never added
 * to the expected subscription spend.
 */
export function buildRealCostTimeline(report, startDate = new Date()) {
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const unknowns = Array.isArray(report?.unknowns) ? report.unknowns : [];
  const priceFindings = findings.filter(item => item?.kind === 'price');
  const priceDetails = Array.isArray(report?.priceDetails) ? report.priceDetails : [];
  const candidates = priceDetails.map((detail, index) => ({ detail, finding: priceFindings[index] }))
    .filter(({ detail, finding }) => detail && finding && finding.confidence !== 'low'
      && !/доступний у One Sift|платному тариф/i.test(finding.evidence || '')
      && typeof detail.amount === 'number' && detail.amount > 0
      && SUPPORTED_CURRENCIES.has(detail.currency)
      && (CADENCE_MONTHS[detail.cadence] || detail.cadence === 'weekly'))
    .map(({ detail, finding }) => ({ amount: detail.amount, currency: detail.currency, cadence: detail.cadence, introMonths: Number(detail.introMonths) || 0, finding }));
  if (report?.lockedCount > 0) candidates.length = 0;

  const increase = explicitIncrease(candidates);
  let model = null;
  let unavailableReason = '';
  if (increase) {
    if (increase.initial.cadence !== increase.recurring.cadence) unavailableReason = 'Період зміни ціни не збігається з періодом тарифу.';
    else model = { initial: increase.initial, recurring: increase.recurring, changeAfterMonths: increase.afterMonths, increaseEvidence: increase.evidence };
  } else if (candidates.length === 1) {
    model = { initial: candidates[0], recurring: candidates[0], changeAfterMonths: null, increaseEvidence: '' };
  } else if (candidates.length > 1) {
    unavailableReason = 'Знайдено кілька тарифів, але звіт не показує, який із них обрано.';
  } else {
    const priceUnknown = unknowns.some(item => item.kind === 'price' || item.kind === 'billing_period')
      || priceFindings.some(item => item.confidence === 'low')
      || report?.lockedCount > 0;
    unavailableReason = priceUnknown ? 'Ціна або період оплати не підтверджені доступними доказами.' : 'Не вдалося підтвердити ціну з періодом оплати.';
  }

  const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const horizon = addMonths(start, 12);
  const trialFinding = findings.find(item => item?.kind === 'trial');
  const introMonths = model?.initial.introMonths || 0;
  const parsedTrialDuration = trialFinding && trialFinding.confidence !== 'low' ? durationFromTrial(trialFinding.evidence) : null;
  const trialDuration = parsedTrialDuration || (trialFinding && introMonths ? { days: 0, months: introMonths } : null);
  if (model && trialFinding && !trialDuration) {
    unavailableReason = 'Пробний період підтверджено, але його тривалість невідома; дату першого списання не можна визначити.';
    model = null;
  }
  const firstCharge = trialDuration?.days ? addDays(start, trialDuration.days)
    : addMonths(start, trialDuration?.months || introMonths);
  const payments = [];

  if (model) {
    const step = cadenceStep(model.recurring.cadence);
    if (!step) {
      unavailableReason = 'Період платежу не підтримується для точного 12-місячного прогнозу.';
      model = null;
    } else {
      let due = new Date(firstCharge);
      let safety = 0;
      while (due < horizon && safety < 60) {
        const elapsedMonths = monthBucket(due, start);
        const useRecurring = model.changeAfterMonths !== null && elapsedMonths > model.changeAfterMonths;
        const rate = useRecurring ? model.recurring : model.initial;
        payments.push({ date: toIso(due), month: elapsedMonths, amount: rate.amount, currency: rate.currency });
        due = step.days ? addDays(due, step.days) : addMonths(due, step.months);
        safety += 1;
      }
    }
  }

  const currency = model?.recurring.currency || model?.initial.currency || null;
  const monthly = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, spent: 0, cumulative: 0 }));
  for (const payment of payments) monthly[payment.month - 1].spent += payment.amount;
  let cumulative = 0;
  for (const item of monthly) { cumulative = Math.round((cumulative + item.spent) * 100) / 100; item.cumulative = cumulative; }

  const events = [];
  if (trialFinding) {
    events.push({
      kind: 'trial', title: trialDuration ? 'Пробний період' : 'Згадано пробний період',
      date: trialDuration?.days ? toIso(addDays(start, trialDuration.days)) : trialDuration?.months ? toIso(addMonths(start, trialDuration.months)) : null,
      month: trialDuration?.days || trialDuration?.months ? monthBucket(trialDuration.days ? addDays(start, trialDuration.days) : addMonths(start, trialDuration.months), start) : 1,
      detail: trialDuration ? `Перший платіж очікується після ${trialDuration.days ? `${trialDuration.days} днів` : `${trialDuration.months} міс.`}, якщо оформлення відбудеться сьогодні.` : 'Точну тривалість не вдалося визначити з цитати.',
      evidence: trialFinding.evidence || '',
    });
  }
  if (model?.changeAfterMonths) {
    events.push({ kind: 'increase', title: 'Зміна ціни за умовами', date: toIso(addMonths(start, model.changeAfterMonths)), month: model.changeAfterMonths,
      detail: `${model.initial.amount} ${model.initial.currency} → ${model.recurring.amount} ${model.recurring.currency} після ${model.changeAfterMonths} міс.`, evidence: model.increaseEvidence });
  }
  if (model && payments.length) {
    const first = payments[0];
    events.push({ kind: 'firstCharge', title: 'Перше списання', date: first.date, month: first.month,
      detail: `${first.amount} ${first.currency}; дата розрахована для оформлення сьогодні.`, evidence: model.initial.finding.evidence || '' });
  }

  const penalty = findings.find(item => item?.kind === 'penalty' && item.confidence !== 'low');
  if (penalty) {
    const amount = parseMoneyInEvidence(penalty.evidence);
    events.push({ kind: 'penalty', title: amount ? 'Можливий штраф за скасування' : 'Згадано штраф за скасування', date: null, month: null,
      detail: amount ? `Можлива сума ${amount.amount} ${amount.currency}; не включена в прогноз регулярних платежів.` : 'Суму або точний тригер неможливо підтвердити; не включено в прогноз.', evidence: penalty.evidence || '' });
  }

  const refund = findings.find(item => item?.kind === 'refund' && item.confidence !== 'low');
  const refundDays = refund ? refundWindowDays(refund.evidence) : null;
  if (refund) events.push({ kind: 'refund', title: refundDays ? 'Крайній строк запиту повернення' : 'Умови повернення згадано', date: refundDays ? toIso(addDays(start, refundDays)) : null,
    month: refundDays ? monthBucket(addDays(start, refundDays), start) : null,
    detail: refundDays ? `У цитаті вказано ${refundDays} днів від покупки; дата показана за умови покупки сьогодні. Повернення не віднято від прогнозу.` : 'Звіт не підтверджує точне вікно для запиту. Повернення не враховано як гарантовані кошти.', evidence: refund.evidence || '' });
  const noRefund = findings.find(item => item?.kind === 'warning' && item.confidence !== 'low' && /no refunds?|non[- ]?refundable|повернен\w*.{0,30}не\s+(?:передбачен|здійсню|нада)/i.test(item.evidence || ''));
  if (!refund && noRefund) events.push({ kind: 'refund', title: 'Повернення коштів', date: null, month: null,
    detail: 'У цитаті сказано, що оплата не повертається; винятки перевірте в першоджерелі.', evidence: noRefund.evidence || '' });

  const lowPrice = priceFindings.some(item => item.confidence === 'low');
  const hasUnknownPenalty = unknowns.some(item => item.kind === 'penalty');
  const hasUnknownRefund = unknowns.some(item => item.kind === 'refund');
  const hasUnknownTrial = unknowns.some(item => item.kind === 'trial');
  const renewalUnclear = unknowns.some(item => item.kind === 'renewal') || findings.some(item => item?.kind === 'renewal' && item.confidence === 'low');
  const possiblePriceChange = priceFindings.some(item => /may increase|price may|може зрости|може підвищ/i.test(item.evidence || '')) && !events.some(item => item.kind === 'increase');
  const notes = [];
  if (report?.lockedCount > 0) notes.push('Частина умов прихована вашим тарифом; прогноз спирається лише на доступні докази.');
  if (lowPrice) notes.push('Згадка ціни має низьку впевненість і не включена в розрахунок.');
  if (hasUnknownPenalty && !penalty) notes.push('У доступному тексті не знайдено підтверджену суму штрафу. Це не означає, що штрафів немає.');
  if (findings.some(item => item?.kind === 'penalty' && item.confidence === 'low')) notes.push('Згадка про штраф неоднозначна; умову не включено в прогноз.');
  if (hasUnknownRefund && !refund) notes.push('Умови повернення не вдалося підтвердити у доступному тексті.');
  if (findings.some(item => item?.kind === 'refund' && item.confidence === 'low')) notes.push('Згадка про повернення має низьку впевненість; строк не вказано.');
  if (hasUnknownTrial && !trialFinding) notes.push('Пробний період не вдалося підтвердити; це не доводить його відсутність.');
  if (trialFinding?.confidence === 'low') notes.push('Пробний період згадано неоднозначно; графік не враховує його тривалість.');
  if (hasUnknownTrial && !trialFinding && model) notes.push('Пробний період не підтверджено; сума показує регулярні платежі від сьогодні й не доводить, що пробного періоду немає.');
  if (renewalUnclear && model) notes.push('Автопродовження не підтверджено; сума показує сценарій регулярної оплати, якщо підписка залишатиметься активною.');
  if (possiblePriceChange) notes.push('Згадано можливе підвищення ціни, але майбутню суму або дату не підтверджено; у прогнозі цього немає.');

  return {
    currency,
    total: model ? cumulative : null,
    payments,
    months: monthly,
    events,
    notes,
    unavailableReason: model ? '' : unavailableReason,
    startDate: toIso(start),
    endDate: toIso(horizon),
    sourceEvidence: model?.initial.finding.evidence || '',
  };
}
