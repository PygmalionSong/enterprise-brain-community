-- Private identity state is never granted to business read roles. / 身份私有状态不授予业务读取角色。
CREATE TABLE principal (id uuid PRIMARY KEY, enterprise_id uuid NOT NULL REFERENCES enterprise(id), username text NOT NULL, password_hash text, role text NOT NULL CHECK(role IN ('executive','operations','it','auditor')), disabled boolean NOT NULL DEFAULT false, authorization_version integer NOT NULL DEFAULT 1, UNIQUE(enterprise_id,username));
CREATE TABLE bootstrap_grant (token_hash text PRIMARY KEY, enterprise_id uuid NOT NULL REFERENCES enterprise(id), expires_at timestamptz NOT NULL, consumed_at timestamptz);
CREATE TABLE auth_session (token_hash text PRIMARY KEY, principal_id uuid NOT NULL REFERENCES principal(id), authorization_version integer NOT NULL, csrf_hash text NOT NULL, created_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz);
REVOKE ALL ON principal, bootstrap_grant, auth_session FROM eb_app;
