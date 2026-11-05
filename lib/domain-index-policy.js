export const DOMAIN_INDEX_MIN_ACCOUNTS = 5;
export const DOMAIN_INDEX_MAX_AGE_DAYS = 365;

export const DOMAIN_INDICATORS = Object.freeze([
  { key: 'price', label: 'Ціна' },
  { key: 'renewal', label: 'Автопродовження' },
  { key: 'cancellation', label: 'Скасування' },
  { key: 'refund', label: 'Повернення' },
  { key: 'trial', label: 'Пробний період' },
  { key: 'penalty', label: 'Штрафні умови' },
  { key: 'warning', label: 'Неповоротна оплата' },
]);

const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const domainLabel = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export function normalizeDomain(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > 2048) return null;
  let url;
  try {
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
    url = new URL(candidate);
  } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  let host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('www.')) host = host.slice(4);
  if (!host || host.length > 253 || host.includes(':') || ipv4.test(host) || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
  const labels = host.split('.');
  if (labels.length < 2 || labels.some((label) => !domainLabel.test(label))) return null;
  if (!/^(?=.{2,63}$)(?:[a-z][a-z0-9-]*[a-z0-9]|[a-z]{2,63})$/.test(labels.at(-1) || '')) return null;
  return host;
}

function validTimestamp(value, now) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) && time <= now.getTime() + 5 * 60_000 && time >= now.getTime() - DOMAIN_INDEX_MAX_AGE_DAYS * 86400_000;
}

function parseIndicators(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(DOMAIN_INDICATORS.map(({ key }) => [key, parsed[key] === true]));
  } catch { return {}; }
}

export function summarizeDomainObservations(rows, now = new Date()) {
  if (!Array.isArray(rows)) return null;
  const eligible = rows.filter((row) => Number.isInteger(row.clarity_score) && row.clarity_score >= 0 && row.clarity_score <= 100 && validTimestamp(row.last_seen_at, now));
  if (eligible.length < DOMAIN_INDEX_MIN_ACCOUNTS) return null;
  const indicatorCounts = Object.fromEntries(DOMAIN_INDICATORS.map(({ key }) => [key, 0]));
  for (const row of eligible) {
    const indicators = parseIndicators(row.indicators_json);
    for (const key of Object.keys(indicatorCounts)) if (indicators[key]) indicatorCounts[key]++;
  }
  const clarityScore = Math.round(eligible.reduce((sum, row) => sum + row.clarity_score, 0) / eligible.length);
  return {
    clarityScore,
    sampleCount: eligible.length,
    confidence: eligible.length >= 30 ? 'higher' : eligible.length >= 10 ? 'moderate' : 'limited',
    indicators: DOMAIN_INDICATORS.map(({ key, label }) => ({ key, label, accountCount: indicatorCounts[key], sharePercent: Math.round((indicatorCounts[key] / eligible.length) * 100) })),
    updatedAt: eligible.map((row) => row.last_seen_at).sort().at(-1),
  };
}

const clean = (value, max) => typeof value === 'string' ? value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

export function validateDomainCorrection(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Перевірте заповнені поля.' };
  const domain = normalizeDomain(input.domain);
  const contactEmail = clean(input.contactEmail, 254).toLowerCase();
  const contactName = clean(input.contactName, 100);
  const organization = clean(input.organization, 140);
  const message = clean(input.message, 3000);
  const evidenceValue = clean(input.evidenceUrl, 500);
  if (!domain) return { ok: false, error: 'Вкажіть коректний публічний домен.' };
  if (input.ownerAttests !== true) return { ok: false, error: 'Підтвердьте, що ви представляєте організацію або маєте повноваження подати звернення.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { ok: false, error: 'Вкажіть робочу контактну email-адресу.' };
  if (contactName.length < 2 || organization.length < 2 || message.length < 20) return { ok: false, error: 'Додайте ім’я, організацію та пояснення щонайменше з 20 символів.' };
  let evidenceUrl = null;
  if (evidenceValue) {
    try {
      const parsed = new URL(evidenceValue);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
      evidenceUrl = parsed.toString().slice(0, 500);
    } catch { return { ok: false, error: 'Посилання на підтвердження має бути публічною HTTP(S)-сторінкою.' }; }
  }
  return { ok: true, value: { domain, contactEmail, contactName, organization, message, evidenceUrl, ownerAttests: true } };
}
