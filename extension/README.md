# Sift Checkout Detector

Chrome Manifest V3 and Safari Web Extension source for a local checkout-page prompt.

## Privacy model

- The content script checks only the current page URL and `document.title`. It does not inspect form elements, read input values, serialize page text, or make network requests.
- Installation does not grant access to every site. From the extension toolbar popup, the user opts in to the current site only. Sift registers the detector for that exact scheme and hostname.
- When the user clicks **Check with Sift**, the extension removes URL credentials, query parameters and fragments, and redacts long/session-like path segments. It opens Sift with the cleaned URL in a URL fragment. The fragment is not sent in the initial HTTP request, and `noreferrer` prevents sending the checkout page as the Referer.
- Sift pre-fills the URL but waits for a separate **Перевірити** click before calling the analysis API. The server then uses the existing SSRF-safe analyzer.
- The prompt uses a Shadow DOM, has an accessible close button, and stays dismissed for the current page until navigation.

The detector recognizes common checkout, payment, billing, order, cart and subscription URL/title patterns. Pattern detection is a heuristic, so it may miss custom checkout flows or suggest Sift on an unusual page with a matching title.

## Load unpacked in Chrome

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked** and select this `extension` folder.
3. Open a checkout page, click the Sift extension in the toolbar and choose **Увімкнути детектор тут**. Chrome will request access only to that site.
4. The prompt appears on checkout paths on that site, including after ordinary same-tab navigation. Click it to open Sift with the cleaned URL; confirm the scan on the Sift page.

To remove access, open the extension's site access settings in Chrome or remove the extension.

## Safari

The extension uses the shared WebExtension manifest and APIs. Dynamic content-script registration requires Chrome 96+ or Safari 16.4+. For a local macOS build, run the official Safari Web Extension Packager on a Mac with Xcode:

```sh
xcrun safari-web-extension-packager ./extension \
  --project-location ./safari/SiftCheckoutDetector \
  --app-name "Sift Checkout Detector" \
  --bundle-identifier com.aveiron.sift.checkoutdetector \
  --swift
```

Build and run the generated macOS app in Xcode, then enable the extension in Safari Settings. Safari asks the user to grant website access; the user can grant the current site or choose broader access in Safari's own permission UI. For distribution, sign the containing app and follow App Store Connect review. An extension ZIP can also be uploaded to Apple's web packager in App Store Connect.

This repository was authored on Windows. Safari packaging, signing, and runtime testing require macOS/Xcode and are not performed by the cross-browser source tests here.

## Tests

```sh
npm test
npx playwright test checkout-extension.spec.ts
```

The unit cases cover ten common payment-provider URL/title patterns, ordinary pages, URL sanitization, the privacy permissions, and the no-form/no-network contract. Playwright tests inject the same detector into controlled checkout-page fixtures, verify that no input getter is read, verify the Sift fragment handoff and explicit confirmation, and check the flow at mobile, tablet, and desktop viewports. These are controlled fixtures; they do not submit or complete real purchases.
