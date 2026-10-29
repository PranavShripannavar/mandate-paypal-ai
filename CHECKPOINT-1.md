# Checkpoint 1 — real sandbox payment verified

Verified 27 October 2026, 18:46:51 IST (13:16:51 UTC). STOPPED for owner review before full application development.

The owner completed real PayPal sandbox buyer approval. The backend separately authorized and captured USD 1.00 on the existing order. No additional order was created in this completion attempt. Payment success is established by PayPal API responses and subsequent GETs, not the browser callback.

| Reference | Value |
|---|---|
| Order | 9FY36155WG470314A |
| Authorization | 4LM93562092567535 |
| Capture | 15P88692P4501204S |
| Expected sandbox merchant | VY8VQJVTBFPV4 |
| Amount | USD 1.00 |
| Final capture status | COMPLETED |

## API sequence and evidence

All payment API calls used https://api-m.sandbox.paypal.com. OAuth bearer tokens were obtained server-side and excluded from evidence.

| Operation | HTTP | Confirmed response | PayPal debug ID |
|---|---|---|---|
| POST /v2/checkout/orders (earlier fresh checkout) | 200 | PAYER_ACTION_REQUIRED; order 9FY36155WG470314A | ca511da155c17 |
| GET /v2/checkout/orders/9FY36155WG470314A | 200 | APPROVED, after owner clicked Complete Purchase | f3344044ee7f8 |
| GET same order immediately before authorization | 200 | APPROVED; amount and merchant verified | f9943646c79e5 |
| POST /v2/checkout/orders/9FY36155WG470314A/authorize | 201 | Order COMPLETED; authorization 4LM93562092567535 | f450065e38966 |
| GET /v2/payments/authorizations/4LM93562092567535 | 200 | CREATED; USD 1.00; related order matches | f7903462bd6b8 |
| GET order and authorization immediately before capture | 200 each | Expected merchant/order and USD 1.00; authorization CREATED | f846126cecc33 / f3067604d36b1 |
| POST /v2/payments/authorizations/4LM93562092567535/capture | 201 | Capture 15P88692P4501204S COMPLETED | f928822720dfa |
| GET original order after capture | 200 | Contains this COMPLETED capture and expected merchant | f8011715db407 |
| GET /v2/payments/captures/15P88692P4501204S | 200 | COMPLETED, USD 1.00, related order and authorization match | f387671ab950c |

Important observed behavior: the AUTHORIZE order became COMPLETED upon successful authorization, before capture. Order COMPLETED alone is insufficient evidence of captured funds.

Redacted request/response records are in [evidence/checkpoint1-us.json](evidence/checkpoint1-us.json), including timestamps, HTTP statuses, operation IDs, PayPal debug IDs, and reference IDs. Buyer identifying data, credentials, and tokens are omitted/redacted. Verified that current client ID and secret values are absent, and no access_token field is present.

Create request used one physical stationery item and one purchase unit with AUTHORIZE intent. Explicit breakdown: item_total USD 1.00 + tax_total USD 0.00 + shipping USD 0.00 = total USD 1.00. Payee merchant_id was configured explicitly and verified on authoritative order readbacks.

Capture request:

```json
{
  "amount": { "currency_code": "USD", "value": "1.00" },
  "final_capture": true
}
```

Distinct persisted PayPal-Request-Id values:

- Create: 0c280d18-88ff-4a57-bf86-bdbd91801139
- Authorize: 832fbc3a-2db8-4c3b-9452-35ebebf5d756
- Capture: f05ef203-018e-44ff-bfdd-2d3d49dfc752

One create, one authorize, and one capture POST were performed for this US checkout. No payment retry test was performed. These observations do not prove the future application's duplicate execution guarantees.

## Limitations and unresolved issues

- Local buyer return at 127.0.0.1:8765 timed out. Buyer approval still succeeded remotely; GET confirmed APPROVED. The callback listener needs repair before the finished demo. Callback never triggered payment execution.
- Capture endpoint did not itself supply the merchant ID in the inspected response. Merchant verification used the authoritative original order containing that capture; capture GET independently linked the capture to the same order and authorization and confirmed USD 1.00.
- This proves basic approval/authorization/full capture capability only for the configured sandbox app and merchant. It does not establish production eligibility or all account restrictions/capabilities. No account capability error occurred in this successful flow.
- Real voids, real signed webhooks, polling workers/restart recovery, concurrency, owner isolation, ledger correctness, policy enforcement, and duplicate execution are not yet implemented/verified. Current probe uses local files and an exclusive command lock, not PostgreSQL.
- Endpoint-specific idempotency retention remains unconfirmed; no automatic POST retries are implemented. Official order-lifetime documentation differences are recorded in PROGRESS.md.
- Previous old-app order 7N7760476B844150C remains preserved. Its browser cancellation did not establish a remote terminal state. New credentials were not used to mutate it; no authorization/capture was initiated by this probe for that old order.
- No full application lint/typecheck/build or mocked integration suite exists yet. Node syntax checking passed. No deployment or public repository push was performed.

## Required owner review

Review this report and redacted evidence. Approve checkpoint 1 to proceed to policy enforcement, the transaction state machine, and the atomic PostgreSQL budget ledger. Checkpoint 2 will require real PostgreSQL integration/concurrency tests and another owner review. No full application work has started.
