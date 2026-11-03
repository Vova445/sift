/** Pure analyzer logic, kept separate from network transport for deterministic tests. */

export function evaluateClarity(findings, prices) {
  const kinds = new Set(findings.map((finding) => finding.kind));
  const has = (kind) => kinds.has(kind);
  // The score measures how much decision-critical information is available, not seller safety.
  // Missing a confirmed price therefore caps the score at 75 instead of allowing a misleading 85+.
  const score = 20 + (prices.length ? 25 : 0) + (has('renewal') ? 15 : 0) + (has('cancellation') ? 15 : 0) + (has('refund') ? 15 : 0) + (has('trial') ? 5 : 0) + (has('warning') ? 5 : 0);
  const decision = has('warning') && !has('refund') && !has('cancellation')
    ? 'close'
    : prices.length > 0 && has('renewal') && has('cancellation') && has('refund') && !has('warning')
      ? 'buy'
      : 'wait';
  const missing = [];
  if (!prices.length) missing.push('ціну');
  if (!has('renewal')) missing.push('умову автопродовження');
  if (!has('cancellation')) missing.push('умови скасування');
  if (!has('refund')) missing.push('умови повернення');
  const verdict = decision === 'buy'
    ? 'Ключові умови знайдено: ціна, автопродовження, скасування й повернення. Звірте фрагменти на першоджерелі перед оплатою.'
    : decision === 'close'
      ? `Закрити вкладку: знайдено умову про неповоротну оплату${missing.length ? `, але не підтверджено ${missing.join(', ')}` : ''}. Не сплачуйте, доки не звірите умови на першоджерелі.`
      : missing.length
        ? `Почекати: не підтверджено ${missing.join(', ')}${has('warning') ? '; також є умова про неповоротну оплату' : ''}. Перевірте першоджерело перед оплатою.`
        : 'Почекати: знайдено умову про неповоротну оплату. Перевірте винятки та обсяг повернення на першоджерелі.';
  return { score, decision, verdict };
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
  ['trial', 'Пробний період', /(?:free|безкоштовн\w*)\s+(?:trial|пробн\w* період)|(?:trial|пробн\w* період)\s+(?:for\s+)?\d+\s*(?:day|дн)/i, 'medium'],
  ['renewal', 'Автоматичне продовження', /auto(?:matically)?[- ]?renew(?:s|ed|al|ing)?|automatically renew\w*|renew\w*\s+automatically|автоматичн\w+\s+(?:продовжен|поновлен)|recurring\s+(?:billing|payment|basis)|billed\s+(?:on\s+)?a?\s*recurring\s+basis|billed\s+(?:monthly|annually|yearly)|(?:subscription|membership|plan).{0,60}\brenew(?:s|ed|al|ing)?\b|\brenew(?:s|ed|al|ing)?\b.{0,60}(?:subscription|membership|billing period)|periodically charge\w*.{0,40}(?:subscription|payment method)|periodic\s+charges?/i, 'high'],
  ['refund', 'Умови повернення', /(?:refund|money.back|повернен\w+).{0,100}(?:\d+\s*(?:(?:business|working)\s+)?-?\s*(?:day|days|дн)|policy|політик|eligible|eligibility|available|request|must)|(?:eligible|eligibility|available).{0,50}(?:for\s+)?(?:a\s+)?refund|(?:\d+\s*(?:(?:business|working)\s+)?-?\s*(?:day|days|дн)).{0,80}(?:refund|повернен)|(?:refund|повернен\w+).{0,100}(?:submit|store|purchase)/i, 'good'],
  ['cancellation', 'Умови скасування', /(?:cancel|cancell?ation|скасув\w+).{0,120}(?:subscription|membership|підписк|plan|план|any time|будь-який час)/i, 'medium'],
  ['warning', 'Неповоротна оплата', /non[- ]?refundable|no refunds?|do not refund(?: or credit)?|do not (?:provide|offer|issue) refunds?|не підлягає поверненню|кошти не повертаються/i, 'high'],
];
const MONEY = /(?:[$€£₴]\s?\d{1,6}(?:[.,]\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?\s?(?:USD|EUR|UAH|грн))/gi;
const PRICE_CONTEXT = /(?:price|pricing|cost|subscription|plan|monthly|annually|per\s+(?:month|year)|вартіст|ціна|підписк|тариф|на\s+(?:місяць|рік)|щомісячн|щорічн)/i;
const LEGAL_AMOUNT_CONTEXT = /(?:liabilit|damages|aggregate\s+liability|claim|lawsuit|court)/i;

function evidence(text, regex) {
  const match = regex.exec(text);
  if (!match) return '';
  const start = Math.max(0, match.index - 100);
  const end = Math.min(text.length, match.index + match[0].length + 140);
  return `…${text.slice(start, end).trim()}…`;
}

export function extractPurchaseTerms(text) {
  const findings = [];
  for (const [kind, title, regex, severity] of RULES) {
    const snippet = evidence(text, regex);
    if (snippet) findings.push({
      kind,
      title,
      summary: severity === 'high' ? 'Потребує уваги до оплати' : severity === 'good' ? 'Умову повернення згадано — перевірте винятки' : 'Перевірте деталі на сторінці',
      evidence: snippet,
      severity,
    });
  }

  const prices = [];
  for (const match of text.matchAll(MONEY)) {
    const around = text.slice(Math.max(0, match.index - 90), Math.min(text.length, match.index + match[0].length + 90));
    if (!PRICE_CONTEXT.test(around) || LEGAL_AMOUNT_CONTEXT.test(around)) continue;
    const value = match[0].replace(/\s+/g, ' ').trim();
    if (prices.includes(value)) continue;
    prices.push(value);
    findings.push({
      kind: 'price',
      title: 'Знайдена сума',
      summary: 'Звірте ціну та період оплати в першоджерелі',
      evidence: `…${around.trim()}…`,
      severity: 'medium',
    });
    if (prices.length === 8) break;
  }
  return { findings, prices };
}
