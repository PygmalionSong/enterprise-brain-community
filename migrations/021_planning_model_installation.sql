-- Installation identity and its budget are committed in the same enterprise transaction.
-- 安装身份与额度在同一企业事务提交，凭证只保留私人文件引用/摘要。
CREATE TABLE planning_model_installation(
 enterprise_id uuid PRIMARY KEY REFERENCES enterprise(id),
 configuration_id uuid NOT NULL,configuration_version integer NOT NULL CHECK(configuration_version>0),
 identity_sha256 text NOT NULL CHECK(identity_sha256 ~ '^[a-f0-9]{64}$'),
 code_sha256 text NOT NULL CHECK(code_sha256 ~ '^[a-f0-9]{64}$'),
 credential_sha256 text CHECK(credential_sha256 ~ '^[a-f0-9]{64}$'),
 descriptor jsonb NOT NULL,installed_by uuid NOT NULL REFERENCES principal(id),installed_at timestamptz NOT NULL
);
ALTER TABLE planning_model_installation ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_model_installation FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON planning_model_installation USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT,UPDATE,DELETE ON planning_model_installation TO eb_app;
