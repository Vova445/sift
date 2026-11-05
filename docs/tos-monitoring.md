# ToS change monitoring

## User flow

Sift Pro users with a verified email can add a report to the Purchase Planner and turn on **Відстежувати зміни умов**. The monitor keeps at most 20 active URLs per account. It starts from the saved report as its baseline, checks the source page weekly, and can be switched off from the same Planner card. Removing the Planner item removes its monitor and queued alerts through D1 foreign keys.

The comparison only alerts for a changed set of detected prices, a change in whether automatic renewal is stated or its known cadence, and a change in refund availability or its stated deadline. Formatting, title, and evidence copy edits are ignored. Each email includes before/after values, a short explanation, the captured source evidence, and links to the source and Dashboard. It is a change signal for review, not a claim that Sift has verified a seller's legal meaning.

The first scheduled comparison is seven days after enabling. It compares against the saved report, so the alert can include a material change that occurred between that report and the first scheduled check.

## Scheduling and delivery

- Production weekly trigger: Monday at 08:00 UTC (`0 8 * * 1`).
- The existing hourly job also drains overdue checks and retries. Each successful check schedules its next check seven days later.
- At most 50 URLs are checked per invocation, with a five-request concurrency cap. A D1 lease prevents two overlapping cron invocations from checking the same URL at once.
- Failed page checks retry after an hour. Email delivery uses a stable Resend idempotency key; failed deliveries retry hourly up to eight attempts. Expired sending leases are retried after the lease and retry window.
- The `tos_monitoring` support flag is a kill switch for enrollment and scheduled processing.

Required Worker variables/secrets are `APP_BASE_URL`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM` (or `DUNNING_FROM_EMAIL`), and `DUNNING_CRON_SECRET`. If email is not configured, new monitoring cannot be enabled. The internal cron route requires the bearer secret. Apply migrations before enabling the feature.

## Verification

`npm test` covers material and cosmetic snapshot changes. `npm run test:integration` runs the signup/Pro/report/Planner/monitoring flow against isolated Miniflare D1, changes the fixture page price, confirms the email's before/after diff, repeats cron without duplicating an email, confirms cosmetic edits do not alert, and checks the Pro gate and kill switch. All outbound requests are stubbed in this integration test.
