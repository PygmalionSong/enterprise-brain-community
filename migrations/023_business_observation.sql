-- Historical read evidence is immutable; review access can expire or be revoked.
-- 历史只读证据不可改写；核对访问可以到期或撤销。
CREATE TABLE business_observation(
 enterprise_id uuid NOT NULL,id uuid NOT NULL,principal_id uuid NOT NULL REFERENCES principal(id),
 authorization_version integer NOT NULL CHECK(authorization_version>0),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 100),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 run_id uuid NOT NULL,action_id uuid NOT NULL,result_hash text NOT NULL CHECK(result_hash ~ '^[a-f0-9]{64}$'),
 payload jsonb NOT NULL,payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),active boolean NOT NULL DEFAULT true,
 reason text,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,
 PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,principal_id,idempotency_key),
 FOREIGN KEY(enterprise_id,run_id) REFERENCES process_graph_run(enterprise_id,id),
 FOREIGN KEY(enterprise_id,action_id) REFERENCES process_graph_action(enterprise_id,id)
);
ALTER TABLE business_observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_observation FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON business_observation USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT ON business_observation TO eb_app;
GRANT UPDATE(version,active,reason,revoked_at) ON business_observation TO eb_app;
