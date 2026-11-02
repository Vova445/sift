# SSRF protection for the URL analyzer

The analyzer validates the submitted URL and every redirect, accepts only HTTP(S) on ports 80/443, resolves A and AAAA records twice, rejects private and special-use addresses, accepts HTML only, caps the response body at 2 MiB, and shares one 8-second deadline across DNS, redirects, and body reads. The policy regression suite is `npm run test:ssrf`.

## DNS rebinding limitation

The current Cloudflare Workers Fetch API performs its own DNS lookup when `fetch(url)` runs. The Worker can inspect DNS answers first, but it cannot pin an arbitrary external URL to one of those addresses. Cloudflare documents that `cf.resolveOverride` only applies when both hosts belong to the Worker's zone, and Workers subrequests cannot fetch an IP literal directly:

- https://developers.cloudflare.com/workers/runtime-apis/request/#the-cf-property
- https://developers.cloudflare.com/workers/platform/known-issues/#fetch-to-ip-addresses

Therefore the preflight checks and repeated lookup reject private DNS answers and common rebinding patterns, but they do **not** prove strict DNS-rebinding resistance against an attacker who changes the DNS answer after validation. Do not mark the “DNS rebinding closed” acceptance criterion complete for this deployment.

To meet that criterion, route target fetches through a controlled egress service that resolves the hostname, rejects every non-public address, connects to the selected IP without resolving again, and preserves the original TLS SNI/Host while verifying the certificate. The current Workers-only setup has no such pinned egress binding configured.
