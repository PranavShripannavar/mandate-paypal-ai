# Mandate progress

Updated: 2026-10-29 (Asia/Calcutta). Historical evidence retains its original timestamps.

## Current stage

Git status: standalone Mandate repository created at this directory, with a separate PRIVATE GitHub repository at https://github.com/PranavShripannavar/mandate-paypal-ai . Owner explicitly requested small commits and the new repository. The first 49 source/test/evidence/documentation commits were pushed successfully to main; this final Git record is commit 50. Uses the authenticated owner's GitHub noreply identity, configured only in this repository. No backdating or empty commits. Final remote synchronization is verified after pushing this record. See COMMIT-PLAN.md. Existing development verification gaps below remain open.

Checkpoint 2 approved; UI and Gemini adapter implemented. Real new-ledger USD 5.00 capture VERIFIED (order 77U17875SJ4927124, authorization 80H7945724320143C, capture 5BK26228CM529704U); three real signed transaction webhooks verified SUCCESS. Actual duplicate execution returned existing capture with one remote capture POST and one SPEND entry. Keep remaining gaps OPEN: live authorize→revoke→void needs separate order exception to owner's latest no-new-orders instruction; successful Gemini policy/proposal/explanation still provider-unavailable despite one successful tiny 3.1 Flash-Lite probe; final hosted database and no-charge host confirmation pending. Native PostgreSQL explicitly approved. No new order after the owner approved the existing $5 checkout. See LIVE-VERIFICATION.md and evidence/live-ledger.json. Local app 127.0.0.1:3000; native dev DB loopback55440; temporary HTTPS webhook tunnel remains a local test aid, not final hosting.

## Completed

- Read the full owner brief. Preserve its two mandatory review checkpoints.
- Inspected the task directory: only work/ and outputs/ existed. Checked ancestor AGENTS.md locations through the user directory; none found.
- Created this dedicated outputs/Mandate directory. No unrelated projects or their secrets were accessed or modified.
- Checked only presence of PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MERCHANT_ID in this process: all absent. Did not print credential values or search other projects for secrets.
- Available runtimes: Node 24.18.0, npm 11.16.0, Git 2.55.0. Docker was not found on PATH; PostgreSQL execution remains unverified.
- Reviewed official PayPal documentation listed below. Documentation evidence is not live integration evidence.

## Architecture decisions

- Direct official PayPal REST calls for the minimal feasibility payment; sandbox base URL https://api-m.sandbox.paypal.com. No live endpoint.
- One merchant, one purchase unit, USD, intent AUTHORIZE. Use a small fixed supplies basket and explicit item_total, tax_total, shipping breakdown.
- Owner signs into the personal sandbox account on PayPal. Keep buyer passwords outside application configuration and model context.
- Planned API sequence: OAuth token; POST /v2/checkout/orders; buyer follows returned approval link; GET order; POST /v2/checkout/orders/{id}/authorize; GET authorization; POST /v2/payments/authorizations/{id}/capture with final_capture=true; GET capture and order to verify outcome.
- Verify expected merchant, USD, and exact amount using authoritative resources. Browser return alone never establishes payment success.
- Record only redacted operational evidence and reference IDs. Never record bearer tokens, Basic credentials, passwords, or full buyer personal data.
- Stop for owner review after successful checkpoint 1. Full application, ledger, AI, and deployment work remain gated.

## Verified documentation, 2026-10-27

- Sandbox personal accounts represent buyers; business accounts represent merchants. Dashboard supports creating test accounts with a selected country. US test-account suitability is a documented setup path, not verified capability of any owner account: https://developer.paypal.com/sandbox-testing/accounts
- AUTHORIZE orders and separate Payments v2 authorization capture are supported: https://developer.paypal.com/checkout/delay-capture/ and https://developer.paypal.com/api/orders/v2/orders-create and https://developer.paypal.com/api/orders/v2/orders-authorize
- Authorization guide documents 29-day authorization and a 3-day honor period. Delay-capture guide warns sandbox authorizations do not expire after 29 days; do not use waiting in sandbox to prove expiry: https://developer.paypal.com/payment-methods/auth-honor/
- Capture and void use authorization IDs, not order IDs: https://developer.paypal.com/api/payments/v2/authorizations-capture and https://developer.paypal.com/api/payments/v2/authorizations-void
- Idempotency requires per-operation unique IDs; timeout/5xx retries depend on endpoint-specific retention. Simultaneous identical requests may fail the second call. Do not infer retention from general guidance: https://developer.paypal.com/api/rest/reference/idempotency/
- Real webhook postback verification uses registered webhook ID and verification_status SUCCESS. HTTPS listener uses port 443; failed deliveries may retry 25 times over 3 days: https://developer.paypal.com/api/rest/webhooks/rest/
- Simulator events have no real transaction and cannot use postback signature verification. Simulator self-verification uses special WEBHOOK_ID: https://developer.paypal.com/api/rest/webhooks/simulator/

## Tests and live verification

- Node syntax check passed for checkpoint1.mjs; no external dependencies used.
- Real browser-to-sandbox buyer approval verified through remote APPROVED status. Real authorization POST HTTP 201; real capture POST HTTP 201; final capture GET HTTP 200, COMPLETED, USD 1.00, related order/authorization matching.
- Authoritative order reads verified configured merchant ID and one purchase unit with USD 1.00. Final order contained the same completed capture. This verifies only the minimal payment integration.
- Current client ID/secret values and access_token field checked absent from redacted evidence.
- No mocked application tests, full build, webhook verification, PostgreSQL tests, or broad account capability review has run.

## Blocking issue and required next action

RESOLVED: Owner configured all three values in .env; presence checked without printing secrets. OAuth and real create-order succeeded. Authoritative GET verified AUTHORIZE intent, exactly one purchase unit, USD 1.00, and expected merchant ID.

Current blocker: browser initially signed into seller; PayPal displayed CANNOT_PAY_SELF ("You are logging in to the account of the seller for this purchase"). Clicked Log Out in checkout, reaching the buyer login for the same order. Owner asked to sign in as personal sandbox buyer and approve USD 1.00 directly. No buyer password requested or read.

Local probe: checkpoint1.mjs, Node built-ins only. Private operation intent/state under ignored work/. Redacted API evidence under evidence/checkpoint1.json. Creates one fixed USD 1.00 AUTHORIZE order; separate inspect/authorize/capture commands. No automatic POST retries. Local exclusive lock prevents overlapping probe commands. This is a feasibility probe, not the production ledger/state machine.

Initial restricted-network OAuth fetch failed before any remote mutation; one sandbox network escalation succeeded. Create returned HTTP 200 with PAYER_ACTION_REQUIRED. Read-order returned HTTP 200. No application success asserted.

Buyer return listener is bound to 127.0.0.1:8765; its message explicitly states that the browser return is not proof of payment. Callback does not trigger authorization/capture.

Run from this directory: node checkpoint1.mjs config, serve, create, inspect, authorize, capture. Never rerun create for this existing order. Never delete work/checkpoint1-state.json to retry an ambiguous payment. If an operation has already started, inspect/reconcile it first.

Documentation caveats found on resume: https://developer.paypal.com/whats-an-order/ describes CREATED lifetime of 3 hours, while https://developer.paypal.com/sdk/orders/v2/definitions/order/ describes a default 6-hour payer redirect/approval window. Do not assume these are interchangeable or account-specific guarantees. Plan a future 10-minute application approval lifetime, separate from remote order validity. Current endpoint references document PayPal-Request-Id for create/authorize/capture/void but do not publish retention in the inspected text; retention remains unresolved. Probe does not rely on automatic retry retention.

No authorization/capture attempt has been made; buyer approval must be authoritatively confirmed first. Exact account country and remaining account capabilities/restrictions remain unverified.

## Next steps and remaining limitations

1. Obtain explicit exception for one separate $5 authorization-only sandbox checkout to verify revoke/void. Owner's current instruction prohibits creating another order; do not create one without that exception. Completed capture cannot be voided.
2. Close live Gemini draft/proposal/explanation verification using responding supported model. Model default now 3.1 Flash-Lite (MINIMAL) after successful tiny real JSON probe. Preserve prior 404/504/503 provider error records; do not relabel replay as live.
3. Complete remaining UI/scenario checks, docs and current-source final checks. Actual ledger payment, duplicate request and three real signed transaction webhooks are already evidenced.
4. Connected Vercel team Pranav is available; list_projects returned none. Connector omits plan/billing data. Owner asked for no-charge hosting confirmation and dedicated hosted PostgreSQL connection; no response yet. No unrelated projects/secrets accessed, no deployment/paid commitment.
5. Re-register webhooks and repeat live verification on final host after deployment. Temporary tunnel has no judging-availability guarantee. Keep source/evidence inside Mandate; public repository push remains unauthorized.

Framework/model/library selection is deferred until needed; no unverified versions selected. Gemini, database URL, webhook ID, and hosting credentials are not required at this stage. Full source, scenarios, deployment, judge access, and submission materials remain pending.

## Sandbox configuration replaced — 2026-10-27

Owner authorized creation of US sandbox fixtures and accepted the Developer Agreement for the new app.
- US business: sb-dqcki53471041@business.example.com
- US merchant ID: VY8VQJVTBFPV4
- US personal buyer: sb-uitkp53579163@personal.example.com
- App: Mandate US Sandbox
- Local .env now contains the new app credentials and merchant ID. No buyer password stored.
- Live sandbox OAuth authentication with the new credentials succeeded. This is not proof of a successful payment.
- Existing order 7N7760476B844150C belongs to the old merchant/app. Preserve its record. Do not use the new credentials to authorize or capture that order. Reconcile using the original app if necessary before separately creating a new US-merchant probe; never discard ambiguous old payment state.
- New checkout, buyer approval, authorization, and capture remain pending. Checkpoint 1 has not passed.

## Fresh US checkout attempt — 2026-10-27

- Owner explicitly requested a fresh checkout after fixing setup.
- Probe now uses work/checkpoint1-us-state.json and evidence/checkpoint1-us.json, retaining original files. New state is bound to merchant ID and SHA-256 client-ID fingerprint; changing credentials fails closed. No old-app authorization/capture attempted with the new credentials.
- Real OAuth and create-order succeeded. Fresh order: 9FY36155WG470314A. USD 1.00 = item_total 1.00 + tax_total 0.00 + shipping 0.00. One stationery item, one purchase unit, AUTHORIZE intent.
- Authoritative GET confirmed expected US merchant and amount; status PAYER_ACTION_REQUIRED, no authorization or capture.
- Previous browser tab was on an old localhost cancel/error page. Fresh browser tab successfully opened the new approval URL and shows buyer login. Owner asked to log in to US personal buyer and approve directly; password not read or stored.
- Starting another listener returned EADDRINUSE (existing 127.0.0.1:8765 listener). No process was terminated. Browser callback is informational only; remote GET remains payment authority.
- Next: after owner approval, run inspect, authorize, and capture separately with authoritative readback. Do not call create again for this intent.

## Checkpoint 1 completion — 2026-10-27, 18:46 IST

- Owner reported clicking Complete Purchase and a localhost timeout, explicitly instructing inspection of the existing order and no new order.
- GET confirmed APPROVED. Authorization was a separate POST to Orders authorize (HTTP 201); GET authorization confirmed CREATED, USD 1.00, linked to original order.
- Separately re-read order and authorization before capture. Capture used Payments v2 /authorizations/4LM93562092567535/capture, amount USD 1.00, final_capture true (HTTP 201).
- Confirmed capture 15P88692P4501204S COMPLETED through capture GET and original order GET, expected merchant VY8VQJVTBFPV4. Full sequence and debug IDs in CHECKPOINT-1.md.
- Observed: order status COMPLETED appeared at authorization before capture. Future state machine must never treat order COMPLETED alone as captured money.
- No new order, no repeated authorize/capture POST, no new buyer login or secret access. Full application remains gated on owner review.

## Checkpoint 2 implementation and verification — 2026-10-27

- Owner approved checkpoint 1 and requested policy engine, state machine, atomic PostgreSQL ledger, callback repair and real-DB concurrency/expiry/revocation/isolation tests. Work stayed inside Mandate.
- Added TypeScript backend: strict Zod policy/basket validation, trusted catalog calculation, immutable policy versions, bound single-use approvals, cumulative reservation accounting under mandate row locks, durable operation intents and audit trail.
- Payment gateway interface and sandbox-only REST adapter separate network calls from short database transactions. Ambiguous mutations retain reservations. Separate authorization/capture revalidation, capture/void serialization, bounded reconciliation, lease recovery and webhook verified inbox implemented. Real gateway/webhook integration through this service remains unverified.
- Added migration 001, repeatable migration runner, 12 products, two seeded owners, signed-session helpers, Docker Compose, package-lock and MIT license.
- No Docker, psql or database URL available. Installed a workspace-local PostgreSQL runtime from pinned npm package. Tests used real PostgreSQL 18.4, not an emulator. Preserved all test data under ignored work/; server stopped after each run. No other project's database/secrets accessed.
- Current packages verified through npm registry: pg 8.23.1, zod 4.6.7, tsx 4.23.15, eslint 10.13.0, typescript-eslint 8.72.1. TypeScript 7.0.2 initially worked for compilation but lint peer range rejected it; selected compatible TypeScript 6.0.3 rather than forcing dependencies.
- Final verification: 29 integration tests PASS, 6 unit tests PASS, lint PASS, typecheck PASS, backend build PASS; production dependency audit zero known vulnerabilities. Native server version/schema and ledger-invariant result saved in evidence. Docker execution NOT verified.
- Concurrency: 24 x $40 against $60 => one held, 23 blocked. 20 x $5 => twelve held, exactly $60. Fifteen duplicate proposals => one approval/reservation. Twelve duplicate capture calls => one mocked capture and one SPEND ledger entry.
- Expiry before remote execution releases once. Cancellation after order creation waits for readback. Unknown authorization/capture/create outcomes retain budget. Revocation before capture blocks it; in-flight capture race can still spend and is audited. Separate recovery Node process turns stale claims UNKNOWN without replay.
- Localhost callback replacement at 127.0.0.1:8766 loaded in in-app browser and passed HTTP test. Old 8765 occupied/unresponsive, left untouched. Probe future callback URL updated to 8766. Screenshot saved in evidence/callback-verified.png. No new order created to test callback.
- Checkpoint 2 report names remaining native-vs-Docker, live gateway, real void/webhook, HTTP auth/CSRF and scheduler/operator UI gaps. Stopped for mandatory owner review; no deployment or paid commitment.

## Continued development and existing $5 capture

- Checkpoint 2 explicitly approved. Implemented Next.js 16.4.3 / React 19.3.1 / Tailwind 4.3.3 UI, policy review, controlled catalog, basket/approval desk, timeline, operations, audit, ledger, five scenario controls, two signed demo owners, fresh-session preservation and request/resource limits.
- Native local dev database is persistent under work/dev-postgres, port55440. Local sessions expire in one hour; an expired browser session cannot mutate a captured transaction and does not change persisted payment state.
- Owner configured Gemini key privately. Added official Google GenAI SDK 2.31.0 with strict schemas, bounded timeouts/retries and global/session limits. Actual provider errors preserved: legacy model404, 3.8 timeout504 and unsupported MINIMAL400 corrected to LOW. Tiny 3.1 Flash-Lite JSON probe succeeded; full policy drafting still503 unavailable. Default now3.1 Flash-Lite; no fake AI outputs.
- Downloaded official Cloudflare 2026.10.5 binary into ignored work/; SHA256 matched official release asset. Temporary HTTPS endpoint reached appHTTP200; sandbox webhook registrationHTTP201 saved ID0WE27913CM396532E privately. This is not final hosted deployment.
- Created one ledger-backed USD5.00 order77U17875SJ4927124 after owner-authorized development. Owner explicitly approved this existing checkout and ordered no new orders. Application permission was valid when separate authorization80H7945724320143C and capture5BK26228CM529704U completed. No replacement order created.
- Native PostgreSQL ledger RESERVE500→SPEND500. Budget55.00 available,0reserved,5.00spent. CapturePOST201 and GET200 COMPLETED, linked order/auth/currency/merchant verified.
- Three REAL transaction webhook postbacks returned HTTP200 verification_statusSUCCESS: buyer approval, authorization created, capture completed. No simulator was used as evidence. Signed capture event applied to ledger. Verified inbox processing survives request timing/out-of-order arrival.
- UI Duplicate execution request returned original capture; evidence confirms exactly one real capturePOST, one captureoperation and one SPEND entry, plus idempotent replay audit.
- Current Next production build, lint, typecheck,6unit tests and HTTP→real PostgreSQL smoke checks passed. DBregression evidence is saved separately under current-postgres-tests.txt. Production dependency audit reported0known vulnerabilities when checked.
- Fixed callback redirects to configured APP_URL so localhost/127.0.0.1 aliases do not discard the correct signed cookie on return. Current Next callbacks /paypal/return and /paypal/cancel do not perform payment mutations.
- Added LIVE-VERIFICATION.md, DEPLOYMENT.md, DEMO-SCRIPT.md and HACKATHON-DESCRIPTION.md. Submission/judging dates verified from official Devpost rules; deployment availability not promised.
- New orders remain blocked by latest owner instruction. Asked explicit exception for one separate$5authorization-only revoke/void test. Asked for no-charge host confirmation and hostedPostgreSQL connection; both answers still pending. No new hosting resources, paid commitments or public repository push.

## Git repository and commit history — 2026-10-29

- Owner clarified that the goal is actual commits, not contribution-graph guarantees, and requested a separate repository for the whole project.
- Initialized only Mandate's local repository on main. Global Git identity was unset. Verified the existing authenticated GitHub account and used its public name plus ID-based noreply email locally; no identity was copied from another project's secrets/configuration.
- Created PRIVATE PranavShripannavar/mandate-paypal-ai. Initial source push succeeded and GitHub confirmed private visibility and main as default branch.
- Organized existing work into 49 scoped nonempty commits plus this final documentation record (50 total). These commits package work performed earlier in this chat; they are not a fabricated historical timeline. Intermediate assembly commits are not claimed independently runnable; the final snapshot is the tested application.
- Explicit paths were staged. Current PayPal credentials, Gemini key, local database password and session secret were scanned absent from candidate source/evidence. .env, work/, node_modules/, .next/, dist/ and TypeScript build caches remain ignored. No local database/binary/keyring files were pushed.
- No deployment, new PayPal order, paid commitment, public push or change to an unrelated project was made for this Git request.

## Owner-approved revoke/void verification — 2026-10-29

- Owner approved one separate USD5 sandbox authorization/revoke/void test. Created order 2RL11757V75590309, purchase 71b66a86-2c5d-4764-967d-aa78fb25dc4e, under a fresh Atlas Workshop mandate. The earlier completed capture remains unchanged.
- Latest authoritative reconciliation: ORDER_CREATED, reservation HELD500, no authorization or capture. Buyer login/approval remains pending in the existing PayPal tab. Do not create a replacement or extend approval silently.
- Fixed hold-before-capture persistence: migration004, backend CAPTURE guard, continuation guard and UI request/state. Applied the durable hold to this existing order before handing off checkout. Export includes hold_before_capture. This test must never capture.
- Native PostgreSQL18.4 regression: 30 tests passed, including service reconstruction with a durable hold and rejection after revocation. Typecheck and lint passed. Live revoke/void is still unverified until buyer approval and authoritative authorization/void reads succeed.
- Production webpack build passed (`npx next build --webpack`). Default Turbopack build currently fails in the CSS subprocess before connection, including outside sandbox; retain this tooling gap instead of claiming the default build passed.
- Refreshed temporary HTTPS tunnel and sandbox webhook registration; preserved both registration records. Temporary endpoint is not a final deployment. No paid commitment was made.
- Pushed commit51 for live verification tooling; additional durable-hold work is being committed separately. Initial 50 commits remain intact.
- Pushed durable-hold commit52 fb87a1d. Final existing-order check at12:47:45UTC still ORDER_CREATED with no authorization/capture. Application approval expired at12:45:59UTC (18:15:59IST). Do not ask buyer to approve this expired permission, extend it, or create another checkout without renewed owner authorization. Live revoke/void remains open.

## Authorized replacement preparation — 2026-10-29

- Owner authorized replacing only the expired uncharged void-test order if necessary, after making the old permission non-executable; no capture or live payment authorized.
- Reconciled order2RL11757V75590309 through PayPal: no authorization/capture. Disabled its application permission as EXPIRED; verified AUTHORIZE and CAPTURE both reject EXPIRED. Authoritative no-hold reconciliation released500 exactly once. Old mandate now6000available/0reserved/0spent. Added EXPIRED_TEST_RETIRED audit event. Existing capture77U17875SJ4927124 remains CAPTURED/SPENT.
- No safe reapproval-in-place API exists; immutable consumed permission is preserved. One replacement remains authorized but has NOT been created while buyer login setup is blocked.
- Browser automatic approval review rejected Developer Dashboard navigation because it redirected to production www.paypal.com, outside sandbox scope with potential real-account exposure. Did not bypass via alternate surface/API. Owner takeover is needed to obtain buyer credentials privately and perform sandbox login/approval. Do not print/store buyer password or create another checkout until owner is ready.
- Updated redacted live-ledger evidence. Typecheck and lint passed after retirement tooling change. Live authorize/revoke/void remains open.

## Single authorized replacement created — 2026-10-31

- Owner reported ready and requested the already-authorized single replacement, with personal buyer login/approval handled by owner. Restarted existing persistent native PostgreSQL and Next callback application; no database reset.
- Checked all existing orders: only prior captured77U17875SJ4927124 and retired2RL11757V75590309 existed. Reconciled retired order again before replacement; no authorization/capture, EXPIRED permission and RELEASED reservation.
- Added fixed-key preparation script. First attempt reserved locally but its audit INSERT failed on uuid/text type inference BEFORE any PayPal CREATE; corrected parameter and resumed the same reservation/key. Exactly one replacement CREATE operation/order resulted.
- Replacement order8DE04494E0613414B, purchase dcb2f9f2-53b0-49db-b5a3-e9e47e02709e, USD5.00, ORDER_CREATED,500HELD, hold_before_capture=true committed before PayPal CREATE. Permission expires2026-10-31T02:27:37.161Z (07:57:37IST). No authorization or capture yet. Same fixed-key script must never create another order or renew permission.
- Opened sandbox approval in in-app browser tab9 and asked owner to approve using US personal sandbox buyer. Password not accessed. Handoff screenshot saved. Typecheck/lint passed. Redacted live-ledger export preserves all three orders.
- After approval: reconcile this exact order, authorize only while valid with live-continue.ts hold, then revoke, verify REVOKED capture rejection, real VOID and authoritative reconciliation. Never run capture mode for this test. Do not create duplicates if callback times out.

## Real revoke/void verification passed — 2026-10-31

- Owner reported buyer approval of existing8DE04494E0613414B. Authoritative PayPal approval was reconciled and application validity rechecked before AUTHORIZE. Authorization88N0380694842573V confirmed CREATED; separate authorizePOST201 debugca52f2df688a4.
- Revoked the test mandate, attempted CAPTURE through engine and confirmed REVOKED rejection/audit before any remote capture operation. Zero capturePOSTs, zero captureoperations, no captureID.
- Real voidPOST200 returned VOIDED debugca52f2e451e97. Authoritative authorizationGET200 confirmed VOIDED debugca52f2e525d37. Independent subsequent reconciliation retained VOIDED/RELEASED.
- Ledger exactly RESERVE500→RELEASE500, no SPEND. Test mandate6000available/0reserved/0spent. Previous captured payment and expired retired test unchanged. No duplicate order or payment mutation.
- Redacted evidence/live-ledger.json and LIVE-VERIFICATION.md updated. Earlier real signed transaction-webhook verification remains valid evidence; this run does not claim a signed void webhook. Gemini task-level success, final no-charge hosting and Turbopack tooling gap remain open. No completion/deployment claimed.
