-- Programmatic reservations only; no model dispatch or business-tool authority.
-- 仅程序化预留，不派发模型或授予业务工具权限。
CREATE TABLE business_analysis_request(
 enterprise_id uuid NOT NULL REFERENCES enterprise(id),id uuid NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 principal_id uuid NOT NULL REFERENCES principal(id),principal_role text NOT NULL CHECK(principal_role IN ('operations','executive')),
 authorization_version integer NOT NULL CHECK(authorization_version>0),
 idempotency_key text NOT NULL CHECK(idempotency_key ~ '^[A-Za-z0-9_.-]{1,100}$'),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),input jsonb NOT NULL,
 context_hash text NOT NULL CHECK(context_hash ~ '^[a-f0-9]{64}$'),context jsonb NOT NULL,
 policy_id uuid NOT NULL,policy_version integer NOT NULL CHECK(policy_version>0),
 configuration_id uuid NOT NULL,configuration_version integer NOT NULL CHECK(configuration_version>0),
 model_identity_sha256 text NOT NULL CHECK(model_identity_sha256 ~ '^[a-f0-9]{64}$'),
 state text NOT NULL CHECK(state IN ('reserved','unknown','cancelled')),
 reserved_output_tokens integer NOT NULL CHECK(reserved_output_tokens BETWEEN 64 AND 8192),
 lease_id uuid,lease_until timestamptz NOT NULL,code text,
 created_at timestamptz NOT NULL,finished_at timestamptz,
 PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,idempotency_key),
 CHECK((state='reserved')=(lease_id IS NOT NULL)),
 CHECK((state='reserved')=(finished_at IS NULL))
);
ALTER TABLE business_analysis_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_analysis_request FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON business_analysis_request USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT ON business_analysis_request TO eb_app;
GRANT UPDATE(version,state,lease_id,code,finished_at) ON business_analysis_request TO eb_app;

-- Freeze evidence,owner and reservation even for a privileged application transaction.
-- 即使同企业应用事务，也不能重写证据、原经办人或预留。
CREATE FUNCTION freeze_business_analysis_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['version','state','lease_id','code','finished_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['version','state','lease_id','code','finished_at']) THEN
  RAISE EXCEPTION 'analysis_request_immutable';
 END IF;
 IF OLD.state<>'reserved' OR NEW.state='reserved' OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'analysis_request_terminal';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER business_analysis_request_frozen BEFORE UPDATE ON business_analysis_request FOR EACH ROW EXECUTE FUNCTION freeze_business_analysis_request();
