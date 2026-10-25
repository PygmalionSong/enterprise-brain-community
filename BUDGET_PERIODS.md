# 本地模型额度周期

[English](BUDGET_PERIODS.en.md)

规划和业务推理共用当前周期的本地预留上限。普通配置、模型安装、重启、取消、未知结果或恢复均不返还旧预留。独立周期关闭会保存不可变旧档案，再生成禁用的新配置身份。它是甲方明确授予的新增本地额度范围，不是退款、自动续费、供应商对账或完整费用账本。

## 私人停服操作

先停止实例。使用预算命令：node scripts/enterprise.mjs budget-period --config ABSOLUTE_CONFIG --input ABSOLUTE_PRIVATE_INPUT。Windows便携入口使用 EnterpriseAction budget-period、EnterpriseConfig 和 PrivateInput。相同models运维互斥覆盖启动/备份/恢复等操作；存在运行或陈旧实例锁时拒绝，不能自动抢锁。schema必须current，配置文件SHA必须一致，操作者必须是当前IT。没有浏览器接口或按日期自动更新。

输入为 principalId、expectedConfigurationSha256 和 action。action:inspect 不接受额外字段，返回当前配置版本、snapshotHash、当前预留、已关闭周期数、全部周期的“已知本地预留”及外部费用不确定性。action:close-and-open 另带 period：expectedVersion、snapshotHash、idempotencyKey、reason、newPeriodAcknowledged:true，可选unknownExternalSpendAcknowledged和externalAccountingMaterialSha256。

普通关闭的reason为routine_renewal。恢复门控存在时必须为post_restore_new_allowance，并明确unknownExternalSpendAcknowledged:true、提供会计材料SHA，且本地存在恢复记录。材料SHA只标识操作人引用，不证明材料真实或账单已清偿。旧周期键不能被重新用于另一个周期；重复同一原请求只返回原关闭回执。

## 原子与历史

新schema28仅新增企业隔离的不可变关闭表/函数，不修改原表约束。事务内核对当前角色/配置/完整账本快照，固化原配置ID/版本/限额/次数和输出预留、请求清单摘要及原恢复不确定性，然后将旧reserved变为unknown、去除原租约，删除安装引用、关闭模型相关分析策略，生成新配置ID并递增原版本。新配置disabled，当前计数0只属于新周期。

全部原请求/输入/分析输出/自报用量、动作/批准/已采用计划继续保留。旧键返回旧记录，旧候选不因新周期重新可采用，迟到结果不能占新额度或复活输出。独立历史读取策略不授模型权限，继续受当前源/字段授权保护。之后重新安装模型、指定预算和启用业务分析策略需要各自明确确认。

累计摘要始终合并所有关闭周期和当前周期的已知本地预留，providerInvoiceVerified=false。恢复快照无法证明快照后的外部消费；操作人明确接受后开启新周期也不会消除该不确定性。再次恢复保留不可变关闭档案，并重新关闭当前周期/安装、要求新确认。不同恢复副本或多机不构成全局供应商额度协调。

当前每周期最多180次、单次输出64–8192、输出预留上限1474560；最多200份关闭档案，规划与业务请求各500份全历史容量不因新周期清除。超过容量会拒绝，长期保留/外部账单/多节点协调另行建设。新周期不承诺无限可用或降低费用。对应版本需独立SDK、完整回归、实际CLI/签名安装/恢复验收；旧包不含本能力。Linux/真实模型与生产切换成绩分开报告，未公开发布。

原生format2使用独立[原生周期CLI](NATIVE_BUDGET_PERIODS.md)，同样保留当前IT/快照CAS/不可变历史/未知费用确认，额外要求真实单库归属。上述enterprise.mjs不用于原生部署。
