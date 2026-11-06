# Shared spaces

Sift shared spaces provide a server-authorized shared subscription watchlist and upcoming-charge calendar for one owner and up to four members.

## Membership and access

- The owner creates and pays for the space. Each API request resolves the caller’s membership from D1.
- The owner manages invitations and members and can edit every shared item. Members can add, edit, and delete items they created and can leave the space.
- Invitations use a random 256-bit token. Only its SHA-256 hash is stored in D1. A link expires after seven days and its use count is limited to the remaining seats.
- Members lose read and write access when a space pass expires. Owners can still open the space to renew it.
- Personal reports, personal watchlists, and personal Sift plans remain separate.

## Separate WayForPay payment

The initial catalog assumption is a **119 UAH one-time payment for 30 days**. It is not a recurring charge. The owner accepts Terms, Privacy, Refund, and immediate-performance consent on each checkout. The server owns the amount, order, space, and payment status; signed WayForPay callbacks are idempotent, and a verified `CHECK_STATUS` response can reconcile a delayed callback. A renewal adds 30 days after any remaining paid time.

The price is an implementation default because no space price was supplied. Update `SHARED_SPACE_PRICE_UAH` and the matching database check in `migrations/0026_shared_spaces.sql` together before changing the public price.

## Storage and verification

Migration `0026_shared_spaces.sql` defines spaces, membership, hashed invitations, items, dedicated orders, and checkout consent. Apply migrations to each target D1 before deploying the worker. The integration suite exercises owner/member behavior in isolated Miniflare D1 with two verified accounts and a signed WayForPay sandbox callback. The Playwright test checks item entry and horizontal overflow at mobile and desktop widths.
