-- Immutable file observations stay separate from authoritative operating projections.
-- 文件观测保持独立，不覆盖权威经营投影。
CREATE TABLE file_import(
 enterprise_id uuid NOT NULL REFERENCES enterprise(id),id uuid NOT NULL,
 version integer NOT NULL DEFAULT 1,state text NOT NULL DEFAULT 'preview' CHECK(state IN ('preview','confirmed','revoked')),
 content_hash text NOT NULL,schema_id text NOT NULL,records jsonb NOT NULL,
 row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 1000),
 source_name text NOT NULL,source_revision text NOT NULL,business_owner_role text NOT NULL,
 created_by uuid NOT NULL REFERENCES principal(id),authorization_version integer NOT NULL,
 created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 confirmed_by uuid REFERENCES principal(id),confirmed_authorization_version integer,confirmed_at timestamptz,
 PRIMARY KEY(enterprise_id,id)
);
ALTER TABLE file_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_import FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON file_import USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT,UPDATE ON file_import TO eb_app;
