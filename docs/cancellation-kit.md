# Cancellation Kit

Cancellation Kit builds an editable message from the evidence already visible in a Sift report. It never sends the message. It provides generic steps for other sites and links to provider help pages when the URL matches one of the five documented providers. Provider names are matched on hostname boundaries, so lookalike domains do not receive branded steps.

The provider-specific links and interface paths below were checked against official support pages on 2026-11-04. Providers can change their interfaces and policies; the linked source is authoritative and should be checked before action.

| Service | Official cancellation instructions | Refund / terms |
| --- | --- | --- |
| Netflix | https://help.netflix.com/en/node/407 | The account flow and partner billing caveat are on the same support page. |
| Spotify | https://support.spotify.com/us/article/cancel-premium/ | https://support.spotify.com/tt/article/refund-policy/ |
| Coursera | https://www.coursera.support/s/article/learner-000001135?language=en_US | https://www.coursera.support/s/article/learner-000001486?language=en_US |
| Adobe | https://helpx.adobe.com/uk/account/individual/subscriptions-and-plans/renewals-and-cancellations/cancel-adobe-subscription.html | https://helpx.adobe.com/uk/account/individual/terms-policies-and-regulations/adobe-subscription-terms.html |
| Prime Video | https://www.primevideo.com/help?nodeId=GWGDSNXVPJ93UW5V&tag=900 | https://www.primevideo.com/help?nodeId=G202095490&tr=gh |

The generated request asks the provider to assess refund eligibility under its published policy. It does not assert a right to a refund. Only visible report excerpts are quoted; locked or missing evidence is never invented. Users must replace bracketed fields, verify the current terms and payment route, and remove any paragraph that does not apply. The template is not legal advice and cannot guarantee cancellation or a refund.

## Verification

Run `node --test tests/cancellation-kit.test.mjs`. Tests cover provider matching and source URLs for all five services, lookalike-domain rejection, inclusion of actual visible evidence in the letter, omission of locked evidence, and English generic fallback.
