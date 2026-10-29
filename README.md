# Mandate — run the current prototype

“An AI agent can propose a purchase. Your rules decide whether money moves.”

## Current evidence

The Next.js interface, Gemini adapter, signed demo sessions, deterministic policy engine, atomic PostgreSQL ledger, audit trail and five scenario controls are implemented. Real ledger-backed buyer approval → authorization → capture is verified for USD 5.00. Real transaction webhook signatures and duplicate execution are verified. See LIVE-VERIFICATION.md and evidence/live-ledger.json.

This is still under development. Real authorize → revoke → void, successful Gemini policy/proposal/explanation, and final hosted deployment remain open. No simulated payment success is used. Checkpoint history is in CHECKPOINT-1.md, CHECKPOINT-2.md and PROGRESS.md.

## 60-second walkthrough

1. Run npm ci, then npm run dev from this Mandate directory with Node 24 LTS. Open http://127.0.0.1:3000.
2. Choose Northstar Studio or Atlas Workshop. Review the seeded guided draft: $60 per fixed period, $40 per order, approved merchant/categories, no subscriptions, review above $30. Activate only after reviewing.
3. Select Guided to propose without model quota, or Live Gemini for actual provider calls. Select/evaluate products. Forbidden proposals are blocked before payment calls.
4. Approve a compliant basket. Budget becomes reserved before a real PayPal sandbox order exists. Open standard sandbox buyer approval using the purpose-created personal account.
5. Return and choose Verify buyer approval & complete. The backend revalidates, authorizes, revalidates separately and captures. Browser return alone never establishes success.
6. Inspect budget, operation IDs, ledger, real webhook IDs and audit trail. Use the scenario launcher. Fresh demo sessions preserve every previous transaction and unresolved reservation.

## Local setup

All real provider values belong in the ignored .env. .env.example contains placeholders. Never paste keys into chat, publish secrets or copy another project's credentials.

Required for local payment: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_MERCHANT_ID from the same purpose-created sandbox business app. The buyer uses a separate personal sandbox account and enters its password directly on PayPal. No buyer password is stored by Mandate. US sandbox fixtures were configured for this USD demo; real account country details are never modified.

npm run dev starts real native PostgreSQL on loopback port 55440, migrates/seeds, and starts Next.js at port 3000. Its local database password and session secret are generated into ignored work/dev-config.json. Data persists under work/dev-postgres. No Docker is required or used. Keep the dev server running; Ctrl+C stops its database without deleting data.

For local background reconciliation in a second terminal:

```powershell
node --import tsx scripts/local-worker.ts
```

The worker performs bounded 20-second sweeps and retains ambiguous outcomes. Expired leases never authorize a retry of a possibly successful mutation. A continuously running deployed scheduler remains to be configured.

## Gemini

Set GEMINI_API_KEY privately. Default tested responding model: gemini-3.1-flash-lite. A tiny real JSON probe succeeded, but full drafting/proposal/explanation verification is still open because provider requests returned 503/504. Historical 2.5 Flash 404 is preserved. Never claim those failures are a successful model response. Override GEMINI_MODEL only with a currently supported model and matching thinking setting.

The adapter uses strict schemas, 4,000-character input limits, bounded 2,500 output tokens, 45-second request timeouts, at most one 503/504 retry, twelve attempts per session and one hundred globally per day. Guided Replay is explicit and never simulates a payment.

## Webhooks and callbacks

Current temporary HTTPS webhook verification URL and registration are in evidence/webhook-registration.json. The official cloudflared binary was downloaded into ignored work/ and matched its GitHub release SHA256. This tunnel is for local verification, has no uptime guarantee, and is not final hosting.

Register a new stable URL with:

```powershell
node --import tsx scripts/register-webhook.ts https://YOUR-HOST/api/paypal/webhook
```

The script stores PAYPAL_WEBHOOK_ID privately and writes redacted registration evidence. It reuses an existing matching registration rather than duplicating it. Real events are verified with PayPal's postback mechanism; only SUCCESS enters the trusted inbox. Simulator-only events cannot establish this verification.

APP_URL controls return/cancel URLs and allowed write origin. Use the same hostname consistently (127.0.0.1 locally); cookies are scoped by hostname. New /paypal/return callbacks redirect to configured APP_URL and never trigger payment execution. The old standalone port 8765 was occupied; its verified replacement is npm run callback on port 8766. That legacy probe callback is distinct from the current Next.js application's callback.

## Tests

```powershell
npm run lint
npm run typecheck
npm test
npm run test:postgres
npm run build
# With the dev server running; creates test-only demo sessions, no PayPal calls:
node --import tsx scripts/http-smoke.ts
```

Real PostgreSQL integration tests use a separate native cluster and unique schemas; PayPal is mocked only in that automated suite. Preserve and distinguish these tests from real sandbox evidence. Docker Compose is provided as an optional unverified alternative; the owner explicitly approved native PostgreSQL instead. For an existing dedicated database, set DATABASE_URL, run npm run db:migrate, then npm run test:integration. Migrations 001–003 preserve historical records. Never point these tools at an unrelated database.

## Trust boundaries and limitations

The mandate is an application-level control, not a PayPal-native delegated wallet. Only the authenticated owner activates immutable policies and performs extra review. The AI receives no credentials and cannot activate policies, override backend blocks, or call payment tools. Prices, merchant IDs, categories and recurring facts come from the server catalog. Money uses integer USD cents.

Available budget is the fixed-period total minus confirmed spending and held reservations. Blocked proposals create no hold. Reservations become spent only after authoritative capture confirmation. Cancel/expiry does not imply remote cancellation; uncertain remote outcomes retain budget. Refunds do not replenish mandate budget. A remote capture already executing can race with revocation and must be recorded honestly.

Signed sessions are purpose-created seeded demo access, not production signup/authentication. Routes check session ownership and current session mandate, write origin, strict input and server usage limits. The audit trail is not claimed tamper-proof. Public deployment still needs reviewed rate limits, hosting/database configuration, stable webhooks and scheduling. Deployment protection must permit PayPal's signed webhook POST while private administrative routes remain protected.

## Troubleshooting and delivery

- PayPal CANNOT_PAY_SELF: use the separate personal sandbox buyer, not the merchant login.
- No authoritative APPROVED status: do not authorize. A callback is insufficient.
- Application expiry: capture is blocked even if PayPal still accepts its approval URL. Reconcile/void as appropriate; do not extend permission silently.
- Unknown order/capture timeout: retain reservation, inspect operations and reconcile. Never delete state to replay payment.
- Invalid webhook signature: check environment/app/webhook ID. Temporary verification failure must retry; do not mark verified. Real signed events, not simulator postback, are the evidence.
- Gemini 503/504 or exhausted quota: use visibly labeled Guided Replay and retain actual failure status.
- Database port collision: stop only the verified Mandate-owned instance or choose a dedicated loopback port; never terminate unrelated services or wipe data.

See DEPLOYMENT.md for no-charge hosting prerequisites and judging dates, DEMO-SCRIPT.md for the under-three-minute recording plan, HACKATHON-DESCRIPTION.md for submission text, and LICENSE for MIT terms. No public push, paid commitment or final hosted deployment has been performed.
