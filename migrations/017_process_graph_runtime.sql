-- Version-bound plans and durable orchestration actions; imports alone grant no execution.
-- 版本绑定的计划与持久编排动作；单独导入流程不授予执行权限。
CREATE TABLE process_graph_plan(
 enterprise_id uuid NOT NULL REFERENCES enterprise(id),id uuid NOT NULL,version integer NOT NULL DEFAULT 1,
 payload jsonb NOT NULL,plan_hash text NOT NULL,created_by uuid NOT NULL REFERENCES principal(id),authorization_version integer NOT NULL,
 revoked boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,id)
);
CREATE TABLE process_graph_approval(
 enterprise_id uuid NOT NULL,id uuid NOT NULL,plan_id uuid NOT NULL,plan_hash text NOT NULL,
 principal_id uuid NOT NULL REFERENCES principal(id),authorization_version integer NOT NULL,
 expires_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,id),FOREIGN KEY(enterprise_id,plan_id) REFERENCES process_graph_plan(enterprise_id,id)
);
CREATE TABLE process_graph_run(
 enterprise_id uuid NOT NULL,id uuid NOT NULL,plan_id uuid NOT NULL,approval_id uuid NOT NULL,
 principal_id uuid NOT NULL REFERENCES principal(id),authorization_version integer NOT NULL,idempotency_key text NOT NULL,
 version integer NOT NULL DEFAULT 1,state text NOT NULL CHECK(state IN ('ready','running','waiting_external','waiting_input','succeeded','failed','cancelled')),
 completed_nodes jsonb NOT NULL DEFAULT '[]',reason text,cancel_requested boolean NOT NULL DEFAULT false,
 fence integer NOT NULL DEFAULT 0,lease_until timestamptz,steps integer NOT NULL DEFAULT 0,deadline timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,principal_id,idempotency_key),
 FOREIGN KEY(enterprise_id,plan_id) REFERENCES process_graph_plan(enterprise_id,id),FOREIGN KEY(enterprise_id,approval_id) REFERENCES process_graph_approval(enterprise_id,id)
);
CREATE TABLE process_graph_action(
 enterprise_id uuid NOT NULL,id uuid NOT NULL,run_id uuid NOT NULL,node_key text NOT NULL,
 tool_id text NOT NULL,tool_version text NOT NULL,args jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('dispatching','accepted','unknown','completed','failed','partial')),
 receipt_ref text,source_revision text,result jsonb,lookup_count integer NOT NULL DEFAULT 0,
 PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,run_id,node_key),FOREIGN KEY(enterprise_id,run_id) REFERENCES process_graph_run(enterprise_id,id)
);
CREATE TABLE process_graph_event(
 enterprise_id uuid NOT NULL,run_id uuid NOT NULL,sequence integer NOT NULL,kind text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,run_id,sequence),FOREIGN KEY(enterprise_id,run_id) REFERENCES process_graph_run(enterprise_id,id)
);
ALTER TABLE process_graph_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_graph_plan FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON process_graph_plan USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
ALTER TABLE process_graph_approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_graph_approval FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON process_graph_approval USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
ALTER TABLE process_graph_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_graph_run FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON process_graph_run USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
ALTER TABLE process_graph_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_graph_action FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON process_graph_action USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
ALTER TABLE process_graph_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_graph_event FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON process_graph_event USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT ON process_graph_plan,process_graph_approval,process_graph_event TO eb_app;
GRANT UPDATE(revoked,version) ON process_graph_plan TO eb_app;
GRANT UPDATE(revoked) ON process_graph_approval TO eb_app;
GRANT SELECT,INSERT,UPDATE ON process_graph_run,process_graph_action TO eb_app;
