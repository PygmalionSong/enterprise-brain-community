-- Dataset fingerprint prevents repeat start from overwriting user state. / 数据指纹防止重复启动覆盖状态。
CREATE TABLE seed_manifest(id text PRIMARY KEY, checksum text NOT NULL, seeded_at timestamptz NOT NULL DEFAULT now());
-- Concurrent native writers serialize containment changes on the child row. / 原生并发写按子对象锁序列化。
CREATE OR REPLACE FUNCTION validate_containment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ck text; pk text;
BEGIN
 SELECT kind INTO ck FROM physical_object WHERE enterprise_id=NEW.enterprise_id AND id=NEW.child_id FOR UPDATE;
 SELECT kind INTO pk FROM physical_object WHERE enterprise_id=NEW.enterprise_id AND id=NEW.parent_id;
 IF NOT ((ck='bottle' AND pk='case') OR (ck='case' AND pk='pallet')) THEN RAISE EXCEPTION 'invalid_containment_kind'; END IF;
 IF EXISTS(SELECT 1 FROM containment WHERE enterprise_id=NEW.enterprise_id AND child_id=NEW.child_id AND valid_from<>NEW.valid_from AND tstzrange(valid_from,valid_to,'[)') && tstzrange(NEW.valid_from,NEW.valid_to,'[)')) THEN RAISE EXCEPTION 'overlapping_containment'; END IF; RETURN NEW;
END $$;
ALTER TABLE metric_observation ADD CHECK(fact_kind IN ('source_actual','constructed_actual','budget','forecast','scenario_plan'));
REVOKE ALL ON seed_manifest FROM eb_app;
