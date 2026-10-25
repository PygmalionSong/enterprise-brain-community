-- Product case-state permission enables row locking, never source-ledger updates.
-- 仅产品案件状态权限用于行锁，不授予源账本写入。
GRANT UPDATE(state) ON case_file TO eb_app;
CREATE FUNCTION runtime_plan_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.content IS DISTINCT FROM NEW.content OR OLD.args_hash<>NEW.args_hash OR OLD.evidence_hash<>NEW.evidence_hash OR OLD.constraint_hash<>NEW.constraint_hash OR OLD.policy_version<>NEW.policy_version OR OLD.expires_at<>NEW.expires_at THEN RAISE EXCEPTION 'plan_content_immutable';END IF;RETURN NEW;END $$;
CREATE TRIGGER runtime_plan_guard BEFORE UPDATE ON runtime_plan FOR EACH ROW EXECUTE FUNCTION runtime_plan_immutable();
CREATE FUNCTION runtime_action_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.args IS DISTINCT FROM NEW.args OR OLD.args_hash<>NEW.args_hash OR OLD.idempotency_key<>NEW.idempotency_key OR OLD.plan_id<>NEW.plan_id OR OLD.plan_version<>NEW.plan_version OR OLD.expected_source_version<>NEW.expected_source_version THEN RAISE EXCEPTION 'action_content_immutable';END IF;RETURN NEW;END $$;
CREATE TRIGGER runtime_action_guard BEFORE UPDATE ON runtime_action FOR EACH ROW EXECUTE FUNCTION runtime_action_immutable();
CREATE FUNCTION runtime_run_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.goal IS DISTINCT FROM NEW.goal OR OLD.principal_id<>NEW.principal_id OR OLD.authorization_version<>NEW.authorization_version OR OLD.agent_id<>NEW.agent_id OR OLD.agent_version<>NEW.agent_version OR OLD.policy_version<>NEW.policy_version OR OLD.model_profile<>NEW.model_profile THEN RAISE EXCEPTION 'run_definition_immutable';END IF;
 IF OLD.state IN ('succeeded','partially_succeeded','failed','cancelled') AND (NEW.state<>OLD.state OR NEW.summary IS DISTINCT FROM OLD.summary) THEN RAISE EXCEPTION 'terminal_run_immutable';END IF;RETURN NEW;END $$;
CREATE TRIGGER runtime_run_guard BEFORE UPDATE ON agent_run FOR EACH ROW EXECUTE FUNCTION runtime_run_immutable();
