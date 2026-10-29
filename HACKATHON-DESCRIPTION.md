# Mandate

**An AI agent can propose a purchase. Your rules decide whether money moves.**

Small businesses need routine supplies, but delegating shopping to an AI should not mean delegating unlimited authority. Mandate separates an AI planner from a deterministic spending backend.

The owner describes a spending policy, reviews the structured draft and explicitly activates an immutable version. Gemini is integrated for policy drafting, catalog selection and explanations grounded in backend results. Guided Replay provides visibly labeled fixed proposals when model quota or availability fails. Successful live Gemini calls are still under verification; provider failures are not represented as model output.

The backend trusts its own product IDs, prices, categories and recurring metadata. It calculates integer USD totals, validates the basket against the active policy and atomically reserves budget in PostgreSQL. Confirmed spending plus reservations count toward the cumulative limit. The AI never decides whether payment is allowed and never receives PayPal credentials.

PayPal sandbox Orders v2 provides standard buyer approval and separate authorization. Payments v2 captures the authorization after another validation. A real ledger-backed $5 purchase was approved, authorized and captured; its capture ID is 5BK26228CM529704U. Real buyer-approval, authorization and capture webhooks passed PayPal signature postback verification over a temporary HTTPS test endpoint. These results are preserved in redacted evidence.

The demonstration scenarios cover a valid purchase, prompt injection with a separately labeled adversarial proposal, split spending, duplicate execution and revocation before capture. Automated tests exercise real PostgreSQL concurrency and isolation while mocking PayPal. The real revocation/void demonstration remains pending separate owner-approved sandbox checkout; tests are not substituted for live evidence.

The current prototype is built with Next.js, TypeScript, Tailwind CSS, Zod, the official Google GenAI SDK, PostgreSQL and PayPal REST APIs. Deployment preparation is complete but a final hosted database/host is not yet configured. No customer adoption, financial savings, production readiness, eligibility or prize claims are made.
