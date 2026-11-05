const DAY_MS = 86_400_000;
const SAVER_TARGET_USD_CENTS = 5_000;

function typeOf(event) { return event?.type || event?.event_type || ''; }
function sourceOf(event) { return event?.sourceId || event?.source_id || ''; }
function timeOf(event) { return event?.createdAt || event?.created_at || ''; }
function payloadOf(event) {
  if (event?.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)) return event.payload;
  if (typeof event?.payload === 'string') {
    try { const value = JSON.parse(event.payload); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch { return {}; }
  }
  return {};
}
function uniqueBySource(events, type) {
  const seen = new Set();
  return events.filter((event) => {
    if (typeOf(event) !== type) return false;
    const source = sourceOf(event);
    if (!source || seen.has(source)) return false;
    seen.add(source);
    return true;
  });
}
function latestPerSource(events, types) {
  const ordered = [...events].sort((a, b) => timeOf(a).localeCompare(timeOf(b)));
  const latest = new Map();
  for (const event of ordered) {
    if (!types.includes(typeOf(event))) continue;
    const payload = payloadOf(event);
    const source = String(payload.scanId || sourceOf(event));
    if (source) latest.set(source, event);
  }
  return latest;
}
function streakLength(events) {
  const days = [...new Set(uniqueBySource(events, 'analysis_completed')
    .map((event) => timeOf(event).slice(0, 10))
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00.000Z`))))].sort();
  let best = 0, current = 0, previous = null;
  for (const day of days) {
    const date = Date.parse(`${day}T00:00:00.000Z`);
    current = previous !== null && date - previous === DAY_MS ? current + 1 : 1;
    best = Math.max(best, current);
    previous = date;
  }
  return best;
}
function state(current, goal) { return { unlocked: current >= goal, progress: Math.min(current, goal) }; }
function countRule(type, goal) { return (events) => state(uniqueBySource(events, type).length, goal); }

function savingsUsdCents(events) {
  const latest = latestPerSource(events, ['savings_confirmed', 'savings_removed']);
  let total = 0;
  for (const event of latest.values()) {
    if (typeOf(event) !== 'savings_confirmed') continue;
    const payload = payloadOf(event);
    const amountMinor = Number(payload.amountMinor);
    const rate = Number(payload.uahPerUsd);
    if (Number.isSafeInteger(amountMinor) && amountMinor > 0 && Number.isFinite(rate) && rate > 0) {
      // amountMinor is kopecks; dividing by UAH per USD yields USD cents.
      total += Math.floor(amountMinor / rate);
    }
  }
  return total;
}

function timelyCancellationCount(events) {
  const kits = new Set(uniqueBySource(events, 'cancellation_kit_used').map((event) => {
    const payload = payloadOf(event);
    return String(payload.scanId || sourceOf(event));
  }));
  const savings = latestPerSource(events, ['savings_confirmed', 'savings_removed']);
  let count = 0;
  for (const [scanId, event] of savings) {
    if (kits.has(scanId) && typeOf(event) === 'savings_confirmed' && payloadOf(event).outcome === 'canceled') count += 1;
  }
  return count;
}

function polyglotCount(events) {
  const languages = new Set();
  for (const event of uniqueBySource(events, 'translation_used')) {
    const language = String(payloadOf(event).targetLanguage || '').toLowerCase();
    if (language) languages.add(language);
  }
  return languages.size;
}

function watchlistCount(events) {
  let count = 0;
  for (const event of latestPerSource(events, ['watchlist_added', 'watchlist_removed']).values()) {
    if (typeOf(event) === 'watchlist_added') count += 1;
  }
  return count;
}

const formatCount = (unit) => (progress, goal) => `${progress} з ${goal} ${unit}`;

export const ACHIEVEMENT_CATALOG_VERSION = 1;

export const ACHIEVEMENT_CATALOG = Object.freeze([
  { key: 'skeptic', title: 'Скептик', description: 'Перевірте три пропозиції перед тим, як довіряти обіцянкам на сторінці.', goal: 3, icon: 'scan', rule: countRule('analysis_completed', 3), formatProgress: formatCount('перевірок') },
  { key: 'renewal_hunter', title: 'Мисливець за автопродовженням', description: 'Знайдіть п’ять підтверджених умов автопродовження у звітах Sift.', goal: 5, icon: 'renewal', rule: countRule('autorenew_found', 5), formatProgress: formatCount('знахідок') },
  { key: 'saver', title: 'Заощадник', description: 'Зафіксуйте підтверджені заощадження на суму еквівалентну $50 за курсом НБУ на дату запису.', goal: SAVER_TARGET_USD_CENTS, icon: 'savings', rule: (events) => state(savingsUsdCents(events), SAVER_TARGET_USD_CENTS), formatProgress: (progress) => `$${(progress / 100).toFixed(2)} з $50` },
  { key: 'timely_stop', title: 'Вчасна зупинка', description: 'Підготуйте скасування через Cancellation Kit і підтвердіть скасування у Savings Tracker.', goal: 1, icon: 'kit', rule: (events) => state(timelyCancellationCount(events), 1), formatProgress: formatCount('скасування') },
  { key: 'polyglot', title: 'Полігот', description: 'Перекладіть докази трьома різними мовами.', goal: 3, icon: 'languages', rule: (events) => state(polyglotCount(events), 3), formatProgress: formatCount('мов') },
  { key: 'guardian', title: 'Вартовий', description: 'Додайте п’ять різних звітів до Watchlist.', goal: 5, icon: 'guardian', rule: (events) => state(watchlistCount(events), 5), formatProgress: formatCount('у Watchlist') },
  { key: 'streak_7_days', title: 'Серія 7 днів', description: 'Перевіряйте умови у Sift сім різних днів поспіль.', goal: 7, icon: 'streak', rule: (events) => state(streakLength(events), 7), formatProgress: formatCount('днів поспіль') },
  { key: 'mentor', title: 'Наставник', description: 'Запросіть друга, який підтвердить email і створить акаунт.', goal: 1, icon: 'mentor', rule: countRule('referral_completed', 1), formatProgress: formatCount('рефералів') },
]);

export function evaluateAchievementCatalog(events) {
  const safeEvents = Array.isArray(events) ? events : [];
  return ACHIEVEMENT_CATALOG.map((definition) => ({
    key: definition.key,
    title: definition.title,
    description: definition.description,
    goal: definition.goal,
    icon: definition.icon,
    ...definition.rule(safeEvents),
  }));
}

export function achievementProgressLabel(key, progress, goal) {
  const definition = ACHIEVEMENT_CATALOG.find((item) => item.key === key);
  return definition ? definition.formatProgress(Math.min(Number(progress) || 0, goal), goal) : `${progress} з ${goal}`;
}
