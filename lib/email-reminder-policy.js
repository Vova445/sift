const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function kyivDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function addCalendarDays(isoDate, days) {
  if (!isIsoDate(isoDate) || !Number.isInteger(days)) return null;
  return new Date(Date.parse(`${isoDate}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString().slice(0, 10);
}

/** Include today's deadline as a catch-up if a scheduled invocation was missed. */
export function isReminderDue(reviewAt, today, daysBefore = 1) {
  if (!isIsoDate(reviewAt) || !isIsoDate(today)) return false;
  if (!Number.isInteger(daysBefore) || daysBefore < 1 || daysBefore > 30) return false;
  return reviewAt >= today && reviewAt <= addCalendarDays(today, daysBefore);
}

export function reminderDaysBefore(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 30 ? parsed : 1;
}

export function validUnsubscribeToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(value);
}

export function reminderDeliveryKey(watchlistId, reviewAt) {
  return `planner:${watchlistId}:${reviewAt}`;
}
