# 受控业务推理与当前来源引用

[English](BUSINESS_INFERENCE.en.md)

schema26在默认关闭的IT分析策略与原有字段选择之上，加入DurableBusinessAnalyzer、BusinessAnalysisResults和独立企业宿主接口。没有默认模型、云路由、工具自动选择、图批准或业务派发。模型仅来自明确安装的本机结构化协议；下游转发由部署方部署决定。中文/英文/日文为请求参数，不能据此宣称真实模型的翻译或业务质量已验证。

业务责任人先准备字段上下文，再POST /v1/graph/analysis/requests，提交idempotencyKey、goal、language、selection、contextHash和analysisAcknowledged:true。selection仍需selectionAcknowledged:true。GET /v1/graph/analysis/requests/by-key/{key}查原请求，GET /v1/graph/analysis/requests/{id}查当前可读结果，POST /v1/graph/analysis/requests/{id}/cancel以expectedVersion取消。所有写入口要求当前业务角色/CSRF/Origin；IT会话不能冒充业务经办人。相同键不会重发或再次扣额，目标/字段/语言改变返回冲突。

持久共用预留先于任何RPC。异步工厂、模型、来源复核处于同一有界等待内，不跨模型等待持SQL事务。工厂前后、回复后重新核对当前来源、角色、策略、原字段SHA、模型配置及代码/凭证。终态落库前后还检查取消/截止守卫，迟到SQL操作回滚结果与审计。请求可为reserved/completed/refused/invalid/unknown/cancelled；取消、超时、用量未知不退款、不自动重发，旧租约不能发布或复活终态。

模型输出先经闭合合同和原字段引用核对，再由宿主复制精确源值、原回执、工具版本、内容类型和时间。结果仍为model-generated/unverified，不证明计算、因果、收益或业务结果。没有执行工具权限。reportedUsage是协议服务自报，actualInvoiceVerified=false，不是费用账单；持久预留按完整输出上限保留，不按自报数字返还。

结果和输出SHA同事务冻结。每次查看都重新核对原请求上下文的当前来源/角色/策略/模型；失效时只返回元数据和analysis:null，不从缓存泄露目标或分析文本。恢复保留已完成结果字节和既有额度，未决请求转unknown；旧会话、模型安装、分析策略及观察确认失效，不自动读结果或续跑。当前读取仍依赖原策略有效期及模型配置；与模型更换/原经办人离职解耦的显式历史只读复核使用独立[历史策略](BUSINESS_HISTORY.md)，不隐式改变旧GET，也不等于完整企业知识生命周期。

当前仅以自有本机HTTP模型协议、独立SQL事实与真实加密恢复核验工程合同，未调用真实企业模型/厂商或证明业务提效。默认流程工具返回流程元数据，经营推理需部署方明确授权的经营只读工具。老板驾驶舱和案例保持原UI，目标输入与洞察呈现尚未接入。全15域60环节设计不代表所有厂商已兼容。[新额度周期](BUDGET_PERIODS.md)保留原预留和未知外部费用；供应商账单与真实模型质量仍未验证；签名产品升级另见[受控升级](UPGRADE_CONTROL.md)，不代表任意版本/厂商上线。


部署边界：026新增结果列并调整既有请求状态/冻结函数。已用自有25快照确认原数据与共用额度保留，但现有保守升级器正确拒绝旧表合同变化（rehearsal_table_contract_changed），影子未启动/切换。当前声明全新26安装与同代码恢复；25→26需要后续显式迁移合同验收，不能当作已通过自动升级或无损回退。


读取边界补充：旧Graph运行HTTP现在只给显式白名单元数据与源值哈希，不能作为缓存源数据或原参数的绕行通道。业务源载荷仍需现有当前授权的观察/推理入口；内部GraphService.view为受信持库程序能力，不直接公开。


历史读取更新：默认关闭、与模型无关的当前授权历史接口见[业务历史](BUSINESS_HISTORY.md)。旧GET仍受原模型策略约束，不隐式放开。


当前授权的候选/分析/观察/运行元数据导航见[列表合同](METADATA_LISTS.md)；这些列表不授原内容或执行权限。
