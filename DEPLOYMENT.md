# Deployment preparation

Do not treat this file as evidence of deployment. No final hosting deployment has been created yet. Owner authorized deployment without charges; host plan and dedicated hosted database are unresolved.

## Intended target

Connected Vercel team: Pranav / pranav-b7db / team_yxgP23j3ylo7nu1Xjh8Dhjl3. The connector returned no existing projects and omits billing-plan data. Owner was asked to confirm a no-charge Hobby account and a dedicated hosted PostgreSQL URL. Never read/reuse another project's environment secrets.

Local verification uses native PostgreSQL 18.4. Vercel Functions require a hosted reachable PostgreSQL database; the workspace's loopback database cannot be used by a hosted deployment. Provision only a confirmed free resource or obtain approval before a paid commitment. Do not expose local PostgreSQL over the public tunnel.

## Before deployment

1. Confirm the no-charge host/team and configure a purpose-created hosted DATABASE_URL privately. Prefer a nearby database region and pool-compatible connection. Do not weaken TLS verification.
2. Generate a new SESSION_SECRET (32+ random bytes) and CRON_SECRET privately. Set APP_URL to the final HTTPS domain. Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MERCHANT_ID, GEMINI_API_KEY and tested GEMINI_MODEL as sensitive server variables. Never prefix secrets NEXT_PUBLIC_. Keep sandbox-only API routing.
3. Apply migrations 001–003 and seed with npm run db:migrate against that dedicated database. This preserves old records and creates the demo catalog/owners. Never migrate an unrelated database.
4. Run npm ci, npm run lint, npm run typecheck, npm test, npm run test:postgres and npm run build. Export current-source evidence separately from checkpoint history. Native database tests are explicitly approved; Docker is not needed.
5. Upload an explicit allowlist of source/config/migrations/package-lock only. Exclude .env*, work/, node_modules/, .next/, dist/, local credentials, private database data and operational logs. Public repository push remains unauthorized.

## After deployment

1. Register the stable public /api/paypal/webhook URL on the sandbox REST app and configure the returned webhook ID. The temporary trycloudflare URL is a local verification aid, not a maintained deployment.
2. Verify standard buyer approval and callbacks on the deployed domain, a real ledger-backed capture, duplicate execution, and real authorization/revocation/void. Save redacted IDs and responses.
3. Verify real signed transaction webhooks on the final deployment. Local signed transaction verification is already evidenced but does not prove the final host configuration.
4. Provide continuous/bounded reconciliation using an approved free scheduler or host capability. GET /api/reconcile requires Authorization: Bearer CRON_SECRET. Vercel Hobby cron is limited to once daily and has imprecise timing; that alone is insufficient for prompt cleanup of a ten-minute application approval. Public webhooks and owner-triggered status checks work independently, but do not claim a continuously scheduled worker until configured and observed.
5. Keep unresolved outcomes and exhausted retries visible. App expiry blocks execution even if a remote approval URL still works. A capture already executing can race with revocation.

## Judging availability

Official event rules checked on 27 October 2026: submission closes 12 November 2026 at noon Pacific (13 November at 01:30 IST). Judging runs 1 December at 14:00 Pacific through 15 December at 08:00 Pacific (2 December at 03:30 IST through 15 December at 21:30 IST). Recheck https://paypalaihackathon.devpost.com/rules before submission.

Keep the host and database available through the full judging period, including quota, cold-start, free-tier pause/expiry, webhook URL, certificate and secret checks. A temporary laptop/tunnel is unsuitable as the sole judging host. No uninterrupted availability guarantee is made.

Official platform references: https://vercel.com/docs/cron-jobs/usage-and-pricing and https://vercel.com/docs/plans/hobby . No plan upgrade or trial was accepted.
