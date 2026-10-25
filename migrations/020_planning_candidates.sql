-- Durable reservations precede model I/O; configuration updates never reset counters.
-- 模型IO之前持久预留；更新配置不清零计数。
CREATE TABLE planning_configuration(
 enterprise_id uuid PRIMARY KEY REFERENCES enterprise(id),id uuid NOT NULL,version integer NOT NULL CHECK(version>0),
 enabled boolean NOT NULL DEFAULT false,reconciliation_required boolean NOT NULL DEFAULT false,
 identity_sha256 text NOT NULL CHECK(identity_sha256 ~ '^[a-f0-9]{64}$'),
 max_calls integer NOT NULL CHECK(max_calls BETWEEN 1 AND 180),calls_reserved integer NOT NULL DEFAULT 0 CHECK(calls_reserved BETWEEN 0 AND 180),
 max_output_tokens integer NOT NULL CHECK(max_output_tokens BETWEEN 64 AND 8192),
 output_token_budget integer NOT NULL CHECK(output_token_budget BETWEEN 64 AND 1474560),
 output_tokens_reserved integer NOT NULL DEFAULT 0 CHECK(output_tokens_reserved BETWEEN 0 AND 1474560),
 timeout_ms integer NOT NULL CHECK(timeout_ms BETWEEN 20 AND 60000),expires_at timestamptz NOT NULL,
 updated_by uuid NOT NULL REFERENCES principal(id),authorization_version integer NOT NULL,updated_at timestamptz NOT NULL,
 CHECK(output_token_budget>=max_output_tokens),CHECK(calls_reserved<=max_calls),CHECK(output_tokens_reserved<=output_token_budget)
);
CREATE TABLE planning_candidate(
 enterprise_id uuid NOT NULL REFERENCES enterprise(id),id uuid NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 principal_id uuid NOT NULL REFERENCES principal(id),authorization_version integer NOT NULL,
 idempotency_key text NOT NULL,request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),input jsonb NOT NULL,
 configuration_id uuid NOT NULL,configuration_version integer NOT NULL,configuration_sha256 text NOT NULL,
 state text NOT NULL CHECK(state IN ('reserved','completed','refused','invalid','unknown','cancelled')),
 reserved_output_tokens integer NOT NULL CHECK(reserved_output_tokens BETWEEN 64 AND 8192),
 lease_id uuid,lease_until timestamptz NOT NULL,output jsonb,reported_usage jsonb,code text,
 created_at timestamptz NOT NULL,finished_at timestamptz,
 PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,idempotency_key),
 CHECK((state='reserved')=(lease_id IS NOT NULL)),CHECK(state='completed' OR output IS NULL)
);
ALTER TABLE planning_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_configuration FORCE ROW LEVEL SECURITY;
ALTER TABLE planning_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_candidate FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON planning_configuration USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
CREATE POLICY enterprise_isolation ON planning_candidate USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT,UPDATE ON planning_configuration,planning_candidate TO eb_app;
