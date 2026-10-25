-- Immutable closed local quota periods;never evidence of a provider invoice.
-- 不可变的已关闭本地额度周期，不作为供应商账单证明。
CREATE TABLE model_budget_period(
 enterprise_id uuid NOT NULL REFERENCES enterprise(id),id uuid NOT NULL,
 idempotency_key text NOT NULL CHECK(idempotency_key ~ '^[A-Za-z0-9_.-]{1,100}$'),
 configuration_id uuid NOT NULL,configuration_version integer NOT NULL CHECK(configuration_version>0),
 closed_by uuid NOT NULL REFERENCES principal(id),authorization_version integer NOT NULL CHECK(authorization_version>0),
 operation_hash text NOT NULL CHECK(operation_hash ~ '^[a-f0-9]{64}$'),
 payload jsonb NOT NULL,payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL,
 PRIMARY KEY(enterprise_id,id),UNIQUE(enterprise_id,idempotency_key),UNIQUE(enterprise_id,configuration_id)
);
ALTER TABLE model_budget_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_budget_period FORCE ROW LEVEL SECURITY;
CREATE POLICY enterprise_isolation ON model_budget_period USING(enterprise_id::text=current_setting('app.enterprise_id',true)) WITH CHECK(enterprise_id::text=current_setting('app.enterprise_id',true));
GRANT SELECT,INSERT ON model_budget_period TO eb_app;
CREATE FUNCTION freeze_model_budget_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'budget_period_immutable'; END $$;
CREATE TRIGGER model_budget_period_frozen BEFORE UPDATE OR DELETE ON model_budget_period FOR EACH ROW EXECUTE FUNCTION freeze_model_budget_period();
