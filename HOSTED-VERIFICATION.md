# Hosted verification — 31 October 2026

Production: https://mandate-paypal-ai.vercel.app

| Resource | Verified configuration |
|---|---|
| Vercel | Pranav / pranav-b7db, Hobby |
| Project | mandate-paypal-ai / prj_ngYIkgZwJ6D9iwWFHaOq5BKKdQAa |
| Final deployment | dpl_seZBsjB9VSB1TEt8Ph2RzeLAQdgK, READY |
| PostgreSQL | Dedicated mandate-postgres, Neon Free; no card required |
| Database scope | Mandate Production only; optional Auth/Realtime disabled |
| Migrations | 001–004, applied inside the Vercel build using direct connection |
| Secrets | Server-only Secret variables; no database credential copied locally |
| Gemini | gemini-3.5-flash-lite |
| Sandbox webhook | 817679536A2566226 at the production /api/paypal/webhook |
| Reconciliation | Protected endpoint; daily Hobby fallback at 03:00 UTC |

No paid plan, trial, custom domain purchase or credit-card step was accepted. Source was deployed through the authenticated CLI because the connector returned HTTP403 and the private Git integration could not connect. GitHub commits remain in the private repository; pushes do not automatically redeploy.

## Results

- Public HTTP and real hosted PostgreSQL: PASS. Signed demo sessions, reviewed policy activation, valid/extra-review decisions, forbidden categories, subscriptions, merchant restriction, cumulative reservations, owner isolation, input/origin/session tampering and cancellation cleanup were exercised. No remote order was created.
- Real hosted Gemini draft, proposal and explanation: PASS. Outputs were validated and persisted; AI could not activate a policy or override the backend. Local/browser evidence is retained separately.
- Callback return and cancel: HTTP 303 to the canonical production origin. These informational routes perform no payment mutation.
- Reconciliation: missing authorization returned 401; authorized request returned 200. Automatic daily cron is configured, but an actual scheduled execution has not yet been observed.
- Unsigned transaction webhook: HTTP 400 INVALID_SIGNATURE. Registration returned 201 with PayPal debug ID f885147d64e04. This is not proof of a signed transaction webhook on the final host.
- Runtime error scan: zero records for the final deployment in the bounded five-minute verification window. An earlier release logged TLS-mode deprecation warnings; explicit verify-full preserves certificate verification and removes those warnings.
- Final source: lint and TypeScript checks pass. All 30 native PostgreSQL integration tests pass; 6 unit tests are separately recorded. Production dependency audit reported zero known runtime advisories; hosted install reported moderate development-dependency advisories.

Evidence: evidence/hosted-http-smoke.json, evidence/hosted-endpoints.json, evidence/hosted-live-ai.json, evidence/hosted-runtime-errors.jsonl and evidence/webhook-registration-hosted.json. Credentials, cookies and authorization headers are excluded.

## Review gaps kept open

1. A new buyer-approved payment and real signed transaction webhook on this final host have not been attempted. Earlier real capture, signed events, duplicate execution and revoke/void evidence remain preserved in the local PostgreSQL database and redacted reports. No new payment is authorized by deployment alone.
2. Daily Hobby cron is not timely continuous reconciliation for ten-minute permissions. Webhooks, owner checks and manual protected recovery work; expiry still blocks execution independently. Do not claim prompt automatic cleanup or uninterrupted availability.
3. Private Git auto-deployment needs repository integration access. Use the explicit staging/CLI release path until that is separately configured.
4. Free-plan limits, cold starts, database suspension and judging-period availability still require operational review. No uptime guarantee is made.
