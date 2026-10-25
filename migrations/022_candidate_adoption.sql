-- Explicit IT adoption is atomic and idempotent; business approval remains separate.
-- 明确IT采用原子且幂等；业务批准保持独立。
CREATE TABLE planning_candidate_adoption(
 enterprise_id uuid NOT NULL,candidate_id uuid NOT NULL,candidate_version integer NOT NULL,
 context_hash text NOT NULL CHECK(context_hash ~ '^[a-f0-9]{64}$'),
 output_hash text NOT NULL CHECK(output_hash ~ '^[a-f0-9]{64}$'),
 plan_id uuid NOT NULL,plan_hash text NOT NULL CHECK(plan_hash ~ '^[a-f0-9]{64}$'),
 adopted_by uuid NOT NULL REFERENCES principal(id),authorization_version integer NOT NULL,adopted_at timestamptz NOT NULL,
 PRIMARY KEY(enterprise_id,candidate_id),UNIQUE(enterprise_id,plan_id),
 FOREIGN KEY(enterprise_id,candidate_id) REFERENCES planning_candidate(enterprise_id,id),
 FOREIGN KEY(enterprise_id,plan_id) REFERENCES process_graph_plan(enterprise_id,id)
);
ALTER TABLE planning_candidate_adoption ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_candidate_adoption FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON planning_candidate_adoption USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT ON planning_candidate_adoption TO eb_app;
