# Mandate

**An AI agent can propose a purchase. Your rules decide whether money moves.**

Small businesses need routine supplies, but delegating shopping to an AI should not mean delegating unlimited authority. Mandate separates an AI planner from a deterministic spending backend.

The owner describes a spending policy, reviews the structured draft and explicitly activates an immutable version. Live Gemini3.5Flash-Lite policy drafting, catalog selection and explanations grounded in backend results are verified locally through HTTP, PostgreSQL and the browser. Guided Replay provides visibly labeled fixed proposals when model quota or availability fails; provider failures are preserved honestly.

The backend trusts its own product IDs, prices, categories and recurring metadata. It calculates integer USD totals, validates the basket against the active policy and atomically reserves budget in PostgreSQL. Confirmed spending plus reservations count toward the cumulative limit. The AI never decides whether payment is allowed and never receives PayPal credentials.

PayPal sandbox Orders v2 provides standard buyer approval and separate authorization. Payments v2 captures the authorization after another validation. A real ledger-backed $5 purchase was approved, authorized and captured; its capture ID is 5BK26228CM529704U. Real buyer-approval, authorization and capture webhooks passed PayPal signature postback verification over a temporary HTTPS test endpoint. These results are preserved in redacted evidence.

The demonstration scenarios cover a valid purchase, prompt injection with a separately labeled adversarial proposal, split spending, duplicate execution and revocation before capture. Automated tests exercise real PostgreSQL concurrency and isolation while mocking PayPal. Separate real sandbox payments verify capture, idempotent replay, signed transaction webhooks and authorization→revocation→capture rejection→void. No additional capture is performed for the void test.

Try the hosted prototype at https://mandate-paypal-ai.vercel.app. It uses Vercel Hobby and dedicated Neon Free PostgreSQL. Hosted Gemini, policy decisions, callbacks and access controls are verified; the earlier signed payment evidence is retained separately. A new payment and signed transaction webhook on the final host remain open, alongside continuous reconciliation and availability checks. This is a sandbox prototype, not a production payment service.

The current prototype is built with Next.js, TypeScript, Tailwind CSS, Zod, the official Google GenAI SDK, PostgreSQL and PayPal REST APIs. The app is publicly hosted while source remains in a private repository. No customer adoption, financial savings, production readiness, eligibility or prize claims are made.
