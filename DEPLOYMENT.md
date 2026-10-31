# Deployment runbook

Production is live at https://mandate-paypal-ai.vercel.app. See HOSTED-VERIFICATION.md for exact deployment ID, evidence and remaining review gaps. Owner authorized only free resources; Vercel Hobby and Neon Free were confirmed in the dashboard on 31 October 2026. No paid plan, trial or card step was accepted.

## Current target

Vercel team: Pranav / pranav-b7db / team_yxgP23j3ylo7nu1Xjh8Dhjl3. Dedicated project: mandate-paypal-ai. Dedicated database: mandate-postgres, Neon Free, linked only to this project's Production. Owner accepted Marketplace/Neon terms and explicitly approved server-only credential storage in Mandate. Never read/reuse another project's environment secrets. The private Git integration could not connect; use the CLI release path instead of assuming pushes deploy automatically.

Local verification uses native PostgreSQL 18.4. Vercel Functions require a hosted reachable PostgreSQL database; the workspace's loopback database cannot be used by a hosted deployment. Provision only a confirmed free resource or obtain approval before a paid commitment. Do not expose local PostgreSQL over the public tunnel.

## Before deployment

1. Verify .vercel/project.json still targets Mandate in pranav-b7db. Production DATABASE_URL and DATABASE_URL_UNPOOLED are managed Secret variables. Do not pull database credentials into local files. Preserve full TLS certificate verification.
2. Generate a new SESSION_SECRET (32+ random bytes) and CRON_SECRET privately. Set APP_URL to the final HTTPS domain. Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MERCHANT_ID, GEMINI_API_KEY and tested GEMINI_MODEL as sensitive server variables. Never prefix secrets NEXT_PUBLIC_. Keep sandbox-only API routing.
3. vercel.json runs npm run db:migrate then npm run build INSIDE Vercel. Migration runner prefers DATABASE_URL_UNPOOLED; pooled Neon rejects startup search_path. Migrations001–004 and seed are idempotent and preserve records. Never migrate an unrelated database.
4. Run npm ci, npm run lint, npm run typecheck, npm test, npm run test:postgres and npm run build. Export current-source evidence separately from checkpoint history. Native database tests are explicitly approved; Docker is not needed.
5. Run node --import tsx scripts/stage-deploy.ts after committing source. It checks the linked project and copies only an explicit source/config/migration allowlist to a new ignored work/deploy-* folder. Deploy FROM that folder with npx --yes vercel@65.9.0 deploy --prod --yes --scope pranav-b7db. Environment files, evidence, database data and credentials are excluded. Public repository push remains unauthorized.

## After deployment

1. Stable production sandbox webhook817679536A2566226 is registered at /api/paypal/webhook and configured as a production Secret. scripts/register-webhook.ts URL --hosted preserves the local registration and writes separate redacted evidence. Registration alone is not a transaction signature test.
2. Public HTTP, PostgreSQL, Gemini, callbacks and access-control verification pass. A new real checkout/capture/void test on this final host requires separate explicit owner approval. Do not create a replacement or payment merely to repeat local evidence.
3. Verify real signed transaction webhooks on the final deployment. Local signed transaction verification is already evidenced but does not prove the final host configuration.
4. GET /api/reconcile requires Authorization: Bearer CRON_SECRET. Daily fallback cron at03:00UTC is configured and manual authenticated invocation passed. Scheduled execution is not yet observed. Hobby timing is imprecise and once daily is insufficient for prompt ten-minute cleanup. Webhooks and owner checks work independently; do not claim a continuous worker or silently upgrade plans.
5. Keep unresolved outcomes and exhausted retries visible. App expiry blocks execution even if a remote approval URL still works. A capture already executing can race with revocation.

## Judging availability

Official event rules checked on 27 October 2026: submission closes 12 November 2026 at noon Pacific (13 November at 01:30 IST). Judging runs 1 December at 14:00 Pacific through 15 December at 08:00 Pacific (2 December at 03:30 IST through 15 December at 21:30 IST). Recheck https://paypalaihackathon.devpost.com/rules before submission.

Keep the host and database available through the full judging period, including quota, cold-start, free-tier pause/expiry, webhook URL, certificate and secret checks. A temporary laptop/tunnel is unsuitable as the sole judging host. No uninterrupted availability guarantee is made.

Official platform references: https://vercel.com/docs/cron-jobs/usage-and-pricing and https://vercel.com/docs/plans/hobby . No plan upgrade or trial was accepted.
