-- Single terminal result after a current-authority source review;never replay a lease.
-- 当前授权来源复核后只落一次终态结果，绝不重放租约。
ALTER TABLE business_analysis_request DROP CONSTRAINT business_analysis_request_state_check;
ALTER TABLE business_analysis_request ADD CONSTRAINT business_analysis_request_state_check CHECK(state IN ('reserved','completed','refused','invalid','unknown','cancelled'));
ALTER TABLE business_analysis_request ADD COLUMN output jsonb;
ALTER TABLE business_analysis_request ADD COLUMN output_hash text CHECK(output_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE business_analysis_request ADD COLUMN reported_usage jsonb;
ALTER TABLE business_analysis_request ADD CONSTRAINT business_analysis_output_state CHECK((state='completed')=(output IS NOT NULL));
ALTER TABLE business_analysis_request ADD CONSTRAINT business_analysis_output_hash_pair CHECK((output IS NULL)=(output_hash IS NULL));
GRANT UPDATE(output,output_hash,reported_usage) ON business_analysis_request TO eb_app;
CREATE OR REPLACE FUNCTION freeze_business_analysis_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-ARRAY['version','state','lease_id','code','finished_at','output','output_hash','reported_usage']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['version','state','lease_id','code','finished_at','output','output_hash','reported_usage']) THEN
  RAISE EXCEPTION 'analysis_request_immutable';
 END IF;
 IF OLD.state<>'reserved' OR NEW.state='reserved' OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'analysis_request_terminal';
 END IF;
 RETURN NEW;
END $$;
