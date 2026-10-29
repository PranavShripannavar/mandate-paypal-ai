# Checkpoint 2 — enforcement and ledger review

Status: implementation and local verification complete for review. STOPPED before deployment or full AI/UI development. Checkpoint 1 was explicitly approved by the owner on 27 October 2026.

## Verified results

- **29 integration tests passed against real PostgreSQL 18.4**, including concurrency, uniqueness constraints, ledger transactions, owner isolation, expiry/revocation races, ambiguous remote outcomes and recovery from a separate Node process.
- **6 unit tests passed** for policy validation and signed sessions.
- Lint, TypeScript checking and backend production compilation passed. This is a TypeScript backend build, not a Next.js frontend build; the frontend has not been created yet.
- Production dependency audit reported zero known vulnerabilities at verification time.
- Repaired callback loaded in the in-app browser at **http://127.0.0.1:8766/return**; screenshot and HTTP integration test verify it responds and does not claim payment success. No new PayPal order/payment was created for this callback check.

**Environment distinction:** real PostgreSQL ran natively in an isolated workspace directory using the pinned embedded-postgres runtime. Docker was unavailable. Docker Compose is supplied but was not executed, so the original Docker/Testcontainers execution path remains unverified. This is not an in-memory database or a database mock. PayPal and webhook verification were mocked for the automated tests; no new real void, webhook, or ledger-backed sandbox capture is claimed.

## Reservation and release semantics

All service transactions lock the owning mandate first and purchase second. Budget checks and reservation/ledger writes commit in the same PostgreSQL transaction. No database transaction spans a PayPal call. Database uniqueness protects logical request IDs, approvals, remote payment IDs, operation IDs and ledger transitions. Policies cannot be updated/deleted in place.

| Situation | Budget transition | Evidence/behavior |
|---|---|---|
| Allowed application approval | available → HELD | Atomic reserve and RESERVE ledger entry |
| Blocked proposal | none | No purchase, reservation or gateway call |
| Same logical request repeated | none beyond original | Existing purchase/approval returned; replay audited |
| Expiry/cancel before remote operation | HELD → RELEASED | Same lock serializes disabling vs operation claim |
| Expiry/cancel after order creation | retain HELD | Release only after no hold is confirmed and no uncertain operation remains |
| Authorization exists | retain HELD | Requires authoritative void/expiry or capture outcome |
| Capture confirmed | HELD → SPENT | Amount/currency/merchant association checked; one SPEND entry |
| Void/authorization expiry confirmed | HELD → RELEASED | One RELEASE entry |
| Timeout or uncertain authorization/capture | retain HELD | Empty remote order does not prove a late mutation cannot succeed |
| Lost create response without order ID | retain HELD | No automatic recreation; operator intervention needed |

Refunds do not replenish budget. This checkpoint has no refund API.

```mermaid
sequenceDiagram
  participant Owner
  participant Engine
  participant DB as PostgreSQL
  participant Gateway as PayPal adapter
  Owner->>Engine: Approve basket
  Engine->>DB: Lock mandate; validate; reserve; bind approval; commit
  Engine->>DB: Revalidate; persist operation claim; commit
  Engine->>Gateway: Remote operation outside database transaction
  Gateway-->>Engine: Authoritative result or uncertain outcome
  Engine->>DB: Lock mandate/purchase; persist outcome and ledger; commit
```

## Concurrency and idempotency evidence

- 24 simultaneous $40 proposals against a $60 mandate: **1 reserved, 23 blocked**, reserved balance $40, available $20.
- 20 simultaneous $5 proposals against $60: **12 reserved**, exactly $60 held, no overdraw.
- 15 concurrent copies of the same logical proposal: **one purchase/approval/reservation**. Reusing the key for a different basket is rejected.
- 12 concurrent capture requests for the same purchase: **one mocked gateway capture**, one SPEND entry, $40 spent and $0 reserved.
- Unique capture IDs and ledger entries enforced by actual PostgreSQL constraints; negative reserved balances rejected.
- Final ledger sums matched mandate counters across every test fixture.

Stable per-operation request IDs and payload hashes are persisted before network execution. Existing attempts return current status without another mutation. Unknown outcomes are reconciled, never blindly retried. This conservative approach does not rely on an unverified PayPal idempotency-retention duration.

## Expiry, revocation and recovery

- Late buyer approval cannot authorize expired application permission.
- Expiry during in-flight authorization retains the reservation; after authorization is confirmed, capture is blocked and void can resolve the hold.
- Revocation before capture blocks capture. The sweep invokes the void interface for a disabled authorization; this is tested with a mocked provider, not a new live sandbox void.
- Capture and void cannot execute concurrently locally.
- Revocation while capture is already executing may still result in capture; the test records the confirmed payment as spent and audits the race. No reversal guarantee is made.
- Expired operation leases become UNKNOWN. A separate Node recovery process read the persisted PostgreSQL state; it did not replay the mutation.
- Lost capture response was resolved through authoritative-read interface reconciliation after service reconstruction, spending exactly once.
- Reconciliation retries are bounded to eight per purchase with exponential backoff capped at five minutes. Exhausted cases remain visibly unresolved in database/audit records; interface presentation and scheduling come later.

## Owner isolation, policy enforcement and webhooks

- Cross-owner reads, reserves, policy replacement, revocation, execution, disabling and reconciliation were rejected against PostgreSQL. Signed sessions reject tampering and expiry.
- Trusted catalog facts are reloaded before execution; changed price/basket, forbidden categories/subscriptions/merchant, expired policy, period mismatch and currency/price input tampering cannot produce an allowed payment call.
- Extra human review cannot override hard limits. Policy replacement creates an immutable version and disables outstanding approvals; remote authorizations retain budget pending resolution.
- Invalid or temporarily unverifiable webhooks do not enter the trusted inbox. Duplicate event IDs are deduplicated. Out-of-order payloads cannot regress confirmed capture; unknown references are retained for diagnosis. Events only trigger authoritative reads, never directly set payment success.
- Audit records distinguish owner actions from worker/system actions and include idempotency and reconciliation events. The audit trail is not claimed tamper-proof.

## Evidence

- [PostgreSQL test output](evidence/checkpoint2-postgres-tests.txt)
- [Database version, schema and ledger invariant summary](evidence/checkpoint2-db-summary.json)
- [Verification manifest](evidence/checkpoint2-checks.json)
- [Callback browser screenshot](evidence/callback-verified.png)
- [Checkpoint 1 real sandbox payment evidence](CHECKPOINT-1.md)

No current PayPal client ID or secret appears in checkpoint 2 evidence. Runtime data and local environment files are ignored. The real checkpoint 1 records are preserved separately; they were not fabricated into this new test ledger.

## Remaining risks and required next work

1. Docker Compose execution is unverified on this host. Review whether native real-PostgreSQL evidence is acceptable for this checkpoint; rerun Compose in a Docker-capable environment before submission.
2. The new PayPalGateway compiles but has not been live-tested through this ledger service. The only live payment verification remains checkpoint 1's probe. Real revocation/void, duplicate-execution sandbox evidence and signed transaction webhooks require later browser/live tests.
3. No public HTTP owner/payment API is exposed yet. Future routes must derive owners from verified sessions, protect CSRF/origin boundaries, and never allow model output to supply owner/review authority. Current ownership tests exercise the backend service interfaces.
4. No public HTTPS webhook endpoint, tunnel, registered webhook ID or continuous reconciliation scheduler is configured yet. The signature verification helper is implemented, not live-verified.
5. A lost create response without a reference requires operator recovery; no automated lookup or re-creation is attempted. Pending items beyond the sweep batch limit require a fair scheduling strategy before public use. Operator tooling/unresolved-state UI remains pending.
6. The old port 8765 remains occupied/unresponsive; it was not force-stopped. The verified replacement is 8766 and future checkout configuration was updated. The earlier completed order's return URL remains historical.
7. The new interface, real Gemini planning, judge access, session/resource limits, deployment, complete live demonstration scenarios and submission materials remain outside this checkpoint. No hosting account or paid commitment was used.

## Owner review

Review the evidence and limitations, especially native PostgreSQL vs Docker and the pending ledger-to-PayPal live integration. Approve checkpoint 2 to proceed with deployment planning, public webhook setup and the full AI/product interface. No deployment has occurred.
