# WayForPay billing webhook handling

The callback endpoint verifies the provider merchant and HMAC signature before applying any payment change. Invalid or malformed callbacks receive HTTP 400 and are written to `billing_events` with a hash of the request and sanitized fields; raw callback bodies and card data are not stored.

WayForPay does not provide a stable webhook event ID in the callback payload, so `event_key` is the SHA-256 digest of the signed callback fields and signature. D1 claims each event under a short processing lease. Processed or ignored replays receive the normal signed acknowledgment without reapplying effects. A transient processing failure is marked `failed`; provider retries can claim it again. A worker crash leaves a lease that becomes claimable after 90 seconds.

`payment_orders` and the subscription credit/payment ledger remain independently idempotent. This protects the payment state if the service completes the payment update but fails before marking the webhook event processed.

Run the callback locally with a signed test payload, replay it, and query `billing_events` by `order_reference` to confirm one processed event and a stable event key. Send the exact callback from the WayForPay merchant dashboard for the production verification; do not manually modify callback fields because the signature will no longer match.
