-- Immutable source-validation receipt, separate from a manually reviewed draft.
-- 来源验证回执不可变，手工核对草稿不等于来源验证。
CREATE TABLE business_policy_validation(
 enterprise_id uuid NOT NULL,policy_id uuid NOT NULL,policy_version integer NOT NULL,
 policy_sha text NOT NULL,metadata_sha text NOT NULL,metadata_endpoint text NOT NULL,
 validated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(enterprise_id,policy_id),FOREIGN KEY(enterprise_id,policy_id) REFERENCES business_read_policy(enterprise_id,id)
);
ALTER TABLE business_policy_validation ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_policy_validation FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON business_policy_validation USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT ON business_policy_validation TO eb_app;
CREATE TRIGGER business_policy_validation_immutable BEFORE UPDATE OR DELETE ON business_policy_validation FOR EACH ROW EXECUTE FUNCTION onboarding_immutable();
