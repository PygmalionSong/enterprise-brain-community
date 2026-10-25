-- Approval authority is versioned; legacy unknown versions fail closed.
-- 批准权限带版本，旧记录未绑定的版本按不确定处理。
ALTER TABLE runtime_approval ADD authorization_version integer;
