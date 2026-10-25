-- Independent,default-off historical read policy;no model or execution grant.
-- 独立且默认关闭的历史只读策略，不授模型或执行权。
CREATE TABLE business_history_policy(
 enterprise_id uuid PRIMARY KEY REFERENCES enterprise(id),id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),enabled boolean NOT NULL DEFAULT false,
 settings jsonb,settings_hash text CHECK(settings_hash ~ '^[a-f0-9]{64}$'),
 configured_by uuid NOT NULL REFERENCES principal(id),authorization_version integer NOT NULL CHECK(authorization_version>0),
 updated_at timestamptz NOT NULL,UNIQUE(enterprise_id,id),
 CHECK((settings IS NULL)=(settings_hash IS NULL)),CHECK(NOT enabled OR settings IS NOT NULL)
);
ALTER TABLE business_history_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_history_policy FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON business_history_policy USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT,UPDATE ON business_history_policy TO eb_app;
