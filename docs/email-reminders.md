# Email reminders and scheduled delivery

Sift Pro Planner sends a reminder for each saved Planner date. `review_at` is a date (not a time); the scheduled job sends on the configured Kyiv calendar day before it, with a catch-up on the date itself if a cron run was missed. The default is one day before. `EMAIL_REMINDER_DAYS_BEFORE` accepts 1–30 days.

## Worker setup

`wrangler.jsonc` already runs the `scheduled()` handler hourly. Cloudflare cron expressions run in UTC. The handler calls the retention, billing dunning, and email reminder jobs. The same `DUNNING_CRON_SECRET` protects all internal job routes.

Configure these Worker secrets/vars:

- `RESEND_API_KEY`: Resend API key.
- `AUTH_EMAIL_FROM`: verified sender address; `DUNNING_FROM_EMAIL` is used as fallback.
- `APP_BASE_URL`: canonical HTTPS app origin in production.
- `DUNNING_CRON_SECRET`: long random secret used only for internal scheduled routes.
- `EMAIL_REMINDER_DAYS_BEFORE`: optional integer from 1 to 30, default `1`.

The email API request includes a visible unsubscribe link and the `List-Unsubscribe` / `List-Unsubscribe-Post` headers. The unsubscribe endpoint supports a link click and the one-click POST form. Each delivery is uniquely keyed by Planner item and date in D1; failed sends retry hourly up to eight attempts, and already-sent reminders are not duplicated. Email reminders require a verified account and active Pro entitlement.

Apply migration `0016_email_reminders.sql` to the production D1 database before deploying. The code can create the tables idempotently at runtime for local development, but the production migration should still be recorded through Wrangler migrations.

## Local verification

- Run `npm run test:email-reminders` for the date window, Kyiv date, bounded offset, token, and idempotency-key policies.
- Set a Planner reminder for tomorrow and invoke the local scheduled handler with `GET /cdn-cgi/handler/scheduled?format=json` (use the actual local Worker port printed by Wrangler). Check the Worker log and `email_reminder_deliveries` in local D1.
- To receive an actual message locally or in production, configure a Resend API key and a sender domain verified by Resend. Empty mail settings fail closed and the cron reports a delivery configuration error when there are due reminders.
- Click the visible unsubscribe link or send a POST with `List-Unsubscribe=One-Click`; the preference is disabled for all earlier reminder links too.
