export const SAVINGS_OUTCOMES = Object.freeze(['not_bought', 'canceled', 'refunded']);
export const MAX_SAVINGS_MINOR = 1_000_000_000;

export function parseSavingsAmount(value) {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor > 0 && minor <= MAX_SAVINGS_MINOR ? minor : null;
}

export function validateSavingsEntry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Перевірте дані запису.' };
  if (typeof input.scanId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.scanId)) return { ok: false, error: 'Оберіть збережений звіт.' };
  if (!SAVINGS_OUTCOMES.includes(input.outcome)) return { ok: false, error: 'Оберіть одну з доступних дій.' };
  const amountMinor = parseSavingsAmount(input.amount);
  if (amountMinor === null) return { ok: false, error: 'Вкажіть суму від ₴0,01 до ₴10 000 000 із точністю до копійки.' };
  if (input.confirmed !== true) return { ok: false, error: 'Підтвердіть, що дію виконано і суму перевірено.' };
  return { ok: true, value: { scanId: input.scanId, outcome: input.outcome, amountMinor } };
}

const csvQuote = (value) => {
  let text = String(value ?? '');
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

const outcomeLabels = Object.freeze({ not_bought: 'Не купив', canceled: 'Скасував', refunded: 'Повернув кошти' });

export function buildSavingsCsv(entries) {
  const rows = [
    'sep=;',
    ['Дата підтвердження', 'Звіт', 'Дія', 'Сума (UAH)', 'Джерело суми'].map(csvQuote).join(';'),
    ...entries.map((entry) => [entry.confirmedAt, entry.title, outcomeLabels[entry.outcome] || entry.outcome, (entry.amountMinor / 100).toFixed(2), 'Внесено й підтверджено користувачем'].map(csvQuote).join(';')),
  ];
  return `\uFEFF${rows.join('\r\n')}`;
}
