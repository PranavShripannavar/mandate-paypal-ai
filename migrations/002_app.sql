CREATE TABLE demo_sessions (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES owners(id), mandate_id uuid REFERENCES mandates(id),
 label text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '1 hour'
);
CREATE TABLE drafts (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES demo_sessions(id), body jsonb NOT NULL,
 ambiguity jsonb NOT NULL, source text NOT NULL, activated_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE usage_counters (
 scope text NOT NULL, period date NOT NULL DEFAULT CURRENT_DATE, kind text NOT NULL, used int NOT NULL DEFAULT 0 CHECK(used>=0),
 PRIMARY KEY(scope,period,kind)
);
CREATE TABLE agent_activity (
 id bigserial PRIMARY KEY, session_id uuid NOT NULL REFERENCES demo_sessions(id), action text NOT NULL,
 source text NOT NULL CHECK(source IN ('LIVE_GEMINI','GUIDED_REPLAY','BACKEND')), input text, output jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE demo_sessions ADD CONSTRAINT unique_active_mandate UNIQUE(mandate_id);
