-- Durable, tenant-isolated discovery. Observations are not connection grants.
-- 持久化企业隔离发现；观察结果不授予连接权限。
ALTER TABLE principal ADD CONSTRAINT principal_enterprise_identity UNIQUE(enterprise_id,id);
CREATE TABLE onboarding_scope(
 enterprise_id uuid NOT NULL REFERENCES enterprise(id),id uuid NOT NULL,
 owner_id uuid NOT NULL,owner_version integer NOT NULL CHECK(owner_version>0),
 idempotency_key text NOT NULL,request_sha text NOT NULL CHECK(request_sha ~ '^[a-f0-9]{64}$'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),revoked boolean NOT NULL DEFAULT false,
 plan jsonb NOT NULL,plan_sha text NOT NULL CHECK(plan_sha ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL CHECK(expires_at>created_at),
 PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,owner_id,idempotency_key),
 FOREIGN KEY(enterprise_id,owner_id) REFERENCES principal(enterprise_id,id)
);
CREATE TABLE onboarding_asset(
 enterprise_id uuid NOT NULL REFERENCES enterprise(id),id text NOT NULL CHECK(id ~ '^asset_[a-f0-9]{64}$'),
 endpoint text NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,endpoint)
);
CREATE TABLE onboarding_run(
 enterprise_id uuid NOT NULL,id uuid NOT NULL,scope_id uuid NOT NULL,scope_version integer NOT NULL,
 requested_by uuid NOT NULL,requester_version integer NOT NULL,idempotency_key text NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 state text NOT NULL CHECK(state IN ('authorized','running','completed','partial','cancelled','expired','unknown')),
 worker_instance uuid,created_at timestamptz NOT NULL,deadline timestamptz NOT NULL,
 PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,requested_by,idempotency_key),
 FOREIGN KEY(enterprise_id,scope_id) REFERENCES onboarding_scope(enterprise_id,id),
 FOREIGN KEY(enterprise_id,requested_by) REFERENCES principal(enterprise_id,id)
);
CREATE TABLE onboarding_run_target(
 enterprise_id uuid NOT NULL,run_id uuid NOT NULL,asset_id text NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','issued','observed','unavailable','unsupported','cancelled','unknown')),
 claim_id uuid,evidence_id uuid,issued_at timestamptz,claim_deadline timestamptz,failure_code text,
 PRIMARY KEY(enterprise_id,run_id,asset_id),UNIQUE(enterprise_id,run_id,asset_id,claim_id),
 FOREIGN KEY(enterprise_id,run_id) REFERENCES onboarding_run(enterprise_id,id),
 FOREIGN KEY(enterprise_id,asset_id) REFERENCES onboarding_asset(enterprise_id,id),
 CHECK((claim_id IS NULL AND issued_at IS NULL AND claim_deadline IS NULL) OR
       (claim_id IS NOT NULL AND issued_at IS NOT NULL AND claim_deadline IS NOT NULL))
);
CREATE TABLE onboarding_evidence(
 enterprise_id uuid NOT NULL,id uuid NOT NULL,run_id uuid NOT NULL,asset_id text NOT NULL,claim_id uuid NOT NULL,
 scope_version integer NOT NULL,run_version integer NOT NULL,
 observation jsonb NOT NULL,observation_sha text NOT NULL CHECK(observation_sha ~ '^[a-f0-9]{64}$'),
 accepted_at timestamptz NOT NULL,
 PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,run_id,asset_id),
 FOREIGN KEY(enterprise_id,run_id,asset_id,claim_id) REFERENCES onboarding_run_target(enterprise_id,run_id,asset_id,claim_id)
);
CREATE TABLE onboarding_review(
 enterprise_id uuid NOT NULL,id uuid NOT NULL,asset_id text NOT NULL,evidence_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),revoked boolean NOT NULL DEFAULT false,
 reviewed_by uuid NOT NULL,reviewer_version integer NOT NULL,purpose jsonb NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(enterprise_id,id),FOREIGN KEY(enterprise_id,asset_id) REFERENCES onboarding_asset(enterprise_id,id),
 FOREIGN KEY(enterprise_id,evidence_id) REFERENCES onboarding_evidence(enterprise_id,id),
 FOREIGN KEY(enterprise_id,reviewed_by) REFERENCES principal(enterprise_id,id)
);
CREATE TABLE onboarding_binding(
 enterprise_id uuid NOT NULL,id uuid NOT NULL,review_id uuid NOT NULL,review_version integer NOT NULL,
 adapter_id text NOT NULL,adapter_version text NOT NULL,secret_ref text,
 version integer NOT NULL CHECK(version>0),state text NOT NULL CHECK(state IN ('pending','read_tested','revoked')),
 created_at timestamptz NOT NULL,
 PRIMARY KEY(enterprise_id,id),FOREIGN KEY(enterprise_id,review_id) REFERENCES onboarding_review(enterprise_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['onboarding_scope','onboarding_asset','onboarding_run','onboarding_run_target','onboarding_evidence','onboarding_review','onboarding_binding'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY enterprise_isolation ON %I USING(enterprise_id::text=current_setting(''app.enterprise_id'',true)) WITH CHECK(enterprise_id::text=current_setting(''app.enterprise_id'',true))',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO eb_app',t);
 END LOOP;
END $$;
REVOKE UPDATE ON onboarding_asset,onboarding_evidence FROM eb_app;
CREATE FUNCTION onboarding_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'onboarding_record_immutable'; END $$;
CREATE TRIGGER onboarding_asset_immutable BEFORE UPDATE OR DELETE ON onboarding_asset FOR EACH ROW EXECUTE FUNCTION onboarding_immutable();
CREATE TRIGGER onboarding_evidence_immutable BEFORE UPDATE OR DELETE ON onboarding_evidence FOR EACH ROW EXECUTE FUNCTION onboarding_immutable();
CREATE FUNCTION onboarding_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.enterprise_id,NEW.id,NEW.owner_id,NEW.owner_version,NEW.idempotency_key,NEW.request_sha,NEW.plan,NEW.plan_sha,NEW.created_at,NEW.expires_at)
 IS DISTINCT FROM ROW(OLD.enterprise_id,OLD.id,OLD.owner_id,OLD.owner_version,OLD.idempotency_key,OLD.request_sha,OLD.plan,OLD.plan_sha,OLD.created_at,OLD.expires_at)
 OR OLD.revoked OR NOT NEW.revoked OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'onboarding_scope_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER onboarding_scope_guard BEFORE UPDATE ON onboarding_scope FOR EACH ROW EXECUTE FUNCTION onboarding_scope_guard();
CREATE FUNCTION onboarding_run_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.enterprise_id,NEW.id,NEW.scope_id,NEW.scope_version,NEW.requested_by,NEW.requester_version,NEW.idempotency_key,NEW.created_at,NEW.deadline)
 IS DISTINCT FROM ROW(OLD.enterprise_id,OLD.id,OLD.scope_id,OLD.scope_version,OLD.requested_by,OLD.requester_version,OLD.idempotency_key,OLD.created_at,OLD.deadline)
 OR (OLD.worker_instance IS NOT NULL AND NEW.worker_instance IS DISTINCT FROM OLD.worker_instance)
 OR NEW.version<OLD.version THEN RAISE EXCEPTION 'onboarding_run_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER onboarding_run_guard BEFORE UPDATE ON onboarding_run FOR EACH ROW EXECUTE FUNCTION onboarding_run_guard();
CREATE FUNCTION onboarding_claim_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.enterprise_id,NEW.run_id,NEW.asset_id) IS DISTINCT FROM ROW(OLD.enterprise_id,OLD.run_id,OLD.asset_id)
 OR (OLD.claim_id IS NOT NULL AND ROW(NEW.claim_id,NEW.evidence_id,NEW.issued_at,NEW.claim_deadline)
 IS DISTINCT FROM ROW(OLD.claim_id,OLD.evidence_id,OLD.issued_at,OLD.claim_deadline))
 OR (OLD.state<>'pending' AND NEW.state='issued') THEN RAISE EXCEPTION 'onboarding_claim_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER onboarding_claim_guard BEFORE UPDATE ON onboarding_run_target FOR EACH ROW EXECUTE FUNCTION onboarding_claim_guard();
