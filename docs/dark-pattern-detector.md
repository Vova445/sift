# Dark pattern screenshot detector

## Behavior

The signed-in Dashboard accepts PNG, JPEG, and WebP screenshots up to 4 MiB and 20 megapixels. The server checks the file signature and dimensions, then calls Cloudflare Workers AI with a fixed, untrusted-image prompt. The UI draws returned bounding boxes over the browser-local preview and shows the model's visible quote, explanation, and confidence.

The supported labels are preselected options, urgency timers, hidden fees, cancellation obstruction, confirmshaming, false scarcity, and purchase-choice misdirection. The model must cite visible text and may return no findings. A clean result is not a guarantee that a checkout is safe.

## Limits and controls

- Free: 1 screenshot analysis per UTC day.
- One Sift: 3 per UTC day.
- Pro: 10 per UTC day.
- Shared AI budget is reserved before the model call; requests are rate-limited to 5 per minute per IP and account.
- The Support feature flag `dark_pattern_detector` and `DARK_PATTERN_AI_ENABLED=false` stop new analysis requests.
- The uploaded image is never written to D1, R2, or the report history. D1 stores only per-user daily counts and AI usage metadata with a random request identifier; the screenshot itself has no hash or filename recorded. The browser keeps its temporary preview until the user removes it or leaves the Dashboard.

## Test coverage

`tests/dark-pattern-detector.test.mjs` covers MIME/signature checks, dimensions, size limits, daily plan quotas, seven-category output validation, box clipping, response parsing, and a 30-case synthetic regression set. `scripts/test-integration.mjs` verifies that anonymous and unverified users are rejected before image parsing or AI invocation.

The synthetic cases validate the contract and output sanitizer; they are not 30 real checkout screenshots and do not measure visual-model precision/recall. A launch-quality accuracy claim still requires a manually labeled set of 30 real screenshots and a live Workers AI run. Do not use the synthetic test count as evidence of real-world detection accuracy.
