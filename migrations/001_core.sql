-- Enterprise identity, versioned context and source facts. / 企业身份、版本化上下文与源事实。
CREATE ROLE eb_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE TABLE enterprise (id uuid PRIMARY KEY, name text NOT NULL, environment text NOT NULL CHECK(environment IN ('demo','enterprise')), currency text NOT NULL, timezone text NOT NULL);
CREATE TABLE entity (enterprise_id uuid NOT NULL REFERENCES enterprise(id), id uuid NOT NULL, kind text NOT NULL, display_code text NOT NULL, name text NOT NULL, PRIMARY KEY(enterprise_id,id));
CREATE TABLE entity_alias (enterprise_id uuid NOT NULL, source_id text NOT NULL, kind text NOT NULL, external_id text NOT NULL, entity_id uuid NOT NULL, PRIMARY KEY(enterprise_id,source_id,kind,external_id), FOREIGN KEY(enterprise_id,entity_id) REFERENCES entity(enterprise_id,id));
CREATE TABLE business_scope (enterprise_id uuid NOT NULL, id text NOT NULL, version integer NOT NULL CHECK(version>0), parent_id text, name jsonb NOT NULL, PRIMARY KEY(enterprise_id,id,version), FOREIGN KEY(enterprise_id) REFERENCES enterprise(id));
CREATE TABLE scope_member (enterprise_id uuid NOT NULL, scope_id text NOT NULL, scope_version integer NOT NULL, member_id text NOT NULL, PRIMARY KEY(enterprise_id,scope_id,scope_version,member_id), FOREIGN KEY(enterprise_id,scope_id,scope_version) REFERENCES business_scope(enterprise_id,id,version));
CREATE TABLE source_record (enterprise_id uuid NOT NULL, id uuid NOT NULL, source_id text NOT NULL, external_id text NOT NULL, source_version text NOT NULL, business_time timestamptz NOT NULL, recorded_at timestamptz NOT NULL, fact_kind text NOT NULL CHECK(fact_kind IN ('source_actual','constructed_actual','budget','forecast','scenario_plan')), payload_hash text NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(enterprise_id,id), UNIQUE(enterprise_id,source_id,external_id,source_version), FOREIGN KEY(enterprise_id) REFERENCES enterprise(id));
CREATE TABLE sku_pack (enterprise_id uuid NOT NULL, sku_id text NOT NULL, pack_version integer NOT NULL, volume_ml integer NOT NULL CHECK(volume_ml>0), units_per_case integer NOT NULL CHECK(units_per_case>0), packaging_type text NOT NULL CHECK(packaging_type IN ('carton','film')), PRIMARY KEY(enterprise_id,sku_id,pack_version), FOREIGN KEY(enterprise_id) REFERENCES enterprise(id));
CREATE TABLE metric_definition (id text PRIMARY KEY, version integer NOT NULL, unit_code text NOT NULL, aggregation text NOT NULL CHECK(aggregation IN ('flow_sum','snapshot','ratio','plan')), title jsonb NOT NULL);
CREATE TABLE metric_observation (enterprise_id uuid NOT NULL, id uuid NOT NULL, metric_id text NOT NULL REFERENCES metric_definition(id), scope_id text NOT NULL, scope_version integer NOT NULL, period_start date NOT NULL, period_end date NOT NULL CHECK(period_end>period_start), fact_kind text NOT NULL, fact_version text NOT NULL, scenario_id text NOT NULL DEFAULT 'BASELINE', grain_hash text NOT NULL, value numeric(22,6), numerator numeric(22,6), denominator numeric(22,6), currency text, source_record_id uuid NOT NULL, PRIMARY KEY(enterprise_id,id), UNIQUE(enterprise_id,metric_id,scope_id,scope_version,period_start,period_end,fact_kind,fact_version,scenario_id,grain_hash), FOREIGN KEY(enterprise_id,scope_id,scope_version) REFERENCES business_scope(enterprise_id,id,version), FOREIGN KEY(enterprise_id,source_record_id) REFERENCES source_record(enterprise_id,id), CHECK(denominator IS NULL OR denominator>=0));
CREATE TABLE physical_object (enterprise_id uuid NOT NULL, id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('bottle','case','pallet')), PRIMARY KEY(enterprise_id,id), FOREIGN KEY(enterprise_id) REFERENCES enterprise(id));
CREATE TABLE code_alias (enterprise_id uuid NOT NULL, code text NOT NULL, code_kind text NOT NULL CHECK(code_kind IN ('cap_inner','cap_outer','case_inner','case_outer','pallet')), object_id uuid NOT NULL, PRIMARY KEY(enterprise_id,code), FOREIGN KEY(enterprise_id,object_id) REFERENCES physical_object(enterprise_id,id));
CREATE TABLE containment (enterprise_id uuid NOT NULL, child_id uuid NOT NULL, parent_id uuid NOT NULL, valid_from timestamptz NOT NULL, valid_to timestamptz, event_id text NOT NULL, PRIMARY KEY(enterprise_id,child_id,valid_from), FOREIGN KEY(enterprise_id,child_id) REFERENCES physical_object(enterprise_id,id), FOREIGN KEY(enterprise_id,parent_id) REFERENCES physical_object(enterprise_id,id), CHECK(child_id<>parent_id), CHECK(valid_to IS NULL OR valid_to>valid_from));
CREATE UNIQUE INDEX one_current_parent ON containment(enterprise_id,child_id) WHERE valid_to IS NULL;
-- Reject overlap, wrong physical hierarchy and invalid code types. / 拒绝历史重叠、错误物理层级与码类型。
CREATE FUNCTION validate_containment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ck text; pk text;
BEGIN
 SELECT kind INTO ck FROM physical_object WHERE enterprise_id=NEW.enterprise_id AND id=NEW.child_id;
 SELECT kind INTO pk FROM physical_object WHERE enterprise_id=NEW.enterprise_id AND id=NEW.parent_id;
 IF NOT ((ck='bottle' AND pk='case') OR (ck='case' AND pk='pallet')) THEN RAISE EXCEPTION 'invalid_containment_kind'; END IF;
 IF EXISTS(SELECT 1 FROM containment WHERE enterprise_id=NEW.enterprise_id AND child_id=NEW.child_id AND valid_from<>NEW.valid_from AND tstzrange(valid_from,valid_to,'[)') && tstzrange(NEW.valid_from,NEW.valid_to,'[)')) THEN RAISE EXCEPTION 'overlapping_containment'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER containment_check BEFORE INSERT OR UPDATE ON containment FOR EACH ROW EXECUTE FUNCTION validate_containment();
CREATE FUNCTION validate_code_kind() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text;
BEGIN SELECT kind INTO k FROM physical_object WHERE enterprise_id=NEW.enterprise_id AND id=NEW.object_id;
 IF NOT ((k='bottle' AND NEW.code_kind IN ('cap_inner','cap_outer')) OR (k='case' AND NEW.code_kind IN ('case_inner','case_outer')) OR (k='pallet' AND NEW.code_kind='pallet')) THEN RAISE EXCEPTION 'invalid_code_alias'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER code_kind_check BEFORE INSERT OR UPDATE ON code_alias FOR EACH ROW EXECUTE FUNCTION validate_code_kind();
CREATE FUNCTION reject_constructed_enterprise() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.fact_kind='constructed_actual' AND EXISTS(SELECT 1 FROM enterprise WHERE id=NEW.enterprise_id AND environment='enterprise') THEN RAISE EXCEPTION 'constructed_fact_in_enterprise'; END IF; RETURN NEW; END $$;
CREATE TRIGGER source_mode_check BEFORE INSERT OR UPDATE ON source_record FOR EACH ROW EXECUTE FUNCTION reject_constructed_enterprise();
CREATE TRIGGER metric_mode_check BEFORE INSERT OR UPDATE ON metric_observation FOR EACH ROW EXECUTE FUNCTION reject_constructed_enterprise();
CREATE TABLE evidence_hold (enterprise_id uuid NOT NULL, id uuid NOT NULL, source_record_id uuid NOT NULL, reason text NOT NULL, owner_role text NOT NULL, expires_at timestamptz, released_at timestamptz, PRIMARY KEY(enterprise_id,id), FOREIGN KEY(enterprise_id,source_record_id) REFERENCES source_record(enterprise_id,id));
CREATE TABLE audit_event (enterprise_id uuid NOT NULL, id uuid NOT NULL, kind text NOT NULL, actor_id uuid, created_at timestamptz NOT NULL DEFAULT now(), details jsonb NOT NULL, PRIMARY KEY(enterprise_id,id), FOREIGN KEY(enterprise_id) REFERENCES enterprise(id));
CREATE TABLE case_file (enterprise_id uuid NOT NULL, id text NOT NULL, scope_id text NOT NULL, scope_version integer NOT NULL, title jsonb NOT NULL, period_start date NOT NULL, period_end date NOT NULL, scenario_id text NOT NULL, state text NOT NULL CHECK(state IN ('analysis','ready','waiting','closed')), PRIMARY KEY(enterprise_id,id), FOREIGN KEY(enterprise_id,scope_id,scope_version) REFERENCES business_scope(enterprise_id,id,version));
