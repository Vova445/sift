export const REQUEST_WINDOW_MS: number;
export const AUTH_REQUESTS_PER_MINUTE: number;
export const ANALYZE_REQUESTS_PER_MINUTE: Readonly<{ free: number; one: number; pro: number }>;
export function rollingWindowResult(input: { currentCount?: number; windowStartedAt?: number | null; now?: number; limit: number; windowMs?: number }): { allowed: boolean; count: number; windowStart: number; retryAfter: number };
