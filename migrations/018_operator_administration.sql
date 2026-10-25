-- Identity administration is separate from the ordinary connector IT role.
-- 身份管理权限与普通连接器IT角色分离。
CREATE TABLE identity_administrator(
 enterprise_id uuid NOT NULL REFERENCES enterprise(id),principal_id uuid NOT NULL REFERENCES principal(id),
 enabled boolean NOT NULL DEFAULT true,PRIMARY KEY(enterprise_id,principal_id)
);
REVOKE ALL ON identity_administrator FROM eb_app;
