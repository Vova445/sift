# API integration tests

Run `npm run test:integration` with Node 22+. The test bundles the API route handlers into a temporary Worker, starts it in Miniflare, applies every SQL migration to an isolated in-memory D1 database, and removes its temporary files afterward.

The outbound Turnstile, Resend, DNS, analyzed page, and WayForPay services are stubbed. No real email or payment is sent, and no production database or credentials are used.

Coverage includes happy and negative requests for signup, login, logout, current user, email verification/resend, forgot/reset/change password, analyze, history, checkout, WayForPay callback, and payment status. The callback checks signature rejection, amount mismatch, successful activation, and replay idempotency.

The deployment workflow runs this suite after unit tests and before building/deploying.
