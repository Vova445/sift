# Sift Pro subscription lifecycle

Sift Pro is billed at ₴279 per calendar month (displayed as $6.90). WayForPay checkout requests a preset monthly recurring payment and the first payment activates a 1-month period. The app does not store the card token.

## Server states and access

- `trialing` and `active` grant Pro until `expires_at`.
- `canceled` disables future charges but keeps Pro through `expires_at`.
- `past_due` and `expired` do not grant Pro.
- Expired rows are moved to `expired` on the next authenticated access check.
- Confirmed recurring payments are recorded once in `subscription_payments`; repeated syncs cannot add the same payment period twice.

## WayForPay configuration

Configure `WAYFORPAY_MERCHANT_ACCOUNT`, `WAYFORPAY_MERCHANT_SECRET`, and `WAYFORPAY_MERCHANT_DOMAIN` as Worker secrets. Cancellation and provider renewal-status reconciliation also require `WAYFORPAY_MERCHANT_PASSWORD`. WayForPay enables its regular-payment service per merchant account; request this from WayForPay and verify the sandbox store before production checkout. If the password or service is unavailable, the app does not mark a cancellation as successful.

The browser only receives the public checkout fields. The provider callback signature is verified server-side. The callback accepts a payment once, the D1 ledger uses a unique provider reference, and an account access check reconciles the provider's latest recurring payment status no more frequently than every ten minutes.

## Verification

Run `npm run test:billing` for the complete state-transition matrix, paid-through entitlement rules, and calendar-month boundaries. `npm run lint` and `npm run build` validate the application. A successful local signed callback verifies initial activation and duplicate-callback idempotency; a genuine card renewal or cancellation must still be run with the merchant's enabled WayForPay sandbox credentials.
