# 将规划候选采用为冻结计划

[English](CANDIDATE_ADOPTION.en.md)

IT 可以明确采用模型生成且已通过结构核对的候选，无须手工复制工具参数。采用只创建冻结计划；业务批准、工具授权和运行仍由既有图接口独立完成，不额外调用模型或业务源。

在独立企业宿主中，当前 IT 会话带原有 CSRF/Origin，向 `POST /v1/it/graph/planning/candidates/{id}/adopt` 提交：

```json
{"expectedVersion":2,"contextHash":"原候选返回的64位SHA256","adoptionAcknowledged":true}
```

`expectedVersion` 和 `contextHash` 从候选读取结果取得；上例哈希为说明占位。请求不接受 scope、工具、参数或替换后的计划。返回计划 id/version/planHash/taskCount/policy、candidateId、reused，以及明确的 businessAuthorized=false/executed=false。重复原请求返回同一计划，包括首次响应丢失或计划容量已满的情况。它不会再占用一个计划名额。

采用前重建当前流程与工具范围，核对候选原请求/输出、原 IT 经办人、来源确认人、配置和版本。计划、采用记录、候选版本递增及审计同事务提交；失败全部回滚。need_input、取消、未知、失效和过期候选不能采用。当前接口只支持固定参数的受控无环计划，不推定动态业务数据映射。

采用后 GET 候选返回 compiled=true 和 adoption 计划引用，保留原输出。取消候选返回409 planning_already_adopted；需要停用计划时使用原 IT 计划撤销接口，已有运行仍使用原取消/回执合同。配置过期后重复读取采用回执只是查询历史，不能恢复任何批准或执行权限。错误参数422、无权403、找不到404、版本/状态冲突409、计划容量429、映射损坏503。

数据库重启和同代码加密恢复保留候选与计划映射；恢复仍停用模型配置及后台委托、使旧会话失效，不自动采用、批准或派发。schema22为本合同的追加迁移；升级应先按[升级预检](HOST.md)和[影子演练](HOST.md)验证，不直接替换活动实例。

本地自有模型协议与 SQL 源的合同测试不代表真实模型质量、厂商适配或企业提效证明。Linux、真实模型和生产外部系统仍需各自验证。[本地额度周期](BUDGET_PERIODS.md)保留旧预留与未知外部费用；[业务观察](BUSINESS_OBSERVATIONS.md)有独立当前授权合同。供应商账单核验、老板目标界面及正式切换仍未完成。参见[模型配置](MODELS.md)、[规划存储](PLANNING_STORAGE.md)、[受控图运行](HOST.md)。
