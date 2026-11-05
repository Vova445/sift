# Subscription Radar setup and privacy

Subscription Radar accepts manually forwarded receipts at a per-user address such as `radar+<random-token>@<domain>`. The token is an address-level secret: rotating or disabling it invalidates the old destination.

## Cloudflare configuration

1. Use a domain/zone owned by the Sift operator and enable Cloudflare Email Routing for it.
2. Add the Worker variable `EMAIL_RADAR_DOMAIN` with that verified domain. Keep it unset in environments where inbound mail is not configured; the dashboard then explains why an address cannot be created.
3. Deploy the Worker with the `email(message, env, ctx)` handler in `scripts/wrap-worker-entry.mjs`.
4. In Email Routing, enable subaddressing for the domain, then add a rule for `radar@<domain>` and route it to the `sift-app` Email Worker. Cloudflare routes `radar+<token>@<domain>` through that base rule, so one rule covers every user address.
5. Keep `DUNNING_CRON_SECRET`, `RESEND_API_KEY`, and `AUTH_EMAIL_FROM` configured for the internal parser endpoint and reminders. The existing hourly Worker cron sends due reminders and removes expired receipt fingerprints.
6. Keep the `subscription_radar` support feature flag enabled only while the service is available. `AI_RADAR_ENABLED=false` is an additional AI kill switch.

Cloudflare's inbound Email Worker receives a raw stream and trusted Authentication-Results metadata. The Worker enforces a 1 MiB per-message limit, requires a Cloudflare-authenticated SPF, DKIM, or DMARC pass, rejects unknown/disabled addresses, and invokes the internal endpoint with a server-only bearer secret. The internal route is not an unauthenticated public ingestion API.

## Parsing and data retention

`postal-mime` parses MIME, transfer encodings and character sets in memory. Attachments are not sent to the model. The model uses JSON Schema mode; the application independently validates field types, confidence, exact source quotes, currency/amount and a date explicitly present in the quoted evidence. Ambiguous or unsupported messages are marked for review and do not create a calendar entry. Email text, sender, subject, attachments and extracted evidence quotes are never written to D1 or application logs. Only a SHA-256 message fingerprint and processing status are retained for at most seven days for deduplication/retry and then deleted by the hourly cron. The dashboard also offers immediate deletion of all imported facts and fingerprints.

The calendar/watchlist entries are separate from scan-linked Planner records: importing mail never creates a fake scan or invents a source URL. One record is kept per user, normalized service name and next-charge date; a later receipt for the same date updates that record rather than duplicating it.

## Testing

Run `npm run test:integration`. The integration test uses ephemeral Miniflare D1, a deterministic mock of the AI binding, and 10 realistic MIME receipt fixtures. It checks address entitlement and rotation, authentication rejection, evidence validation, same-message replay, service/date deduplication, seven-day metadata expiry, three-day reminders, one-click unsubscribe, and immediate deletion. These fixtures verify parsing and application behavior; they are not live provider emails.

Before public launch, configure the owned mail domain and routing rule, then forward at least 10 consented real receipts from representative services and manually compare service, amount, currency, and next charge date with the original messages. Do not forward another person's mail without their permission.
