-- Explicitly delegated, revocable synchronization; no implicit schedules on upgrade.
-- 明确委托的可撤销同步；升级不自动创建或启用任务。
CREATE TABLE connector_sync_schedule(
 enterprise_id uuid NOT NULL,connection_id text NOT NULL,version bigint NOT NULL CHECK(version>0),
 enabled boolean NOT NULL,interval_seconds integer NOT NULL CHECK(interval_seconds BETWEEN 10 AND 3600),
 principal_id uuid NOT NULL REFERENCES principal(id),authorization_version integer NOT NULL,
 connection_version integer NOT NULL,binding text NOT NULL,next_run_at timestamptz NOT NULL,
 lease_id uuid,lease_until timestamptz,failures integer NOT NULL DEFAULT 0 CHECK(failures>=0),
 state text NOT NULL CHECK(state IN ('idle','running','succeeded','retrying','stopped','suspended')),
 code text,last_started_at timestamptz,last_finished_at timestamptz,
 PRIMARY KEY(enterprise_id,connection_id),FOREIGN KEY(enterprise_id,connection_id) REFERENCES connector_connection(enterprise_id,id)
);
ALTER TABLE connector_sync_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_sync_schedule FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON connector_sync_schedule USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT,UPDATE ON connector_sync_schedule TO eb_app;
