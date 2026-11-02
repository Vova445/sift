# WayForPay setup

## Local sandbox

Copy `.dev.vars.example` to `.dev.vars`, replace the allowlist with the email of a disposable test account, then restart the local worker. The published WayForPay test merchant is already filled in as a convenience; it is public test-only data, never live credentials. Sandbox payments are granted only to matching emails while `WAYFORPAY_MODE=sandbox`.

The hosted payment form posts to WayForPay. The worker stores a pending order in D1, validates the signed service callback, and also supports the signed `CHECK_STATUS` API when the browser returns before a callback arrives. A query string or client-side state cannot activate a plan.

## Production

Set these as Cloudflare Worker secrets/vars (never commit `.dev.vars`):

- `WAYFORPAY_MODE=live`
- `WAYFORPAY_MERCHANT_ACCOUNT` — the account WayForPay assigns to your store
- `WAYFORPAY_MERCHANT_SECRET` — the live signing key from the merchant cabinet
- `WAYFORPAY_MERCHANT_DOMAIN` — the exact domain registered with WayForPay
- Optional: `WAYFORPAY_SANDBOX_ALLOWLIST` only if you intentionally keep a restricted sandbox allowlist; normal production mode ignores test entitlements.

After the live store is activated, configure/deploy those Worker secrets and apply D1 migrations. Pro currently grants 30 days after one successful purchase and does not auto-renew; One Sift grants one credit for 90 days. The checkout is priced at ₴279 and ₴59 respectively, with the displayed USD values sent as WayForPay alternative amounts.

## Remaining merchant-side steps

The code cannot complete business onboarding, KYC, verify payout banking details, or confirm the exact rate on this project's merchant account. WayForPay lists a standard 2% fee on successful payments, while noting that some business types receive an individual rate. Confirm the actual merchant terms and payout settlement in the merchant cabinet before launch.
