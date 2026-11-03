# Browser E2E and visual regression

`npm run test:e2e` runs the critical browser journey in Playwright Chromium at three fixed viewports: 390×844, 768×1024, and 1440×900. The test covers signup validation/consent, the one-time email verification page, analysis, the WayForPay sandbox handoff, paid status on return, reopening the saved report, mobile overflow, and the paid translation control.

The built Sift Worker serves the page and client bundle during the test. Playwright intercepts the browser's API calls and provider checkout with deterministic fixtures, so it needs no secrets, email delivery, CAPTCHA challenge, external sites, or real charge. The API handlers, D1 persistence, signature validation, and webhook idempotency are exercised separately by `npm run test:integration`; the browser sandbox does not claim to test a live WayForPay merchant account.

The report component is compared against checked-in `toHaveScreenshot` baselines for each viewport. CI runs browser screenshots on Windows before the separate Linux deployment job, keeping the screenshot comparison on the same OS family as the checked-in baselines.

```sh
npm run test:e2e:install
npm run build
npm run test:e2e
```

Update baselines only after reviewing the screenshots:

```sh
npm run test:e2e:update
```
