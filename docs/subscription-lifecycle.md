# Sift Pro billing lifecycle

Sift Pro is billed at ₴279 per calendar month. WayForPay processes card details; Sift stores provider references and payment status, never card data.

## Failed renewals and grace period

- A confirmed declined recurring payment moves the subscription to `past_due` once and records `past_due_at` plus `grace_until`.
- The grace deadline is seven days after the later of the failed attempt time and the paid-through date. Pro stays available until that deadline.
- Dashboard shows an update-payment banner and links to the WayForPay payer cabinet.
- A Cloudflare Cron Trigger runs hourly. It reconciles recurring status with WayForPay, sends one idempotent recovery email via Resend, retries delivery failures, and expires `past_due` subscriptions once grace ends.
- If the schedule misses a run, authenticated access checks also expire subscriptions after the deadline.
- Expiration changes only the subscription status and entitlements. Reports and account data are retained.
- Successful payment restores `active`, extends the period, and clears the dunning state.

## Provider configuration

Set the following Worker secrets/variables:

- Existing WayForPay merchant account, password, and signing secrets, so the cron can reconcile recurring status.
- `DUNNING_CRON_SECRET`: a long random secret used to protect the internal scheduled handler route.
- `RESEND_API_KEY`: API key for the transactional email provider.
- `DUNNING_FROM_EMAIL`: sender address verified in Resend.

Local development values can be placed in ignored `.dev.vars`. The `.dev.vars.example` file lists the names. Configure the same Worker values in Cloudflare before relying on dunning emails. Without Resend credentials the app still keeps the grace banner and downgrades after seven days, while email delivery is reported as not configured in the scheduled run.

## Scheduled execution

`npm run build` wraps vinext's Worker entrypoint with a Cloudflare `scheduled()` handler. `wrangler.jsonc` runs it hourly. The scheduled handler calls a server-only route guarded by `DUNNING_CRON_SECRET`.

## Verification

Run `npm run test:billing` for lifecycle, grace-access, and idempotency coverage. `npm run lint` and `npm run build` validate source and generated Worker output. A real declined-card test requires the merchant's active WayForPay recurring sandbox setup, plus the Worker secret and Resend sender configuration.

For local scheduled-handler validation, run the built Worker with Wrangler and invoke `/cdn-cgi/local/scheduled?format=json`; use an isolated local D1 database and a temporary `DUNNING_CRON_SECRET`.
