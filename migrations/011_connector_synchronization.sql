-- Derived connector projections, not source ledgers; tenant policy applies to checkpoints too.
-- 连接器派生投影，不替代源账本；断点同样按企业隔离。
CREATE TABLE connector_sync_state(enterprise_id uuid NOT NULL,connection_id text NOT NULL,binding text NOT NULL,source_id uuid NOT NULL,source_version bigint NOT NULL CHECK(source_version>0),checkpoint text NOT NULL,as_of timestamptz NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(enterprise_id,connection_id),FOREIGN KEY(enterprise_id,connection_id) REFERENCES connector_connection(enterprise_id,id));
CREATE TABLE connector_projection(enterprise_id uuid NOT NULL,connection_id text NOT NULL,group_key text NOT NULL,record_key text NOT NULL,payload jsonb NOT NULL,source_version bigint NOT NULL CHECK(source_version>0),PRIMARY KEY(enterprise_id,connection_id,record_key),FOREIGN KEY(enterprise_id,connection_id) REFERENCES connector_connection(enterprise_id,id));
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['connector_sync_state','connector_projection'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY enterprise_isolation ON %I USING(enterprise_id::text=current_setting(''app.enterprise_id'',true)) WITH CHECK(enterprise_id::text=current_setting(''app.enterprise_id'',true))',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO eb_app',t);
END LOOP;END $$;
