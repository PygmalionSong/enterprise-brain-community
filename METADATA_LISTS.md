# 当前授权的记录导航

[English](METADATA_LISTS.en.md)

独立企业宿主提供四个被动GET集合，用于在权限范围内查找已有记录。列表不是新的源数据授权、模型调用或业务执行。企业目标工作区界面尚未接入这些API；这里交付的是导航基础合同。

| 接口 | 当前角色 | 列表范围 |
|---|---|---|
| GET /v1/it/graph/planning/candidates | IT | 同企业候选状态/版本/原责任人、预留输出上限、采用计划引用 |
| GET /v1/graph/analysis/requests | operations/executive | operations仅自身；executive同企业；只含分析状态/版本/原责任人/预留上限 |
| GET /v1/graph/observations | operations/executive | 同上；只含观察身份/源值哈希/活动与过期提示 |
| GET /v1/graph/runs | operations/executive | 同上；只含运行状态/版本/计划批准引用、步数与到期提示 |

这些接口支持limit（十进制1–20，默认20）和cursor，未知或重复查询键拒绝。查询白名单只适用于上述GET集合，不放开原内容、POST、健康、身份或工具接口的查询参数。使用当前会话与原宿主代理合同；GET不需要CSRF，所有既有写入口继续验证CSRF。IT/审阅角色不能通过列表读取业务记录。

响应格式enterprise-brain.graph-metadata-list/1，包含kind/items/nextCursor/limit、sourcePayloadRedacted:true、currentSourceAuthorityChecked:false、modelCalled:false、sourceCalled:false、budgetReserved:false、executed:false。sourcePayloadRedacted表示原数据没有进入列表，不代表已获读取原内容授权。观察项的currentReadAuthorized固定false；已活动/未过期也不是当前源读取凭证。

原目标、参数、上下文、模型正文、源载荷、原回执/源修订、凭证路径和租约ID不进入列表。取完整内容继续使用[宿主合同](HOST.md)和各自原接口，按[字段策略](ANALYSIS_POLICY.md)、[业务推理](BUSINESS_INFERENCE.md)或[历史合同](BUSINESS_HISTORY.md)重新核对当前来源/字段权限。源撤权后导航元数据仍可查看，不能借此绕行取得缓存正文。

分页按数据库created_at与UUID降序，用精确到微秒、公元0001–9999年的UTC时间作位置，避免JS毫秒舍入遗漏。游标有界且绑定企业/当前主体/角色/授权版本/集合种类；角色变化或跨主体复用拒绝。游标是翻页位置，不是不可伪造的访问令牌；SQL始终按当前服务端角色与企业过滤，即使调用者自行构造位置也不能扩大权限。列表为实时视图，翻页期间新增的头部记录在刷新首页后查看，不承诺跨页一致快照。

读取只显示既有状态和租约/期限提示，不终止过期记录、不重新激活观察、不续租、不写审计/业务动作或增加预留。内部投影异常返回503 metadata_projection_unavailable，不返回原行或内部错误；输入/游标格式422、当前授权或游标归属403、无有效会话401。schema保持28，没有新增迁移。对应版本仍须完整回归、独立SDK及实际安装/恢复验证；不把HTTP合同通过当作完整目标交互、生产厂商兼容或AI提效。
