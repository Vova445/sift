# Sift monitoring

## Worker errors and logs

The Worker enables persisted Cloudflare Workers Logs, invocation logs, and sampled traces in `wrangler.jsonc`. App-generated incident records omit query strings and user data. Use **Workers & Pages → sift-app → Logs** in the Cloudflare dashboard, or run `npx wrangler tail sift-app --format pretty` to watch events live.

Uncaught exceptions and HTTP 5xx responses are written as structured JSON with a request ID, safe route, error class, and timestamp. When Telegram secrets are configured, the Worker sends a deduplicated alert (one per route/error class per minute). The message intentionally omits exception details and user data; use the request ID to find the corresponding Worker log.

## Health endpoint and external downtime alerts

`GET /health` returns `200` only when the Worker can query D1; otherwise it returns `503`. Configure an external HTTP uptime monitor to check `https://sift-app.reviewradar-vova445.workers.dev/health` and require HTTP 200. Configure that monitor's own Telegram contact for outages, because an unavailable Worker cannot send its own alert. External monitoring services send their alert after their configured interval and retry policy.

The Worker also runs a one-minute scheduled health check. Add a Healthchecks.io check with a one-minute period and grace time, then store its base ping URL as the `UPTIME_PING_URL` Worker secret. The scheduled handler pings only after `/health` succeeds and sends `/fail` if it does not. Enable Healthchecks.io's Telegram integration for dead-man-switch alerts if desired. Keep the ping URL private; it authorizes heartbeat signals.

## Telegram exception alerts

Create a Telegram bot, start a conversation with it (or add it to the target group), and set these secrets on the Cloudflare Worker:

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN --name sift-app
npx wrangler secret put TELEGRAM_CHAT_ID --name sift-app
npx wrangler secret put UPTIME_PING_URL --name sift-app
npx wrangler secret put MONITORING_TEST_TOKEN --name sift-app
```

Use `wrangler secret put` interactively; do not commit real values to `.dev.vars.example` or source control. Telegram alerts cover application exceptions, HTTP 5xx, and scheduled-job failures. Configure the external HTTP monitor separately to receive alerts when the whole Worker or network route is unavailable.

## Safe synthetic failure

The `POST /api/internal/monitoring/test-error` route is disabled unless `MONITORING_TEST_TOKEN` is set and the matching `x-monitoring-test-token` header is provided. A valid request intentionally throws, which exercises Worker Logs and Telegram alert delivery. Run this only when expecting a test alert:

```powershell
$headers = @{ 'x-monitoring-test-token' = '<MONITORING_TEST_TOKEN>' }
Invoke-WebRequest -Method Post -Uri 'https://sift-app.reviewradar-vova445.workers.dev/api/internal/monitoring/test-error' -Headers $headers
```

The endpoint returns 404 when the token is missing or invalid. The secret grants permission to generate an intentional Worker error, so keep it private and rotate it after a production alert drill.

To exercise the same health-check and heartbeat logic as the one-minute Cron Trigger, POST to `/api/internal/monitoring/test-heartbeat` with the same header. This returns 200 only when D1 and the optional uptime ping both succeed. It signals a real success ping to the configured uptime monitor, so use it only during a planned check.

## Local verification

```powershell
npm run test:monitoring
Invoke-WebRequest -Uri 'http://127.0.0.1:8788/health'
```

The scheduled handler calls the same tested heartbeat helper. Wrangler's scheduled-handler test route is unavailable with this project's no-bundle entry, so use the secret-protected test-heartbeat route for a live local check.
