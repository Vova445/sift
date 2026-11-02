# Rate limiting and Turnstile

## Server-side limits

- Login, signup, forgot-password, reset-password, verification resend: 5 requests/minute per IP and account/token where available.
- Analyze: 3/minute Free, 5/minute One Sift, and 30/minute Pro, per IP and signed-in account. A 120/minute ingress ceiling covers malformed and anonymous requests before parsing; existing monthly scan entitlements still apply independently.
- Counters are hashed and atomically stored in D1 for a shared strict window. Cloudflare Rate Limiting bindings provide additional per-location burst ceilings when `RATE_LIMIT_EDGE_ENABLED=true` (the production default in `wrangler.jsonc`). Local `.dev.vars` sets it to `false`, since Miniflare's edge-limit simulation can restart the local Worker; the D1 counter remains fully active locally.
- Every application rate-limit response is HTTP 429 with `Retry-After`.
- Password-reset email retains its separate cooldown and three-per-hour email cap. Password-reset token attempts also retain a 15-minute cap.

## Turnstile

Signup, password-reset request, and password-reset completion require a widget token and server-side Siteverify response. Missing configuration and verification-service failures fail closed. The server also checks the expected action and current hostname.

Configure `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in the Cloudflare Worker secrets/vars. Create a Turnstile widget that allows the production hostname. For local development, Cloudflare's published dummy keys may be used; they always pass and must never be used in production:

- Site key: `1x00000000000000000000AA`
- Secret key: `1x0000000000000000000000000000000AA`

The production keys are not in this repository. The server fails closed until they are configured.

## Verification

Run unit policies with `npm run test:rate-limit` and `npm run test:turnstile`. With the local Worker running, `npm run verify:rate-limit:local` sends 100 signup attempts without a Turnstile token and verifies that the first five receive CAPTCHA rejection while the remaining 95 receive 429 plus `Retry-After`. `npm run verify:analyze-rate-limit:local` verifies the Free plan's three-per-minute analysis limit using an invalid URL, so no external site is fetched. `npm run verify:turnstile:local` checks that signup, reset requests, and reset completion all reject missing CAPTCHA tokens. The scripts retry only Wrangler's documented local-preview response when a Worker is replaced mid-request; they report the number of those transport retries.
