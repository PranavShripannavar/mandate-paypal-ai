CREATE TABLE owners (id uuid PRIMARY KEY, label text NOT NULL);
CREATE TABLE mandates (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id), current_version int NOT NULL DEFAULT 1,
 revoked_at timestamptz, reserved_cents int NOT NULL DEFAULT 0 CHECK(reserved_cents>=0),
 spent_cents int NOT NULL DEFAULT 0 CHECK(spent_cents>=0), UNIQUE(id,owner_id)
);
CREATE TABLE policies (
 mandate_id uuid NOT NULL REFERENCES mandates(id), version int NOT NULL, body jsonb NOT NULL,
 activated_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(mandate_id,version)
);
CREATE FUNCTION immutable_policy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Policies are immutable'; END $$;
CREATE TRIGGER immutable_policy BEFORE UPDATE OR DELETE ON policies FOR EACH ROW EXECUTE FUNCTION immutable_policy();
CREATE TABLE products (
 id text PRIMARY KEY, merchant_id text NOT NULL, category text NOT NULL, recurring boolean NOT NULL,
 price_cents int NOT NULL CHECK(price_cents>0), currency text NOT NULL, description text NOT NULL, active boolean NOT NULL DEFAULT true
);
CREATE TABLE purchases (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, mandate_id uuid NOT NULL, version int NOT NULL,
 logical_key text NOT NULL CHECK(length(logical_key) BETWEEN 1 AND 100), basket jsonb NOT NULL, basket_hash text NOT NULL,
 total_cents int NOT NULL CHECK(total_cents>0), currency text NOT NULL CHECK(currency='USD'), merchant_id text NOT NULL,
 state text NOT NULL CHECK(state IN ('APPROVED','ORDER_CREATED','BUYER_APPROVED','AUTHORIZED','CAPTURED','VOIDED','RELEASED','RECONCILING','FAILED')),
 approval_id uuid NOT NULL UNIQUE, approval_expires timestamptz NOT NULL, approval_consumed boolean NOT NULL DEFAULT false,
 disabled_at timestamptz, disable_reason text,
 reservation text NOT NULL CHECK(reservation IN ('HELD','SPENT','RELEASED')),
 order_id text UNIQUE, authorization_id text UNIQUE, capture_id text UNIQUE, last_error text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((reservation='SPENT') = (state='CAPTURED')),
 CHECK (state<>'CAPTURED' OR capture_id IS NOT NULL),
 CHECK (state<>'VOIDED' OR reservation='RELEASED'),
 FOREIGN KEY(mandate_id,owner_id) REFERENCES mandates(id,owner_id),
 FOREIGN KEY(mandate_id,version) REFERENCES policies(mandate_id,version), UNIQUE(owner_id,logical_key), UNIQUE(id,owner_id)
);
CREATE TABLE operations (
 id uuid PRIMARY KEY, purchase_id uuid NOT NULL REFERENCES purchases(id), kind text NOT NULL CHECK(kind IN ('CREATE','AUTHORIZE','CAPTURE','VOID','RECONCILE')),
 request_id uuid NOT NULL UNIQUE, payload_hash text NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('RUNNING','UNKNOWN','SUCCEEDED','REJECTED','RESOLVED')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(), lease_until timestamptz NOT NULL,
 finished_at timestamptz, error_code text, remote_id text,
 UNIQUE(purchase_id,kind) -- one logical attempt per operation; recovery polls, never blindly replays money mutations
);
CREATE UNIQUE INDEX one_remote_operation ON operations(purchase_id) WHERE kind<>'RECONCILE' AND outcome IN ('RUNNING','UNKNOWN');
CREATE TABLE ledger (
 id bigserial PRIMARY KEY, purchase_id uuid NOT NULL REFERENCES purchases(id), mandate_id uuid NOT NULL REFERENCES mandates(id),
 kind text NOT NULL CHECK(kind IN ('RESERVE','SPEND','RELEASE')), cents int NOT NULL CHECK(cents>0),
 at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(purchase_id,kind)
);
CREATE TABLE audit (
 id bigserial PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id), mandate_id uuid REFERENCES mandates(id), purchase_id uuid REFERENCES purchases(id),
 actor text NOT NULL, event text NOT NULL, details jsonb NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE webhook_events (
 event_id text PRIMARY KEY, event_type text NOT NULL, verified_at timestamptz NOT NULL,
 purchase_id uuid REFERENCES purchases(id), status text NOT NULL CHECK(status IN ('QUEUED','APPLIED','UNKNOWN_REFERENCE')), received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE reconciliation_attempts (
 id bigserial PRIMARY KEY, purchase_id uuid NOT NULL REFERENCES purchases(id), at timestamptz NOT NULL DEFAULT clock_timestamp(),
 outcome text NOT NULL, next_attempt_at timestamptz, error_code text
);
CREATE INDEX pending_purchases ON purchases(state) WHERE reservation='HELD';
