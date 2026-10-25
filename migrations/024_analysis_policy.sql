-- Default-off business analysis policy; prepared contexts grant no model execution.
-- 默认关闭的业务分析策略；准备上下文不授予模型执行权。
CREATE TABLE analysis_policy(
 enterprise_id uuid PRIMARY KEY REFERENCES enterprise(id),id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),enabled boolean NOT NULL DEFAULT false,
 settings jsonb,settings_hash text CHECK(settings_hash ~ '^[a-f0-9]{64}$'),
 configured_by uuid NOT NULL REFERENCES principal(id),authorization_version integer NOT NULL CHECK(authorization_version>0),updated_at timestamptz NOT NULL,
 UNIQUE(enterprise_id,id),CHECK((settings IS NULL)=(settings_hash IS NULL)),CHECK(NOT enabled OR settings IS NOT NULL)
);
ALTER TABLE analysis_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON analysis_policy USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT,UPDATE ON analysis_policy TO eb_app;
