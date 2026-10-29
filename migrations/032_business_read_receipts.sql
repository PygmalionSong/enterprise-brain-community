-- One durable attempt per action reference. Lookup never dispatches another GET.
-- 每动作引用仅一次持久尝试，查回执不再次GET。
CREATE TABLE business_read_receipt(
 enterprise_id uuid NOT NULL,reference uuid NOT NULL,grant_id uuid NOT NULL,grant_version integer NOT NULL,
 policy_sha text NOT NULL,requested_by uuid NOT NULL,requester_version integer NOT NULL,
 state text NOT NULL CHECK(state IN ('issued','completed','unknown')),deadline timestamptz NOT NULL,
 projection jsonb,projection_sha text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz,
 PRIMARY KEY(enterprise_id,reference),FOREIGN KEY(enterprise_id,grant_id) REFERENCES business_read_grant(enterprise_id,id),
 FOREIGN KEY(enterprise_id,requested_by) REFERENCES principal(enterprise_id,id),
 CHECK((state='completed' AND projection IS NOT NULL AND projection_sha IS NOT NULL AND completed_at IS NOT NULL) OR (state<>'completed' AND projection IS NULL AND projection_sha IS NULL))
);
ALTER TABLE business_read_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_read_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON business_read_receipt USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT,UPDATE ON business_read_receipt TO eb_app;
CREATE FUNCTION business_read_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state<>'issued' OR NEW.state='issued' OR ROW(NEW.enterprise_id,NEW.reference,NEW.grant_id,NEW.grant_version,NEW.policy_sha,NEW.requested_by,NEW.requester_version,NEW.deadline,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.enterprise_id,OLD.reference,OLD.grant_id,OLD.grant_version,OLD.policy_sha,OLD.requested_by,OLD.requester_version,OLD.deadline,OLD.created_at)
 THEN RAISE EXCEPTION 'business_read_receipt_immutable';END IF;RETURN NEW;
END $$;
CREATE TRIGGER business_read_receipt_guard BEFORE UPDATE ON business_read_receipt FOR EACH ROW EXECUTE FUNCTION business_read_receipt_guard();
