# Live verification — 27 October 2026

## New ledger-backed payment: VERIFIED

The owner approved the existing USD 5.00 sandbox checkout. Application permission was still valid when the engine separately authorized and captured. No replacement/new order was created during completion.

| Reference | Value |
|---|---|
| Local purchase | 51e989b8-0eac-41fb-ae99-7f408cc717cd |
| Mandate | 099ad25d-0057-46d4-8e8c-2e2b5453e734 |
| PayPal order | 77U17875SJ4927124 |
| Authorization | 80H7945724320143C |
| Capture | 5BK26228CM529704U |
| Capture status | COMPLETED |
| Amount | USD 5.00 |
| Reservation | SPENT |

Real PostgreSQL ledger: RESERVE 500 cents at 14:21:11 UTC (19:51:11 IST); SPEND 500 cents at 14:25:58 UTC (19:55:58 IST). Post-capture budget: 500 cents spent, 0 reserved, 5500 available.

Capture POST returned HTTP 201, PayPal debug ID f454626c18538. Capture GET returned HTTP 200, COMPLETED and USD 5.00, debug ID f8081577b5801. The gateway verified original order merchant VY8VQJVTBFPV4, amount/currency, and the authorization/capture's related IDs before ledger confirmation. Order COMPLETED alone was not used as proof of capture.

## Signed transaction webhooks: VERIFIED LOCALLY OVER HTTPS

Webhook ID: 0WE27913CM396532E. Registration returned HTTP 201, debug ID f758769bcafd6. Temporary HTTPS endpoint:

https://answered-oem-obtained-storage.trycloudflare.com/api/paypal/webhook

These were real transaction events, not simulator events:

| Event | Event ID | Verification response | Verification debug ID |
|---|---|---|---|
| CHECKOUT.ORDER.APPROVED | WH-0L659544YR607263V-9YD87345U2851574K | HTTP 200 / SUCCESS | f11850151e9a8 |
| PAYMENT.AUTHORIZATION.CREATED | WH-5MM84229A31730046-9V228193YB3175545 | HTTP 200 / SUCCESS | f98121607afdb |
| PAYMENT.CAPTURE.COMPLETED | WH-42A16138FB7683412-83P32875DX872842P | HTTP 200 / SUCCESS | f8011019a1f72 |

The authorization and capture events reached APPLIED. The verified buyer-approval event was initially queued; a subsequent sweep processes persisted inbox entries. Signature success proves the received message verification, not hosted uptime. The temporary tunnel has no uptime guarantee and is not the final deployment.

## Real authorize → revoke → blocked capture → void: VERIFIED 2026-10-31

Owner approved the single replacement checkout8DE04494E0613414B for USD5.00. Application permission was valid when the backend authorized it. Purchase dcb2f9f2-53b0-49db-b5a3-e9e47e02709e had a durable capture hold before order creation.

| Evidence | Result |
|---|---|
| Authorization | 88N0380694842573V; POST201, debug ca52f2df688a4; authoritative GET CREATED |
| Mandate revocation | Persisted before attempted capture |
| Capture attempt | Locally rejected REVOKED; audit CAPTURE_BLOCKED_AFTER_REVOCATION |
| Remote capture POSTs / capture operations | 0 / 0 |
| Void | POST200 VOIDED, debug ca52f2e451e97 |
| Authoritative void readback | GET200 VOIDED, debug ca52f2e525d37 |
| Ledger | RESERVE500 → RELEASE500; no SPEND |
| Final state | VOIDED, RELEASED, no capture ID |
| Test mandate budget | USD60 available,0reserved,0spent |

The expired preceding test order2RL11757V75590309 remains disabled and RELEASED. Earlier capture5BK26228CM529704U remains CAPTURED/SPENT. No new order or capture was created after buyer approval. The signed transaction-webhook evidence above belongs to the earlier captured transaction; no signed void webhook is claimed for this run.

## Still open

- Successful live Gemini draft/proposal/explanation. Key is configured and model listing works. Gemini 2.5 Flash returned 404 for new users; 3.8 Flash returned bounded 504 timeouts. Unsupported MINIMAL was corrected to documented LOW. A tiny 3.1 Flash-Lite probe returned 503 high demand. Failed calls are recorded honestly; guided proposals are visibly labeled replay.
- Subsequent tiny 3.1 Flash-Lite JSON probe returned ready:true / finishReason STOP. Default switched to that responding stable model, but full policy drafting still returned503; task-level AI verification remains OPEN. Adapter retries503/504 at most once and charges both attempts against server-side usage counters.
- Final hosted deployment and hosted PostgreSQL. Connected Vercel team Pranav exists, but connector omits billing plan and has no projects. Asked owner to confirm no-charge hosting and configure a dedicated hosted PostgreSQL connection. No paid commitment or deployment created.

Raw redacted API/ledger/audit/signature evidence: evidence/live-ledger.json. Export checks that the current PayPal credentials, Gemini key and local database/session secrets are absent before writing it.
