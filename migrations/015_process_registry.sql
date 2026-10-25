-- Source process definitions and reviewed mappings remain non-executable evidence.
-- 源端流程定义与已核对映射保持为不可执行证据。
CREATE TABLE process_registry(
 enterprise_id uuid NOT NULL REFERENCES enterprise(id),id uuid NOT NULL,
 source_id text NOT NULL,process_id text NOT NULL,version integer NOT NULL CHECK(version>0),
 state text NOT NULL CHECK(state IN ('pending','confirmed','revoked')),
 origin text NOT NULL CHECK(origin IN ('operator_import','mcp_read','reference_blueprint')),
 raw_sha256 text NOT NULL,definition_sha256 text NOT NULL,definition jsonb NOT NULL,
 mapping jsonb NOT NULL DEFAULT '[]',
 created_by uuid NOT NULL REFERENCES principal(id),authorization_version integer NOT NULL,
 confirmed_by uuid REFERENCES principal(id),confirmed_authorization_version integer,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,source_id,process_id)
);
CREATE TABLE process_definition_revision(
 enterprise_id uuid NOT NULL,id uuid NOT NULL,version integer NOT NULL,
 raw_sha256 text NOT NULL,definition_sha256 text NOT NULL,definition jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES principal(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,id,version),
 FOREIGN KEY(enterprise_id,id) REFERENCES process_registry(enterprise_id,id)
);
CREATE TABLE process_cross_link(
 enterprise_id uuid NOT NULL REFERENCES enterprise(id),id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),state text NOT NULL CHECK(state IN ('confirmed','revoked')),
 from_id uuid NOT NULL,to_id uuid NOT NULL,from_hash text NOT NULL,to_hash text NOT NULL,
 from_node text NOT NULL,to_node text NOT NULL,object_relation text NOT NULL,
 reviewed_by uuid NOT NULL REFERENCES principal(id),authorization_version integer NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enterprise_id,id),
 FOREIGN KEY(enterprise_id,from_id) REFERENCES process_registry(enterprise_id,id),
 FOREIGN KEY(enterprise_id,to_id) REFERENCES process_registry(enterprise_id,id)
);
ALTER TABLE process_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_registry FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON process_registry USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
ALTER TABLE process_definition_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_definition_revision FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON process_definition_revision USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
ALTER TABLE process_cross_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_cross_link FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON process_cross_link USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT,UPDATE ON process_registry,process_cross_link TO eb_app;
GRANT SELECT,INSERT ON process_definition_revision TO eb_app;
