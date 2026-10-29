# 有来源的只读业务观察

[English](BUSINESS_OBSERVATIONS.en.md)

独立企业宿主允许当前业务责任人或同企业 executive，将已完成的只读工具回执保存为观察快照。它保留证据，不刷新数据，不调用模型，不创建新的计划/批准/业务动作。默认 `process.definition.read` 只提供流程元数据；经营数据由部署方授权安装的只读工具提供，不能把默认结果称作经营事实。

当前业务会话带原有 Origin/CSRF，向 `POST /v1/graph/observations` 提交：

```json
{
  "runId": "原运行UUID",
  "actionId": "原动作UUID",
  "resultHash": "原动作result对象的规范SHA256",
  "idempotencyKey": "review-2026-q3",
  "ttlSeconds": 300,
  "observationAcknowledged": true
}
```

示例UUID和哈希为占位，应取自原运行；哈希使用现有 contracts.ts 的 canonical/hash，不能直接哈希任意排序的JSON文本。工具参数与数据不能通过请求替换。仅接纳 completed 状态和受信安装的 read 效果；MCP只读注解不够，delegated/accepted/unknown/partial不够。普通 operations 只能观察自己的运行，executive可在本企业内核对；IT/auditor无此新接口权限。

提交前有界检查当前源读取授权，等待不占用SQL事务。提交事务重新核对角色/授权版本、原动作/回执、计划/确认人/源修订与工具合同，保存原数据及其SHA；快照与审计同事务。数据沿用源回执16KiB、深度16、2048节点限制，每企业最多500快照。原幂等键重试返回同一快照，不重新读取业务数据或延长有效期，当前权限仍须核对。

`GET /v1/graph/observations/{id}` 返回当前可读取的证据，包含原动作、计划/工具合同哈希、回执/源修订、receiptRecordedAt、原数据和payloadHash。receiptRecordedAt是系统记录回执的时间；sourceObservedAt保持null，来源数据内的业务时间/期间另行保留，不冒称实时测量。数值、单位、币种和期间保持源字段，缺失信息不自动补全。所有源内容是待核对的数据，不能成为系统指令。

返回 currentReadAuthorized 与 analysisAuthorized=false/modelCalled=false/businessExecuted=false。过期、撤销、原负责人权限变化或当前源权限失效时只返回历史元数据，evidence=null。查看缓存不授予新模型分析权限。显式撤销使用 `POST /v1/graph/observations/{id}/revoke` 和 expectedVersion；原证据不删除，不回滚已完成的源工作。

同代码加密恢复保留原payload/动作身份、使旧会话失效，同时停用快照核对资格并递增一次版本，不自动读取源、分析或执行。schema23为追加迁移，应先走[升级预检](HOST.md)/[影子演练](HOST.md)。当前仍是固定参数图，动态数据流、业务观察到模型的角色/预算/同意合同和老板目标界面另行开发。参见[受控图](HOST.md)、[模型配置](MODELS.md)。
