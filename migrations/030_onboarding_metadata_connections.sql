-- Independent identity review and explicit bounded metadata read tests.
-- 独立身份核对与明确有界元数据读取测试；不授予业务工具执行。
ALTER TABLE onboarding_review ADD COLUMN idempotency_key text;
UPDATE onboarding_review SET idempotency_key='legacy-'||id::text;
ALTER TABLE onboarding_review ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE onboarding_review ADD CONSTRAINT onboarding_review_request UNIQUE(enterprise_id,reviewed_by,idempotency_key);
CREATE TABLE onboarding_read_test(
 enterprise_id uuid NOT NULL,id uuid NOT NULL,binding_id uuid NOT NULL,
 binding_version integer NOT NULL,review_version integer NOT NULL,
 requested_by uuid NOT NULL,requester_version integer NOT NULL,
 idempotency_key text NOT NULL,state text NOT NULL CHECK(state IN ('issued','passed','changed','unavailable')),
 deadline timestamptz NOT NULL,completed_at timestamptz,code text,
 PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,requested_by,idempotency_key),
 FOREIGN KEY(enterprise_id,binding_id) REFERENCES onboarding_binding(enterprise_id,id),
 FOREIGN KEY(enterprise_id,requested_by) REFERENCES principal(enterprise_id,id)
);
ALTER TABLE onboarding_read_test ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_read_test FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON onboarding_read_test USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT,UPDATE ON onboarding_read_test TO eb_app;
CREATE FUNCTION onboarding_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.enterprise_id,NEW.id,NEW.asset_id,NEW.evidence_id,NEW.reviewed_by,NEW.reviewer_version,NEW.purpose,NEW.created_at,NEW.idempotency_key)
 IS DISTINCT FROM ROW(OLD.enterprise_id,OLD.id,OLD.asset_id,OLD.evidence_id,OLD.reviewed_by,OLD.reviewer_version,OLD.purpose,OLD.created_at,OLD.idempotency_key)
 OR OLD.revoked OR NOT NEW.revoked OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'onboarding_review_immutable';END IF;RETURN NEW;
END $$;
CREATE TRIGGER onboarding_review_guard BEFORE UPDATE ON onboarding_review FOR EACH ROW EXECUTE FUNCTION onboarding_review_guard();
CREATE FUNCTION onboarding_binding_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.enterprise_id,NEW.id,NEW.review_id,NEW.review_version,NEW.adapter_id,NEW.adapter_version,NEW.secret_ref,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.enterprise_id,OLD.id,OLD.review_id,OLD.review_version,OLD.adapter_id,OLD.adapter_version,OLD.secret_ref,OLD.created_at)
 OR OLD.state='revoked' OR NEW.version<>OLD.version+1
 OR NOT ((OLD.state='pending' AND NEW.state IN ('read_tested','revoked')) OR (OLD.state='read_tested' AND NEW.state='revoked'))
 THEN RAISE EXCEPTION 'onboarding_binding_immutable';END IF;RETURN NEW;
END $$;
CREATE TRIGGER onboarding_binding_guard BEFORE UPDATE ON onboarding_binding FOR EACH ROW EXECUTE FUNCTION onboarding_binding_guard();
CREATE FUNCTION onboarding_read_test_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.enterprise_id,NEW.id,NEW.binding_id,NEW.binding_version,NEW.review_version,NEW.requested_by,NEW.requester_version,NEW.idempotency_key,NEW.deadline)
 IS DISTINCT FROM ROW(OLD.enterprise_id,OLD.id,OLD.binding_id,OLD.binding_version,OLD.review_version,OLD.requested_by,OLD.requester_version,OLD.idempotency_key,OLD.deadline)
 OR OLD.state<>'issued' OR NEW.state='issued' THEN RAISE EXCEPTION 'onboarding_read_test_immutable';END IF;RETURN NEW;
END $$;
CREATE TRIGGER onboarding_read_test_guard BEFORE UPDATE ON onboarding_read_test FOR EACH ROW EXECUTE FUNCTION onboarding_read_test_guard();
