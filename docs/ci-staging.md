# CI, staging, and deployment

## GitHub Actions

`.github/workflows/ci.yml` runs on pull requests to `master`, pushes to `master`, and manual dispatch. The required `CI / verify` job runs lint, unit tests, an isolated local D1 export/restore drill, a production build, and a Wrangler deployment dry run. Pull requests from this repository also migrate and deploy the `preview` Worker environment after `verify` passes. Fork pull requests never receive Cloudflare secrets and do not deploy.

## Staging D1

- Cloudflare D1 name: `sift-staging`
- D1 ID: `bf805e2d-ea71-4ca0-a653-b60e074c5ad3`
- Worker environment: `preview` → `sift-app-preview`
- Binding: `DB`
- Region hint: EEUR

The staging workflow applies tracked migrations before every preview deploy. It uses a database separate from the production binding. The preview has no production Cron, R2, Workflow, AI, or edge-rate-limit binding; WayForPay is explicitly set to sandbox and AI translation is off.

## Secrets

GitHub repository secrets required by preview deployment:

- `CLOUDFLARE_API_TOKEN` — scope to the account and only the permissions needed for Workers deploy and D1 migrations.
- `CLOUDFLARE_ACCOUNT_ID` — the target Cloudflare account.

These secrets are already present in this repository. Never place token values in Wrangler `vars`, workflow YAML, or source files. Runtime secrets for a Worker environment must be stored with Wrangler, for example:

```powershell
npx wrangler secret put RESEND_API_KEY --env preview
npx wrangler secret put TURNSTILE_SECRET_KEY --env preview
```

Use test-only credentials for preview and do not add live payment credentials to the staging environment.

## Master merge gate

The repository's `master` branch should require the `CI / verify` status check, require pull requests, require the branch to be up to date, and enforce the rule for administrators. This prevents direct pushes and blocks merges until the CI job passes. Branch protection is configured in GitHub repository settings/API, not in a GitHub Actions file.

## Preview

After a same-repository pull request passes `CI / verify`, Actions applies staging migrations and deploys `https://sift-app-preview.sift-vova445.workers.dev`. This is one shared staging Worker and D1, so concurrent previews are serialized. It is not a production deployment.
