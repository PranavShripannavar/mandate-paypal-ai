CREATE TABLE payment_evidence (
 id bigserial PRIMARY KEY, purchase_id uuid REFERENCES purchases(id),
 at timestamptz NOT NULL DEFAULT clock_timestamp(), method text NOT NULL, path text NOT NULL,
 request_id text, http int NOT NULL, debug_id text, request jsonb, response jsonb
);
ALTER TABLE webhook_events ADD COLUMN order_hint text;
