# D1 backup and recovery runbook

## Protection model

- Cloudflare D1 Time Travel is automatic; there is no enable switch. It provides point-in-time recovery. Cloudflare currently retains 30 days on Workers Paid and 7 days on Workers Free.
- A Cloudflare Workflow starts a full D1 SQL export every day at 02:00 UTC, downloads the completed export, and writes it to the private `sift-app-d1-backups` R2 bucket.
- Backups are stored under `d1/YYYY-MM-DD/` with the D1 bookmark and database ID in object metadata. The Workflow removes objects older than 30 days after a successful export.
- The D1 export API must be polled until completion. Cloudflare notes that a running export can temporarily make D1 unavailable to queries; the scheduled time is therefore set to a low-traffic window.
- The API token is stored as the Worker secret `D1_REST_API_TOKEN`, never in source control. Restrict it to the account and D1 export access needed by this Worker. The R2 bucket has no public URL configured.
- R2 is not yet activated on the authenticated Cloudflare account. Cloudflare's setup flow adds an R2 subscription with usage-based billing (monthly free quota is available); account activation/payment setup must be completed before provisioning the bucket.

## Setup and deployment

1. Confirm `CF_ACCOUNT_ID` and `D1_BACKUP_DATABASE_ID` in `wrangler.jsonc` identify the production account and database. Do not deploy with an unknown or stale D1 ID.
2. Create the R2 bucket if it does not exist: `npx wrangler r2 bucket create sift-app-d1-backups`.
3. Create a Cloudflare API token with permission to export the target D1 database and set it as a Worker secret: `npx wrangler secret put D1_REST_API_TOKEN`.
4. Deploy the Worker. Check the `sift-d1-backup` Workflow binding, `BACKUP_BUCKET` binding, and 02:00 UTC Cron trigger in the Cloudflare dashboard.
5. Start one controlled backup from the Workflow dashboard or `npx wrangler workflows trigger sift-d1-backup '{"scheduledAt":"2026-11-03T02:00:00.000Z"}' --id manual-backup-20261103`. Verify a new SQL object appears under `d1/` and that the Workflow completed successfully.

## Restore to an isolated staging database

Run this quarterly and after material schema changes. Never restore a production snapshot into the production D1 as a test.

1. Select a dated object in R2 and download it: `npx wrangler r2 object get sift-app-d1-backups/d1/YYYY-MM-DD/<backup-file>.sql --file ./.tmp/d1-restore.sql`.
2. Create a fresh staging D1: `npx wrangler d1 create sift-staging-restore-YYYYMMDD`.
3. Import the snapshot: `npx wrangler d1 execute sift-staging-restore-YYYYMMDD --remote --file ./.tmp/d1-restore.sql`.
4. Verify core tables, indexes, row counts, and representative reports against the source snapshot. Confirm the app's critical read paths against staging.
5. Record the selected R2 key/bookmark, start/end UTC times, import output, validation results, and measured restore duration in the operations log. The target is ≤30 minutes.

## Point-in-time recovery with D1 Time Travel

For an accidental delete/update or failed migration, first identify a safe timestamp and current bookmark. Restore is destructive and overwrites the database in place, so pause writes and export a fresh pre-restore backup before proceeding.

```powershell
npx wrangler d1 time-travel info sift-production --timestamp="2026-11-03T01:55:00Z"
npx wrangler d1 time-travel restore sift-production --timestamp="2026-11-03T01:55:00Z"
```

Review the displayed target and confirm explicitly. Save the “undo” bookmark Wrangler prints, then validate app health, representative users/reports, and billing state before reopening writes. For a larger recovery, restore first into a new staging database from the R2 SQL dump, validate it, then plan a controlled production cutover.

## Quarterly recovery drill

`npm run verify:backup-restore` runs the full current migration set into an isolated local source D1, creates representative user/report data, exports SQL, imports it into a separate isolated staging D1, and checks the restored rows and index. It reports elapsed time and removes only its temporary test directory. This verifies the SQL restore path, but does not replace the quarterly remote staging drill above.

## Current verification record

Do not mark the remote recovery acceptance as verified until a real R2 object is imported into a separate remote staging D1 and the elapsed time is recorded.

- Date: 2026-11-03
- Local drill: PASS; latest run 17.27 seconds; current migrations, fixture user/report, and `idx_scans_user_created` verified in isolated local D1.
- Remote drill: NOT RUN. The authenticated account returns no D1 databases; the configured database ID is not found. R2 is not activated and `D1_REST_API_TOKEN` is not configured.
- Native Time Travel: automatic on supported D1 production databases; this account's database backend and retention tier could not be verified. Cloudflare documents 30 days on Workers Paid and 7 days on Workers Free.
- Follow-up: confirm the correct Cloudflare account/database, activate R2 billing, provision the bucket, set `D1_REST_API_TOKEN`, then perform the remote staging drill.
