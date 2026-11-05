/** Pure analyzer logic, kept separate from network transport for deterministic tests. */

export function evaluateClarity(findings, prices) {
  const kinds = new Set(findings.filter((finding) => finding.confidence !== 'low').map((finding) => finding.kind));
  const priceFindings = findings.filter((finding) => finding.kind === 'price');
  const hasPrice = prices.length > 0 && (!priceFindings.length || priceFindings.some((finding) => finding.confidence !== 'low'));
  const has = (kind) => kinds.has(kind);
  // The score measures how much decision-critical information is available, not seller safety.
  // Missing a confirmed price therefore caps the score at 75 instead of allowing a misleading 85+.
  const score = 20 + (hasPrice ? 25 : 0) + (has('renewal') ? 15 : 0) + (has('cancellation') ? 15 : 0) + (has('refund') ? 15 : 0) + (has('trial') ? 5 : 0) + (has('warning') ? 5 : 0);
  const lowConfidence = findings.filter((finding) => finding.confidence === 'low');
  const decision = has('warning') && !has('refund') && !has('cancellation')
    ? 'close'
    : hasPrice && has('renewal') && has('cancellation') && has('refund') && !has('warning') && !lowConfidence.length
      ? 'buy'
      : 'wait';
  const missing = [];
  if (!hasPrice) missing.push('ціну');
  if (!has('renewal')) missing.push('умову автопродовження');
  if (!has('cancellation')) missing.push('умови скасування');
  if (!has('refund')) missing.push('умови повернення');
  const uncertain = lowConfidence.length > 0;
  const uncertaintyLabels = { price: 'ціну', renewal: 'автопродовження', refund: 'умови повернення', cancellation: 'скасування', trial: 'пробний період', penalty: 'штрафні умови', warning: 'неповоротну оплату' };
  const uncertainText = `не вдалося впевнено визначити ${[...new Set(lowConfidence.map((finding) => uncertaintyLabels[finding.kind] || finding.title.toLocaleLowerCase()))].join(', ')}`;
  const missingText = missing.length
    ? uncertain ? `${uncertainText}; також не підтверджено ${missing.join(', ')}` : `не підтверджено ${missing.join(', ')}`
    : '';
  const verdict = decision === 'buy'
    ? 'Ключові умови знайдено: ціна, автопродовження, скасування й повернення. Звірте фрагменти на першоджерелі перед оплатою.'
    : decision === 'close'
      ? `Закрити вкладку: знайдено умову про неповоротну оплату${missing.length ? `, але ${missingText}` : ''}. Не сплачуйте, доки не звірите умови на першоджерелі.`
      : missing.length || uncertain
        ? `Почекати: ${missingText || uncertainText}${has('warning') ? '; також є умова про неповоротну оплату' : ''}. Перевірте першоджерело перед оплатою.`
        : 'Почекати: знайдено умову про неповоротну оплату. Перевірте винятки та обсяг повернення на першоджерелі.';
  return { score, decision, verdict };
}

export function unresolvedConditions(findings, prices, priceDetails, sourceUrl) {
  const groups = [
    { kind: 'price', title: 'Ціна', kinds: ['price'], found: prices.length > 0, summary: 'Не вдалося визначити ціну у доступному тексті.' },
    { kind: 'renewal', title: 'Автоматичне продовження', kinds: ['renewal'], summary: 'Не вдалося знайти підтверджувальний фрагмент про продовження.' },
    { kind: 'cancellation', title: 'Скасування', kinds: ['cancellation'], summary: 'Не вдалося знайти підтверджувальний фрагмент про скасування.' },
    { kind: 'refund', title: 'Повернення коштів', kinds: ['refund', 'warning'], summary: 'Не вдалося знайти підтверджувальний фрагмент про повернення.' },
    { kind: 'trial', title: 'Пробний період', kinds: ['trial'], summary: 'Не вдалося знайти згадку про пробний період. Це не підтверджує, що його немає.' },
    { kind: 'penalty', title: 'Штрафи й неповоротні умови', kinds: ['penalty', 'warning'], summary: 'Не вдалося знайти згадку про штрафи чи неповоротну оплату. Це не підтверджує, що таких умов немає.' },
  ];
  const unknowns = groups.filter((group) => {
    if (group.kind === 'price' && group.found) return false;
    return !findings.some((finding) => group.kinds.includes(finding.kind));
  }).map(({ kind, title, summary }) => ({ kind, title, confidence: 'low', summary, evidence: '', sourceUrl, unresolved: true }));
  if (prices.length && Array.isArray(priceDetails) && priceDetails.length && priceDetails.every((detail) => !detail.cadence)) {
    unknowns.push({ kind: 'billing_period', title: 'Період оплати', confidence: 'low', summary: 'Ціну знайдено, але період списання не вдалося визначити.', evidence: '', sourceUrl, unresolved: true });
  }
  return unknowns;
}

const decodeHtml = (value) => value
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;|&#34;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
  .replace(/&#x([\da-f]+);/gi, (_, digits) => String.fromCodePoint(parseInt(digits, 16)));

export function cleanPageHtml(html) {
  return decodeHtml(html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(header|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

const RULES = [
  ['trial', 'Пробний період', /(?:free|безкоштовн\w*)\s+(?:trial|пробн\w* період)|(?:trial|пробн\w* період)\s+(?:for\s+)?\d+\s*(?:day|days|week|weeks|month|months|year|years|дн|тиж|місяц|рок)|(?:free|безкоштовн\w*)\s+for\s+\d+\s*(?:day|days|week|weeks|month|months|year|years|дн|тиж|місяц|рок)|\d+\s*(?:day|days|week|weeks|month|months|year|years|дн|тиж|місяц|рок)\s+(?:free|безкоштовн\w*)|first\s+(?:\d+\s+)?months?\s+(?:free|complimentary)|try\s+\d+\s*(?:day|days|week|weeks|month|months|year|years)\s+for\s+[$€£₴]?0/i, 'medium'],
  ['renewal', 'Автоматичне продовження', /auto(?:matically)?[- ]?renew(?:s|ed|al|ing)?|automatically renew\w*|renew\w*\s+automatically|автоматичн\w+\s+(?:продовжен|поновлен)|recurring\s+(?:billing|payment|basis)|billed\s+(?:on\s+)?a?\s*recurring\s+basis|billed\s+(?:monthly|annually|yearly)|(?:subscription|membership|plan).{0,60}\brenew(?:s|ed|al|ing)?\b|\brenew(?:s|ed|al|ing)?\b.{0,60}(?:subscription|membership|billing period)|periodically charge\w*.{0,40}(?:subscription|payment method)|periodic\s+charges?/i, 'high'],
  ['refund', 'Умови повернення', /(?:refund|money.back|повернен\w+).{0,100}(?:\d+\s*(?:(?:business|working)\s+)?-?\s*(?:day|days|дн)|policy|політик|eligible|eligibility|available|request|must)|(?:eligible|eligibility|available).{0,50}(?:for\s+)?(?:a\s+)?refund|(?:\d+\s*(?:(?:business|working)\s+)?-?\s*(?:day|days|дн)).{0,80}(?:refund|повернен)|(?:refund|повернен\w+).{0,100}(?:submit|store|purchase)/i, 'good'],
  ['cancellation', 'Умови скасування', /(?:cancel|cancell?ation|скасув\w+).{0,120}(?:subscription|membership|підписк|plan|план|any\s*time|будь-який час)/i, 'medium'],
  ['penalty', 'Штрафи та дострокове припинення', /(?:early|pre[- ]?term(?:ination)?|before the end of).{0,55}(?:termination|cancell?ation|cancel).{0,55}(?:fee|penalt\w*|charge)|(?:termination|cancell?ation|cancel(?:ling|ing)?).{0,45}(?:fee|penalt\w*|charge)|(?:fee|penalt\w*|charge).{0,45}(?:cancel|terminat)|(?:штраф|пеня|плата за достроков\w*|комісія за скасуван\w*).{0,70}(?:підписк|тариф|план|достроков\w*|скасув\w*)/i, 'high'],
  ['warning', 'Неповоротна оплата', /non[- ]?refundable|no refunds?|do not refund(?: or credit)?|do not (?:provide|offer|issue) refunds?|не підлягає поверненню|кошти не повертаються/i, 'high'],
];
const MONEY = /(?:[$€£₴]\s?\d{1,6}(?:[.,]\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?\s?(?:USD|EUR|UAH|грн))/gi;
const PRICE_CONTEXT = /(?:price|pricing|cost|subscription|plan|monthly|annually|per\s+(?:month|year)|вартіст|ціна|підписк|тариф|на\s+(?:місяць|рік)|щомісячн|щорічн)/i;
const LEGAL_AMOUNT_CONTEXT = /(?:liabilit|damages|aggregate\s+liability|claim|lawsuit|court)/i;
const CADENCES = [
  { cadence: 'monthly', multiplier: 12, pattern: /\bmonthly\b|\bper\s+month\b|\ba\s+month\b|\/\s*(?:mo|months?)\b|щомісяч\w*|на\s+місяць|за\s+місяць/gi },
  { cadence: 'yearly', multiplier: 1, pattern: /\bannually\b|\bannual\b|\byearly\b|\bper\s+year\b|\ba\s+year\b|\/\s*(?:yr|years?)\b|per\s+annum|щоріч\w*|на\s+рік|за\s+рік/gi },
  { cadence: 'weekly', multiplier: 52, pattern: /\bweekly\b|\bper\s+week\b|\ba\s+week\b|\/\s*(?:wk|weeks?)\b|щотижнев\w*|на\s+тиждень|за\s+тиждень/gi },
  { cadence: 'quarterly', multiplier: 4, pattern: /\bquarterly\b|\bper\s+quarter\b|\ba\s+quarter\b|\/\s*(?:qtr|quarters?)\b|щоквартальн\w*|на\s+квартал/gi },
  { cadence: 'half-yearly', multiplier: 2, pattern: /\bsemi[- ]?annual(?:ly)?\b|\bevery six months\b|\bper six months\b|раз на півріччя/gi },
];

function parseMoney(value) {
  const currency = /\$|\bUSD\b/i.test(value) ? 'USD' : /€|\bEUR\b/i.test(value) ? 'EUR' : /£|\bGBP\b/i.test(value) ? 'GBP' : /₴|\bUAH\b|грн/i.test(value) ? 'UAH' : null;
  let numeric = value.replace(/[^\d.,]/g, '');
  const dot = numeric.lastIndexOf('.'), comma = numeric.lastIndexOf(',');
  const decimal = Math.max(dot, comma);
  if (dot >= 0 && comma >= 0) {
    const separator = dot > comma ? '.' : ',';
    numeric = numeric.replace(separator === '.' ? /,/g : /\./g, '').replace(separator, '.');
  } else if (decimal >= 0) {
    const fractionalDigits = numeric.length - decimal - 1;
    if (fractionalDigits > 0 && fractionalDigits <= 2) numeric = numeric.slice(0, decimal).replace(/[.,]/g, '') + '.' + numeric.slice(decimal + 1);
    else numeric = numeric.replace(/[.,]/g, '');
  }
  const amount = Number(numeric);
  return { amount: Number.isFinite(amount) ? amount : null, currency };
}

function priceCadence(text, start, end) {
  let left = start, right = end;
  while (left > 0 && !/[.!?;\n]/.test(text[left - 1]) && start - left < 140) left--;
  while (right < text.length && !/[.!?;\n]/.test(text[right]) && right - end < 140) right++;
  const clause = text.slice(left, right), tokenStart = start - left, tokenEnd = end - left;
  let closest = null;
  for (const item of CADENCES) {
    item.pattern.lastIndex = 0;
    for (const match of clause.matchAll(item.pattern)) {
      const markerStart = match.index ?? 0, markerEnd = markerStart + match[0].length;
      const distance = markerEnd < tokenStart ? tokenStart - markerEnd : markerStart > tokenEnd ? markerStart - tokenEnd : 0;
      if (!closest || distance < closest.distance) closest = { cadence: item.cadence, multiplier: item.multiplier, distance };
    }
  }
  const introPatterns = [
    { pattern: /\bfree\s+for\s+(\d+)\s+months?\b/gi },
    { pattern: /\$0\s+for\s+(\d+)\s+months?\s*,?\s*then\b/gi },
    { pattern: /\b(\d+)\s+months?\s+free\b/gi },
    { pattern: /\bone\s+month\s+free\b/gi, months: 1 },
    { pattern: /\bfirst\s+month\s+free\b/gi, months: 1 },
    { pattern: /\bfirst\s+(\d+)\s+months?\s+free\b/gi },
    { pattern: /безкоштовн\w*\s+протягом\s+(\d+)\s+місяц\w*/gi },
    { pattern: /(\d+)\s+місяц\w*\s+безкоштовн\w*/gi },
  ];
  let intro = null;
  for (const item of introPatterns) {
    item.pattern.lastIndex = 0;
    for (const match of clause.matchAll(item.pattern)) {
      const markerStart = match.index ?? 0, markerEnd = markerStart + match[0].length;
      const distance = markerEnd < tokenStart ? tokenStart - markerEnd : markerStart > tokenEnd ? markerStart - tokenEnd : 0;
      const months = Math.min(12, Math.max(1, Number(match[1] || item.months || 1)));
      if (!intro || distance < intro.distance) intro = { months, distance };
    }
  }
  return closest ? { cadence: closest.cadence, multiplier: closest.multiplier, introMonths: intro?.months || 0 } : { cadence: null, multiplier: null, introMonths: intro?.months || 0 };
}

function evidence(text, regex) {
  const match = regex.exec(text);
  if (!match) return '';
  const start = Math.max(0, match.index - 100);
  const end = Math.min(text.length, match.index + match[0].length + 140);
  return `…${text.slice(start, end).trim()}…`;
}

function confidenceFor(kind, context, matchText, cadence = null) {
  const clause = context.toLocaleLowerCase();
  const ambiguous = /\b(?:may vary|vary by|varies by|depending on|subject to|where applicable|if applicable|at (?:our|the provider'?s) discretion|not guaranteed|could apply|might apply|may or may not|some plans.{0,70}other plans|availability may change|eligibility requirements)\b/i.test(clause)
    || /\b(?:refunds?|fees?|penalties|cancellations?)\s+(?:may|might|could)\s+(?:be\s+)?(?:available|eligible|applicable|charged|provided|appl(?:y|ies))/i.test(clause)
    || (kind === 'renewal' && /\b(?:plan|subscription|membership)\s+(?:may|might|could)\s+(?:also\s+)?renew/i.test(clause))
    || (kind === 'refund' && /\b(?:may|might|could)\s+be\s+eligible\s+for\s+(?:a\s+)?refund/i.test(clause));
  if (ambiguous) return 'low';
  if (kind === 'price') return /\b(?:starting at|starts? at|from|up to|estimated|approximately|around|varies by|depending on)\b/i.test(context) ? 'low' : cadence ? 'high' : 'medium';
  if (kind === 'renewal') return /auto(?:matically)?[- ]?renew|automatically renew|renew\w*\s+automatically|recurring\s+(?:billing|payment)|billed\s+(?:monthly|annually|yearly)/i.test(matchText) ? 'high' : 'medium';
  if (kind === 'refund') return /\b(?:no refunds?|non[- ]?refundable|refunds?\s+(?:are\s+)?(?:available|accepted|issued|provided)|eligible\s+for\s+(?:a\s+)?refund|refund.{0,35}\bwithin\s+\d+)/i.test(matchText) ? 'high' : 'medium';
  if (kind === 'cancellation') return /cancel\w*\s+(?:at\s+)?any\s+time|cancel\w*\s+anytime|may cancel/i.test(matchText) ? 'high' : 'medium';
  if (kind === 'trial' || kind === 'penalty' || kind === 'warning') return 'high';
  return 'medium';
}

function nearbyClause(text, index, length) {
  const leftLimit = Math.max(0, index - 160), rightLimit = Math.min(text.length, index + length + 160);
  const leftText = text.slice(leftLimit, index);
  const rightText = text.slice(index + length, rightLimit);
  const lastBoundary = Math.max(leftText.lastIndexOf('.'), leftText.lastIndexOf('!'), leftText.lastIndexOf('?'), leftText.lastIndexOf(';'), leftText.lastIndexOf('\n'));
  const firstBoundary = rightText.search(/[.!?;\n]/);
  const start = lastBoundary >= 0 ? leftLimit + lastBoundary + 1 : leftLimit;
  const end = firstBoundary >= 0 ? index + length + firstBoundary : rightLimit;
  return text.slice(start, end);
}

export function extractPurchaseTerms(text) {
  const findings = [];
  const priceDetails = [];
  for (const [kind, title, regex, severity] of RULES) {
    const snippet = evidence(text, regex);
    if (snippet) {
      const match = regex.exec(text);
      const context = nearbyClause(text, match?.index || 0, match?.[0].length || 0);
      const confidence = confidenceFor(kind, context, match?.[0] || '');
      findings.push({
      kind,
      title,
      summary: confidence === 'low' ? 'Не вдалося впевнено визначити за цим фрагментом' : severity === 'high' ? 'Потребує уваги до оплати' : severity === 'good' ? 'Умову повернення згадано — перевірте винятки' : 'Перевірте деталі на сторінці',
      evidence: snippet,
      severity,
      confidence,
    });
    }
  }

  const prices = [];
  for (const match of text.matchAll(MONEY)) {
    const around = text.slice(Math.max(0, match.index - 90), Math.min(text.length, match.index + match[0].length + 90));
    if (!PRICE_CONTEXT.test(around) || LEGAL_AMOUNT_CONTEXT.test(around)) continue;
    const value = match[0].replace(/\s+/g, ' ').trim();
    if (prices.includes(value)) continue;
    prices.push(value);
    const parsed = parseMoney(value);
    const cadence = priceCadence(text, match.index ?? 0, (match.index ?? 0) + match[0].length);
    const annualAmount = cadence.multiplier && parsed.amount !== null ? Math.round(parsed.amount * cadence.multiplier * 100) / 100 : null;
    const introMonths = cadence.cadence === 'monthly' ? cadence.introMonths : 0;
    const firstYearAmount = annualAmount !== null && cadence.cadence === 'monthly' ? Math.round(parsed.amount * Math.max(0, 12 - introMonths) * 100) / 100 : annualAmount;
    priceDetails.push({ amount: parsed.amount, currency: parsed.currency, cadence: cadence.cadence, annualAmount, firstYearAmount, introMonths });
    const confidence = confidenceFor('price', nearbyClause(text, match.index ?? 0, match[0].length), value, cadence.cadence);
    findings.push({
      kind: 'price',
      title: 'Знайдена сума',
      summary: confidence === 'low' ? 'Не вдалося впевнено визначити ціну за цим фрагментом' : 'Звірте ціну та період оплати в першоджерелі',
      evidence: `…${around.trim()}…`,
      severity: 'medium',
      confidence,
    });
    if (prices.length === 8) break;
  }
  return { findings, prices, priceDetails };
}
