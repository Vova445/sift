# Sift conversion funnel

The first-party funnel measures one browser session only: **visit → successful analysis → account created → checkout started → payment confirmed**. A checkout is recorded only for a signed-in account, and a `pay` event is recorded only after WayForPay's verified payment confirmation. Each session can contribute at most once to each stage.

## Consent and data

- No funnel event is sent before opt-in. A refusal is stored locally and can be changed with **Налаштування приватності** in the landing-page footer.
- `Do Not Track` and `Global Privacy Control` suppress collection.
- The browser keeps a random UUID in `sessionStorage`; the event table stores only its SHA-256 hash, one of five fixed stage names, and a timestamp. While a checkout is pending, the hash is temporarily attached to that payment order to connect a confirmed payment; it is cleared as soon as the order becomes final, and the hourly cleanup clears any stale pending association. Emails, page URLs, report text, and payment details are not part of the event table.
- Events older than 90 days are deleted by the existing hourly privacy-retention Cron job.
- Funnel counts are available only to the verified account whose email matches `ANALYTICS_ADMIN_EMAIL`.

## Setup

Set the analytics administrator's verified account email locally in `.dev.vars`:

```ini
ANALYTICS_ADMIN_EMAIL=your-admin@example.com
```

For the deployed Worker, set the same value as a secret and apply D1 migrations:

```powershell
npx wrangler secret put ANALYTICS_ADMIN_EMAIL --name sift-app
npx wrangler d1 migrations apply sift-production --remote
```

The admin opens **Dashboard → Воронка** or `/dashboard/analytics`. The API returns 401 to signed-out visitors and 403 to accounts outside the configured admin allowlist.

## Verification

`npm run test:integration` exercises consent-event validation and deduplication, a real analyzer response, signup, checkout, signed WayForPay payment plus replay, admin-only aggregate counts, and 90-day cleanup in an isolated Miniflare D1 database. External service calls are stubbed in this test.
