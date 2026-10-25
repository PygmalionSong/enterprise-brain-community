-- E3 tenant-isolated grants, connection revisions and diagnostic evidence.
-- E3租户隔离的授权、连接版本与诊断证据。
CREATE TABLE discovery_grant(enterprise_id uuid NOT NULL,id uuid NOT NULL,principal_id uuid NOT NULL REFERENCES principal(id),authorization_version integer NOT NULL,target jsonb NOT NULL,expires_at timestamptz NOT NULL,rate_limit integer NOT NULL CHECK(rate_limit BETWEEN 1 AND 120),revoked boolean NOT NULL DEFAULT false,window_start timestamptz NOT NULL,calls integer NOT NULL DEFAULT 0,PRIMARY KEY(enterprise_id,id));
CREATE TABLE connector_connection(enterprise_id uuid NOT NULL,id text NOT NULL,grant_id uuid NOT NULL,state text NOT NULL CHECK(state IN ('requested','discovering','diagnosed','mapping','testing','active','needs_authorization','needs_mapping_review','unsupported','failed','degraded')),version integer NOT NULL,driver_version text,schema_hash text,capability_hash text,mapping jsonb,read_enabled boolean NOT NULL DEFAULT false,write_enabled boolean NOT NULL DEFAULT false,report jsonb NOT NULL DEFAULT '{}',PRIMARY KEY(enterprise_id,id),FOREIGN KEY(enterprise_id,grant_id) REFERENCES discovery_grant(enterprise_id,id));
CREATE TABLE connector_revision(enterprise_id uuid NOT NULL,connection_id text NOT NULL,version integer NOT NULL,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL,PRIMARY KEY(enterprise_id,connection_id,version),FOREIGN KEY(enterprise_id,connection_id) REFERENCES connector_connection(enterprise_id,id));
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['discovery_grant','connector_connection','connector_revision'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY enterprise_isolation ON %I USING(enterprise_id::text=current_setting(''app.enterprise_id'',true)) WITH CHECK(enterprise_id::text=current_setting(''app.enterprise_id'',true))',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO eb_app',t);
 END LOOP;
END $$;
REVOKE UPDATE ON connector_revision FROM eb_app;
CREATE FUNCTION guard_discovery_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.principal_id,NEW.authorization_version,NEW.target,NEW.expires_at,NEW.rate_limit) IS DISTINCT FROM (OLD.principal_id,OLD.authorization_version,OLD.target,OLD.expires_at,OLD.rate_limit) OR (OLD.revoked AND NOT NEW.revoked) THEN RAISE EXCEPTION 'discovery_grant_immutable';END IF;RETURN NEW;END $$;
CREATE TRIGGER discovery_grant_guard BEFORE UPDATE ON discovery_grant FOR EACH ROW EXECUTE FUNCTION guard_discovery_grant();
