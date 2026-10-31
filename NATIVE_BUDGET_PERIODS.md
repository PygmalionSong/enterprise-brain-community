# 原生模型额度周期

[English](NATIVE_BUDGET_PERIODS.en.md) · [周期存储接口约定](BUDGET_PERIODS.md) · [原生日常配置](NATIVE_AGENT_CONFIGURATION.md)

原生 format2 部署使用独立的私人停服命令：

```text
node scripts/enterprise-native.mjs budget-period --config ABSOLUTE_PRIVATE_CONFIG_JSON --input ABSOLUTE_PRIVATE_INPUT_JSON
```

旧 `scripts/enterprise.mjs budget-period` 只适用于 format1。不能互换，也不能把数据库连接串或密码放到命令行。原生入口复用既有周期核心、稳定预留账本和严格运行连接，不迁移、不增加权限、不授予BYPASS、不使用DBA对象处理日常额度。

输入包含 `principalId`、`expectedConfigurationSha256` 和 `action`。配置摘要来自当前模型/工具状态，身份必须是当前同企业IT。`inspect` 只读取已存在的额度周期；未配置不会自动创建预算。返回当前 `version`、`snapshotHash`、当前调用/token预留、已关闭周期数、全部周期的已知本地预留和外部费用不确定性，不含模型端点、凭证、请求正文或供应商账单。

`close-and-open` 另带 `period`：`expectedVersion`、`snapshotHash`、`idempotencyKey`、`reason`、`newPeriodAcknowledged:true`。普通周期使用 `routine_renewal`。恢复后必须使用 `post_restore_new_allowance`，明确 `unknownExternalSpendAcknowledged:true` 并提供 `externalAccountingMaterialSha256`；成功恢复的同企业数据库审计也必须存在。支持旧 `enterprise_restored`、原生 `native_enterprise_restored` 和真实产品升级 `native_enterprise_upgraded` 类别；失败记录或只有本地文件不构成恢复/升级身份。升级后的新周期仍使用兼容原因名 `post_restore_new_allowance`，档案的 `restoreId` 可引用真实升级审计ID，不伪造恢复事件。材料摘要只是操作人声明的引用，`providerInvoiceVerified` 仍为 false。

检查和关闭均持有 models 本机互斥，要求停服、无未结备份并取得真实单库归属。另一目录正在使用该库、运行/陈旧锁、配置变化、失效身份、版本/快照冲突均拒绝；不能凭锁龄接管。提交前丢失归属或配置变化回滚事务。损坏档案或账本不一致返回固定错误码，不能忽略或自动重写历史。

关闭将原周期、请求清单摘要、调用/token预留、未知费用状态及恢复身份固化到不可变档案。原请求、分析、动作及回执保留；新周期使用新的配置ID，计数0只属于新周期，累计摘要继续包含旧预留。旧 pending 请求转为 unknown，旧租约失效；模型安装引用删除、相关分析策略关闭。新周期的预算和模型默认关闭，不放行旧批准、重放任务或自动产生调用。

相同经办人/版本的原幂等请求返回同一关闭回执；换材料、原因或权限版本不算同一操作。操作人随后必须另行明确安装模型及设置预算。安装和正常重启均不自动调用模型；以后再次恢复会保留已关闭历史，并再次冻结当前额度。

该本地账本不等于供应商账单、多机全局费用协调或退款。不同恢复副本无法证明快照后的真实消费，明确接受未知费用也不消除不确定性。每周期及历史容量边界沿用原周期接口约定。Linux、实模型、干净宿主和原生跨版本升级分别验收；不从本机协议推断模型质量或业务收益。
