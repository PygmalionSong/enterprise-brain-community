# 分析策略与当前字段上下文

[English](ANALYSIS_POLICY.en.md)

本合同准备有来源的字段上下文，不调用模型、不预留调用额度、不编译/批准/执行业务。模型安装不会自动启用业务分析。PlanningLedger的原IT权限保持，业务字段选择使用独立的默认关闭策略。

当前IT通过 `GET /v1/it/graph/analysis-policy` 查看版本（初始0/disabled），使用当前Origin/CSRF向同一路径POST明确配置：expectedVersion、enabled=true、expectedConfigurationVersion、modelIdentitySha256、roles、rules、maxSelectedBytes、ttlSeconds、policyAcknowledged=true。roles仅operations/executive；每条rule绑定toolId/toolVersion/toolContractHash和获准paths。哈希取现有工具目录条目的canonical/hash，模型身份取私人model-status。规则最多16工具、每工具64路径；策略30–1800秒且不超过当前模型配置期限。关闭仅需expectedVersion、enabled=false、policyAcknowledged=true；不清空模型预算。

当前获准业务会话向 `POST /v1/graph/analysis/context` 提交以下结构，示例ID应换成已保存观察返回值：

```json
{
  "expectedPolicyVersion": 1,
  "observations": [
    {"id":"原观察UUID","expectedVersion":1,"fields":["/rows/0/amount","/rows/0/currency"]}
  ],
  "selectionAcknowledged": true
}
```

最多4份不同原动作的当前观察，每份最多32字段。路径采用[RFC6901字符串转义及具体数组下标](https://www.rfc-editor.org/rfc/rfc6901)，本产品额外限定深度/长度、自有属性和标量，拒绝根整包、URI片段、通配和原型属性。不是完整JSON Pointer功能承诺。精确十进制字符串原样保留；不做金额、单位、币种或期间换算。模型/源端点、命令、凭证路径与未选择数据不自动加入上下文。

重新核对当前业务角色、原观察/回执/工具/来源、原IT授权版本、策略与模型配置。源授权和模型安装文件检查有界等待，期间不持SQL事务；最终事务重新检查全部来源，不能只检查最后一个。模型检查只验证当前本机安装元数据/代码/凭证，不探测可达性或调用模型。上下文整份按UTF8字节计限（默认32768，可配置1024–65536），超限拒绝，不截断源值。

响应含context/contextHash及context.validUntil、preparedOnly=true、analysisAuthorized=false、modelCalled=false、budgetReserved=false、executed=false。每个字段带路径/源值SHA，保留观察/工具合同/原回执/源修订与contentKind。process_metadata不能冒称经营事实；receiptRecordedAt不能冒称实时采样。哈希还绑定当前经办人，不能转给另一账号作为授权。

使用相同请求再加contextHash调用 `POST /v1/graph/analysis/validate`，服务器重新读取权限和来源，验证后仍不授予模型权限。准备接口不另建长期副本；[受控业务推理](BUSINESS_INFERENCE.md)在真正请求/额度预留时持久化冻结快照。不能离线缓存上下文并当作永久授权。本策略层不调用模型；业务推理另走明确请求接口，引用语义/因果效果仍未验证。

策略关闭/到期、模型配置/凭证/代码变化、源或角色变化、观察撤销/过期均使准备失败。错误参数422、越权/未批准字段403、版本/状态变化409、上下文大小413、安装/源授权不可用或策略损坏503。同代码恢复保留策略设置哈希但关闭enabled/递增一次版本；原观察/模型配置及旧会话也按原合同失效。不自动重授或调用模型。参见[有来源观察](BUSINESS_OBSERVATIONS.md)、[私人模型配置](MODELS.md)、[图运行](HOST.md)。
