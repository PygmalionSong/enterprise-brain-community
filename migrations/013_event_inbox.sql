-- Signed events are an inbox, never authority to execute source actions.
-- 签名事件仅进入收件箱，不授予源业务动作权限。
CREATE TABLE event_channel(
 enterprise_id uuid NOT NULL, connection_id text NOT NULL, id uuid NOT NULL UNIQUE,
 version integer NOT NULL CHECK(version>0), enabled boolean NOT NULL,
 connection_version integer NOT NULL, binding text NOT NULL,
 principal_id uuid NOT NULL REFERENCES principal(id), authorization_version integer NOT NULL,
 key_ref text NOT NULL,key_fingerprint text NOT NULL,replay_allowed boolean NOT NULL DEFAULT false,
 PRIMARY KEY(enterprise_id,connection_id),
 FOREIGN KEY(enterprise_id,connection_id) REFERENCES connector_connection(enterprise_id,id)
);
CREATE TABLE source_event_inbox(
 enterprise_id uuid NOT NULL, channel_id uuid NOT NULL REFERENCES event_channel(id),
 event_id text NOT NULL, sequence bigint GENERATED ALWAYS AS IDENTITY,
 channel_version integer NOT NULL,body_hash text NOT NULL,envelope jsonb NOT NULL,
 received_at timestamptz NOT NULL,version integer NOT NULL DEFAULT 1,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','acknowledged')),
 replay_count integer NOT NULL DEFAULT 0 CHECK(replay_count BETWEEN 0 AND 3),
 PRIMARY KEY(enterprise_id,channel_id,event_id), UNIQUE(sequence)
);
CREATE INDEX source_event_inbox_page ON source_event_inbox(enterprise_id,channel_id,sequence DESC);
ALTER TABLE event_channel ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_channel FORCE ROW LEVEL SECURITY;
ALTER TABLE source_event_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_event_inbox FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON event_channel USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
CREATE POLICY enterprise_isolation ON source_event_inbox USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT,UPDATE ON event_channel,source_event_inbox TO eb_app;
GRANT USAGE,SELECT ON SEQUENCE source_event_inbox_sequence_seq TO eb_app;

