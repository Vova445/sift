export const REQUEST_WINDOW_MS = 60_000;
export const AUTH_REQUESTS_PER_MINUTE = 5;
export const ANALYZE_REQUESTS_PER_MINUTE = Object.freeze({ free: 3, one: 5, pro: 30 });

export function rollingWindowResult({ currentCount = 0, windowStartedAt = null, now = Date.now(), limit, windowMs = REQUEST_WINDOW_MS }) {
  const active = windowStartedAt !== null && now < windowStartedAt + windowMs;
  const windowStart = active ? windowStartedAt : now;
  const count = active ? currentCount + 1 : 1;
  const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
  return { allowed: count <= limit, count, windowStart, retryAfter };
}
