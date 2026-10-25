-- Explicit bounded delegation of approved graphs; no row means no background execution.
-- 显式有界委托已批准图；无记录即无后台执行。
CREATE TABLE process_graph_supervision(
 enterprise_id uuid NOT NULL,run_id uuid NOT NULL,version integer NOT NULL DEFAULT 1,
 enabled boolean NOT NULL DEFAULT false,state text NOT NULL CHECK(state IN ('idle','running','stopped','suspended','completed')),
 principal_id uuid NOT NULL REFERENCES principal(id),authorization_version integer NOT NULL,
 plan_hash text NOT NULL,runtime_sha256 text NOT NULL,interval_seconds integer NOT NULL CHECK(interval_seconds BETWEEN 5 AND 60),
 max_attempts integer NOT NULL CHECK(max_attempts BETWEEN 1 AND 128),attempts integer NOT NULL DEFAULT 0,failures integer NOT NULL DEFAULT 0,
 expires_at timestamptz NOT NULL,next_run_at timestamptz NOT NULL,lease_id uuid,lease_until timestamptz,code text,
 last_started_at timestamptz,last_finished_at timestamptz,
 PRIMARY KEY(enterprise_id,run_id),FOREIGN KEY(enterprise_id,run_id) REFERENCES process_graph_run(enterprise_id,id)
);
ALTER TABLE process_graph_supervision ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_graph_supervision FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON process_graph_supervision USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT,UPDATE ON process_graph_supervision TO eb_app;
