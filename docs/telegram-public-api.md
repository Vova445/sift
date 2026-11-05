# Telegram bot and public API

## User setup

1. Sign in to Sift with a verified account on the active Pro plan.
2. Open **Dashboard → API та Telegram**.
3. Create an API key and save the secret in a server-side secret manager. The full key is displayed only once. Revocation takes effect immediately.
4. For Telegram, generate a one-time link and open it in a private chat with the Sift bot. The code expires in 10 minutes.
5. To use a group with up to 10 people, add the bot and have the linked Pro owner run `/allowgroup`. Group requests use the owner's plan and shared rate limit. `/disablegroup` removes that group; `/unlink` in private chat disconnects Telegram and all groups.

The bot responds with the same analyzer result as the web app and saves it to the linked owner's scan history. It supports one URL per message. Pages still pass the existing SSRF policy; forms, cookies, and payment fields are not collected.

## Worker configuration

The operator must create the bot with Telegram's BotFather, then configure these Worker secrets:

- `TELEGRAM_BOT_TOKEN` — bot token from BotFather.
- `TELEGRAM_BOT_USERNAME` — public bot username without the leading `@`.
- `TELEGRAM_WEBHOOK_SECRET` — random value of at least 32 characters; keep it private.

Generate a secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, then set the three values as Worker secrets. For example, for production:

```sh
npx wrangler secret put TELEGRAM_BOT_TOKEN --name sift-app
npx wrangler secret put TELEGRAM_BOT_USERNAME --name sift-app
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --name sift-app
```

Use `--env preview` when configuring the preview Worker. Set the same variables in `.dev.vars` for local webhook testing. Do not commit `.dev.vars` or bot credentials.

Register the HTTPS webhook after deployment. Telegram will attach the secret header checked by the endpoint:

```sh
curl --fail-with-body --request POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  --data-urlencode "url=https://sift-app.sift-vova445.workers.dev/api/telegram/webhook" \
  --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  --data-urlencode 'allowed_updates=["message"]'
```

`POST /api/telegram/webhook` rejects requests without the secret, rejects bodies over 64 KiB, and uses the Telegram update ID with a short lease to suppress webhook retries. Replies use plain text and the provider request is bounded to five seconds. Page fetching has the existing eight-second timeout, keeping the expected response within Telegram's 30-second window.

## Public API

- API-key management: `GET`, `POST`, and `DELETE /api/developer/keys` with a signed-in session. Create requires active Pro and verified email; deletion is allowed after Pro expires.
- Analysis: `POST /api/v1/analyze` with `Authorization: Bearer sift_sk_…` and `{"url":"https://example.com/terms"}`.
- OpenAPI 3.1: `GET /api/v1/openapi.json`; human-readable guide: `/api-docs`.
- API keys are 256-bit random secrets. Only SHA-256 hashes and a short prefix are stored. Five active keys are allowed per account.
- Web, public API, and Telegram share the `analyze:pro` D1 rate-limit bucket at 30 requests per minute per account; the API also enforces IP and key identities. `429` includes `Retry-After`.
- API access is checked against the key owner's current email verification and Pro entitlement on every request. Responses are saved in the owner's Dashboard history.

## Local verification

Apply D1 migrations locally before starting the Worker:

```sh
npx wrangler d1 migrations apply sift-local --local --config wrangler.local.jsonc
```

The integration suite stubs Telegram and target pages, and exercises key hashing, Pro expiry, revocation, rate limits, webhook authentication/idempotency, one-time account linking, group authorization, and ten distinct group users. It does not make a real Telegram message or payment.
