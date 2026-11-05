# Sift launch checklist

**Review date:** 2026-11-04  
**Decision:** **NO-GO — unsigned**  
**Release target:** closed beta; at least 20 opted-in testers

This checklist records the current workspace and the configured production URL. A local sandbox result is not treated as proof of a live payment, production database, or production alert.

## Verified locally

| Check | Result | Evidence |
|---|---|---|
| Lint | PASS | `npm run lint` |
| Unit tests | PASS | 82/82; core coverage 100% lines, 100% branches, 93.75% functions |
| API integration | PASS | `npm run test:integration`; isolated Miniflare D1, outbound calls stubbed |
| Analyzer benchmark | PASS | 50 labeled excerpts; price, renewal, refund recall 100% each |
| Local D1 backup/restore | PASS | `npm run verify:backup-restore`; isolated source → staging restore in 12.40 s |
| Browser journeys | PASS across segmented reruns | Critical path 3/3 viewports; funnel/onboarding 3/3; Axe and keyboard checks passed on all three viewports (tablet in combined run; mobile and desktop also passed separately) |
| Combined browser run | NEEDS RETEST | 26/27 passed; one desktop Axe run ended with Chromium `Target crashed`. The same desktop accessibility tests then passed 2/2 in isolation. |
| Local app and legal pages | PASS | `http://127.0.0.1:8788/`, `/health`, `/privacy`, `/terms`, `/refund`, `/dashboard` returned HTTP 200; D1 health was `ok` |
| Local production build | BLOCKED | `npm run build` aborts in Rolldown during RSC build with a native panic (`-1073740791`). |

The analyzer benchmark uses saved excerpts from 50 source pages. It is a repeatable parser evaluation, not a fresh crawl of 50 live pages.

## Production blockers

| Requirement | Result | Evidence / action required |
|---|---|---|
| Live WayForPay checkout | **BLOCKED** | Local `WAYFORPAY_MODE` is `sandbox`; live merchant password is absent. Confirm merchant activation, live secrets and payout terms, then run a provider-approved live verification. No live charge was made. |
| Current production deployment | **BLOCKED** | Production homepage returns 200, but `/privacy`, `/terms`, `/refund`, and `/health` return 404. The served site is not verified as the current workspace. |
| Cloudflare deploy and D1 | **BLOCKED** | Latest GitHub deploy run `41680544142` failed applying D1 migrations: Cloudflare returned authentication errors `10000` and `9109`. Current CLI account cannot find configured D1 ID (`7404`) or Worker `sift-app`. Correct the Cloudflare account/token and verify the D1 and Worker IDs before any write/deploy. |
| Production legal pages and checkout copy | **BLOCKED** | Production legal routes return 404. Also reconcile `docs/wayforpay-setup.md`'s “Pro does not auto-renew” statement with the app's monthly auto-renewal text and actual merchant terms; obtain legal review before launch. |
| Production monitoring | **BLOCKED** | Production `/health` is 404. Local `.dev.vars` lacks Telegram and uptime-monitor secrets; the Worker cannot be inspected in the currently configured Cloudflare account. Configure the Worker secrets and an external uptime alert, then verify a controlled alert. |
| Production backup and restore | **BLOCKED** | Only isolated local D1 restore is verified. The recovery runbook says R2 is not activated; `D1_REST_API_TOKEN` is absent and the remote D1 is not accessible. Activate/provision the backup path and complete a remote staging restore drill. |
| Closed beta with 20+ testers | **NOT STARTED** | No opted-in tester roster or completed invitations are recorded. Recruit and confirm at least 20 participants before signing this checklist. |
| Zero open P0/P1 defects | **NOT VERIFIED** | GitHub has no open issues, but that does not certify the local build, production configuration, or all release risks. Re-run CI on the release commit and review the release defect list. |
| Release branch | **NOT READY** | Current branch `codex/ci-staging-40` is six commits ahead of `origin/master`; the current workspace also contains uncommitted implementation changes. Nothing from this review was pushed or deployed. |

## Required before sign-off

- [ ] Restore valid Cloudflare access to the intended account; confirm Worker, production D1, migrations, and R2 resources.
- [ ] Make production legal pages and `/health` return the expected content/status from the deployed release.
- [ ] Configure verified live WayForPay credentials and confirm signed payment/webhook behavior without enabling test-only entitlements in production.
- [ ] Align subscription and cancellation terms with the merchant contract; complete legal review.
- [ ] Configure email delivery, Worker error alerts, external uptime monitoring, and verify alert delivery.
- [ ] Complete a remote backup and staging restore drill; record duration and recovered data checks.
- [ ] Re-run lint, unit, integration, analyzer evaluation, build, and all E2E viewports on the exact release commit; resolve the local Rolldown build failure or establish a reproducible CI build for that commit.
- [ ] Confirm at least 20 testers have opted in and record the beta support/incident contact.
- [ ] Review open P0/P1 defects and attach evidence for each closed item.
- [ ] Sign only after every blocker above is resolved.

## Sign-off

**Release commit:** ____________________  
**P0/P1 review:** ____________________  
**Beta tester count (minimum 20):** ____________________  
**Owner approval:** ____________________  
**Date:** ____________________

