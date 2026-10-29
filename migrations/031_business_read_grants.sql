-- Separate IT endpoint policy and business approval. No automatic grants.
-- 独立IT目标政策与业务批准，不自动授予权限。
CREATE TABLE business_read_policy(
 enterprise_id uuid NOT NULL,id uuid NOT NULL,version integer NOT NULL CHECK(version>0),
 binding_id uuid NOT NULL,reviewed_by uuid NOT NULL,reviewer_version integer NOT NULL,
 policy jsonb NOT NULL,policy_sha text NOT NULL CHECK(policy_sha ~ '^[a-f0-9]{64}$'),
 revoked boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(enterprise_id,id),FOREIGN KEY(enterprise_id,binding_id) REFERENCES onboarding_binding(enterprise_id,id),
 FOREIGN KEY(enterprise_id,reviewed_by) REFERENCES principal(enterprise_id,id)
);
CREATE TABLE business_read_grant(
 enterprise_id uuid NOT NULL,id uuid NOT NULL,version integer NOT NULL CHECK(version>0),
 policy_id uuid NOT NULL,policy_version integer NOT NULL,policy_sha text NOT NULL,
 approved_by uuid NOT NULL,approver_version integer NOT NULL,purpose text NOT NULL,
 expires_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(enterprise_id,id),FOREIGN KEY(enterprise_id,policy_id) REFERENCES business_read_policy(enterprise_id,id),
 FOREIGN KEY(enterprise_id,approved_by) REFERENCES principal(enterprise_id,id),CHECK(expires_at>created_at)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['business_read_policy','business_read_grant'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY enterprise_isolation ON %I USING(enterprise_id::text=current_setting(''app.enterprise_id'',true)) WITH CHECK(enterprise_id::text=current_setting(''app.enterprise_id'',true))',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO eb_app',t);
 END LOOP;
END $$;
CREATE FUNCTION business_read_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.enterprise_id,NEW.id,NEW.binding_id,NEW.reviewed_by,NEW.reviewer_version,NEW.policy,NEW.policy_sha,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.enterprise_id,OLD.id,OLD.binding_id,OLD.reviewed_by,OLD.reviewer_version,OLD.policy,OLD.policy_sha,OLD.created_at)
 OR OLD.revoked OR NOT NEW.revoked OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'business_read_policy_immutable';END IF;RETURN NEW;
END $$;
CREATE TRIGGER business_read_policy_guard BEFORE UPDATE ON business_read_policy FOR EACH ROW EXECUTE FUNCTION business_read_policy_guard();
CREATE FUNCTION business_read_grant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.enterprise_id,NEW.id,NEW.policy_id,NEW.policy_version,NEW.policy_sha,NEW.approved_by,NEW.approver_version,NEW.purpose,NEW.expires_at,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.enterprise_id,OLD.id,OLD.policy_id,OLD.policy_version,OLD.policy_sha,OLD.approved_by,OLD.approver_version,OLD.purpose,OLD.expires_at,OLD.created_at)
 OR OLD.revoked OR NOT NEW.revoked OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'business_read_grant_immutable';END IF;RETURN NEW;
END $$;
CREATE TRIGGER business_read_grant_guard BEFORE UPDATE ON business_read_grant FOR EACH ROW EXECUTE FUNCTION business_read_grant_guard();
