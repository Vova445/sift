# Analyzer evaluation set

`data/analyzer-eval.v1.json` is a versioned set of 50 short, manually labeled excerpts from official service, subscription, pricing, and support pages. The set covers streaming, software, cloud storage, education, health, gaming, creator platforms, and productivity services. Each record has a distinct HTTPS source URL and three Boolean labels: a price is visible, recurring renewal is described, and a refund condition is described.

The labels describe what is present in the saved excerpt. A `refund: true` label includes both refund eligibility and explicit limits such as non-refundable fees. An explicit statement that a subscription renews, is billed on a recurring basis, or is billed monthly is labeled as renewal evidence. Price is positive only when a currency amount appears in price or plan context.

## Running it

```sh
npm run eval:analyzer
```

The script reports true/false positives and negatives plus precision and recall for each condition. CI blocks the PR when recall for any one of the three conditions falls below 85%. Precision is reported for review; the acceptance threshold is recall, as specified by project requirement #41. The evaluation runs in the `verify` job for every pull request to `master` and every branch push.

CI uses saved excerpts rather than fetching 50 live sites. That keeps each run repeatable and prevents site redesigns, bot protections, or transient outages from changing the result. The source URL on each record allows a reviewer to revisit the originating official page. These excerpts measure the parser against labeled evidence; they do not guarantee that a source page still has the same text or establish accuracy on every full live page. Refresh the excerpts and labels when changing the analyzer or before a release, retain 50 distinct source pages, and keep the reviewed date current.

## Updating labels

Review the source page, save only a short excerpt needed to test a condition, and annotate the excerpt itself. For each change:

1. Keep the URL unique and on HTTPS.
2. Preserve the page locale and currency in the excerpt when relevant.
3. Mark `true` only when the excerpt contains evidence for that category; otherwise mark `false`.
4. Keep examples that expose false positives as well as examples that catch missed terms.
5. Run `npm run eval:analyzer` and the unit tests before merging.

The script validates the 50-record count, unique IDs and URLs, HTTPS sources, and all labels before calculating metrics.
