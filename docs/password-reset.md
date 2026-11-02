# Password recovery and change

## Implemented behavior

- `POST /api/auth/password/forgot` always returns the same HTTP 200 message, whether the email exists, is malformed, is rate limited, or mail delivery fails. This prevents response-content/status account enumeration.
- Reset links carry a random 256-bit token in the URL fragment. Only its SHA-256 hash is stored in D1. Tokens expire after one hour; requesting another link invalidates previous outstanding links. Opening the link does not consume it; a successful POST consumes it once.
- Reset replaces the PBKDF2-SHA-256 password hash using 310,000 iterations and a fresh random salt, then deletes every session for that account in the same D1 batch.
- Authenticated password change verifies the current password, uses a compare-and-set against the old hash, rotates the password hash/salt, deletes all sessions, and clears the browser session cookie.
- Login attempts are limited to five failures per email/IP pair and 20 per source IP over 15 minutes, followed by a 15-minute lock. Reset email requests are limited to three per email/hour, 20 per IP/hour, and one per minute per email.
- Reset-token submissions are capped at 30 per source IP per 15 minutes. Invalid, expired, consumed, and throttled-token responses are intentionally identical.
- The reset/change forms have responsive layouts; reset links are available from the sign-in dialog and change password is available in Dashboard.

## Required configuration

Password-reset email needs `RESEND_API_KEY`, `AUTH_EMAIL_FROM` (or `DUNNING_FROM_EMAIL`), and a canonical `APP_BASE_URL`. Set these in local `.dev.vars` and as production Worker secrets/vars. The forgot-password response intentionally does not confirm whether sending succeeded.

## Verification

1. Sign up and verify the email.
2. Request reset once for a registered email and once for an unregistered email; compare response status and body.
3. Follow the email link, set a new password, and verify the old password fails and the new password works.
4. Create a second session before reset; confirm it is rejected after reset.
5. Reuse the same reset link and confirm it is rejected. Wait over one hour or use a past expiry in a local DB to check expiration.
6. Try five bad logins for one email/IP pair and 20 across accounts from one IP; confirm the lockout response. Successful login clears that pair and IP bucket.
7. Change password from Dashboard; verify all existing sessions end and the browser is redirected to sign in.

Run policy checks with `npm run test:password-security`.
