# Account export and deletion

- `GET /api/account/export?format=json|csv` requires the authenticated session. Exports are marked private/no-store and downloaded by the user. Both formats include every account-owned report, full report evidence, and Planner notes; JSON also contains account metadata and billing history.
- CSV uses UTF-8 BOM, semicolon separators, quotes cell content, and prefixes formula-leading content to reduce spreadsheet formula injection.
- `DELETE /api/account` requires same-origin, the current password, and the exact confirmation `ВИДАЛИТИ`. If there is a pending WayForPay checkout, deletion waits for its outcome/expiry. Every uncanceled recurring Pro reference is removed through WayForPay before local deletion. If the provider does not confirm, the request fails and account data remains for retry.
- On success, Sift immediately deletes the user profile, sessions, scans/reports, Planner notes, subscriptions, payment ledger and pending orders, verification/reset tokens, account usage, related webhook payloads, and email signup record from the active D1 database. The session cookie is cleared. A SHA-256 hash of each WayForPay order reference is retained for 30 days so signed late callbacks can be acknowledged without recreating user-linked payment data; the raw reference is not retained in the tombstone table.
- WayForPay may retain its own transaction/account records under its retention rules; those are outside Sift's D1. Sift does not promise deletion from provider backups or records the provider is required to retain.

## Manual verification

1. Create a throwaway account with no subscription, add one scan and one Planner note.
2. Download JSON and CSV. Confirm both contain the report, evidence, and note.
3. Try deletion with a wrong password and wrong confirmation phrase; confirm the account remains.
4. Delete with the correct password and phrase; confirm `/api/auth/me` is unauthenticated and user-owned rows are absent from D1.
5. With a recurring Pro test subscription, confirm deletion waits for WayForPay `REMOVE`; a provider failure must preserve account data and show a retryable error.

Run CSV checks using `npm run test:account-data`. With the local Worker running on 8788 and Node 22+, run `npm run verify:account-data:local` for a destructive-action smoke test. It creates and deletes a throwaway local account only; it refuses non-local URLs.
