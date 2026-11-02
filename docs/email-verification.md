# Email verification

New accounts remain unverified until the user submits a one-time token. Sift stores only its SHA-256 digest in D1; the token expires after 24 hours. Requesting another email invalidates older unused tokens. Verification is consumed atomically, so two submissions of the same token cannot both succeed. Confirmed state is stored separately in `email_verification_status`.

Resends require the signed-in account and a same-origin request. D1 allows at most five send attempts per 24-hour window, with at least one minute between attempts. The limit counts failed provider sends too.

Unverified users can sign in and use Free. Server-side entitlements and analysis expose only Free access until `email_verification_status.verified_at` is set; checkout, One Sift credits, translation, full evidence, and Planner remain unavailable. Existing accounts have no verification row after migration and must verify once.

## Email configuration

Set Worker secrets/vars:

- `RESEND_API_KEY`
- `AUTH_EMAIL_FROM` — a sender on a domain verified in Resend. If omitted, Sift uses `DUNNING_FROM_EMAIL`.
- `APP_BASE_URL` — the exact canonical origin. In local sandbox, use the same host and port as the browser, such as `http://127.0.0.1:8788`.

If mail is not configured or Resend rejects the request, the account is still created but remains Free-only. The account modal explains the problem; the user can resend after the server is configured. The project uses Resend's email API and an idempotency key for each token send.

## Verification checks

- Register and confirm that an email is sent; submit the link and confirm the page reports success.
- Submit the same token again: it returns HTTP 409.
- Set a test token's `expires_at` to a past timestamp and submit it: it returns HTTP 410.
- Resend immediately: rate limited; after one minute, a resend can succeed; the sixth send in the 24-hour window is blocked.
- Before confirmation, checkout and paid API features return HTTP 403; after confirmation, normal server-side plan entitlements apply.

Migration: `0010_email_verification.sql`.
