export const PUBLIC_VERDICT_DECISIONS = Object.freeze(['buy', 'wait', 'close']);

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isPublicVerdictToken(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

/** Allowlist the exact fields that may leave a private report. */
export function publicVerdictCard(value) {
  if (!value || !Number.isInteger(value.score) || value.score < 0 || value.score > 100) return null;
  if (!PUBLIC_VERDICT_DECISIONS.includes(value.decision)) return null;
  return { score: value.score, decision: value.decision };
}

export function publicVerdictLabel(decision, language = 'uk') {
  const labels = language === 'en'
    ? { buy: 'READY TO DECIDE', wait: 'CHECK THE TERMS', close: 'REVIEW BEFORE PAYING' }
    : { buy: 'МОЖНА ОЦІНЮВАТИ ПОКУПКУ', wait: 'ПЕРЕВІРТЕ УМОВИ', close: 'УМОВИ ПОТРЕБУЮТЬ УВАГИ' };
  return labels[decision] || labels.wait;
}
