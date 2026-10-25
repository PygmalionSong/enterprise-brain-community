-- Operator-confirmed scope is separate from discovery permission.
-- 操作人确认的读取范围独立于发现授权，旧连接不自动获得确认。
ALTER TABLE connector_connection ADD COLUMN confirmation jsonb;
