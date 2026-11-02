# Server-side entitlements

`lib/entitlements.ts` is the server-side entry point for feature access. `can(user, feature)` resolves the current entitlement from D1 through `accessFor`; a route may pass the `access` snapshot it already loaded in the same request. `guardFeature` returns HTTP 403 for a signed-in account without the feature. Authentication remains a separate HTTP 401 check.

| Feature | Free | One Sift | Pro |
| --- | --- | --- | --- |
| Full evidence | No | Only the report marked with the One Sift credit | Yes |
| Evidence translation | No | Only the One Sift report | Yes |
| Unlimited analysis | No, 3 per month | No, one purchased report | Yes |
| Purchase Planner API | No | No | Yes |
| Full history evidence | No | Only the One Sift report | Yes |
| CSV export | No | No | Yes |

Paid API routes use the shared policy: `/api/translate` and every `/api/watchlist` method. `/api/analyze` reserves the Free monthly quota or the One Sift report credit atomically in D1 before analysis; Pro is the only plan allowed to skip that reservation. `/api/history` and `/api/account` redact evidence per report, so buying One Sift cannot expose older Free reports. Email verification is also required for paid features; accounts without a row in `email_verification_status` resolve to Free until confirmed. Payment callbacks and subscription management are authenticated by their own signatures/session ownership and do not grant features from client state.

Run `npm run test:entitlements` for the feature matrix and 403 response tests. The D1 quota reservation is enforced with conditional `UPDATE ... count < 3` and rolls back partially acquired account/IP reservations if either limit is reached.

## AI cost controls

Only evidence translation calls Workers AI; URL analysis itself is deterministic and does not invoke an AI model. Translation results are cached by a SHA-256 key over normalized evidence plus model and language pair, so repeated report evidence reuses the result. A D1 lease prevents concurrent requests for the same evidence from launching duplicate inference. A per-user daily limit and global atomic daily request/token budgets are enforced before calling the provider. Defaults are 300 translations per user, 500 global calls, 100,000 estimated tokens, and 8,000 characters per evidence fragment. Each request reserves four times the estimated input tokens to leave a margin for translation output. `AI_TRANSLATION_ENABLED=false` (or `0`) disables uncached inference while cached translations remain available. Usage events record report ID, user ID, model, token counts, outcome, and estimated cost in integer micro-USD; no evidence text is recorded. Token counts and cost are estimates when the model response omits usage metadata. A failed model invocation is counted conservatively as input-token usage. Set a lower token limit or flip the kill switch if spend must stop immediately.

Example per-report cost audit:

```sql
SELECT scan_id, SUM(total_tokens) AS estimated_tokens,
       ROUND(SUM(estimated_cost_micros) / 1000000.0, 6) AS estimated_usd,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_calls
FROM ai_usage_events
WHERE created_at >= date('now', '-30 days')
GROUP BY scan_id
ORDER BY estimated_cost_micros DESC;
```
