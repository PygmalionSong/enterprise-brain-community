# 业务分析的持久预留与输出合同

[English](BUSINESS_ANALYSIS.en.md)

本页说明预留核心；schema26的业务推理HTTP、模型调用与持久结果见[受控业务推理](BUSINESS_INFERENCE.md)。AnalysisPolicyService.build/validate继续只准备上下文；withContext是受信宿主在最终来源/角色/策略SQL事务内组合工作的接口，不能从HTTP提交回调或预制上下文。BusinessAnalysisLedger.reserve要求当前业务责任人、明确字段选择及当前上下文SHA、目标、中文/英文/日文语言、幂等键和一次分析确认；IT规划权限不变。

schema25把原经办人/角色/授权版本、请求、原始字段上下文及SHA、策略/模型配置、输出预留、租约和审计在同一事务内冻结。与PlanningLedger共用planning_configuration持久调用/输出上限，没有第二个内存额度池。写入失败回滚全部扣额；相同键重试只返回原记录元数据，不重新取源值、续租、扣额或派发。目标/字段/语言/经办人变化不能复用原键。每企业最多500条请求记录。

预留层处理reserved/unknown/cancelled；schema26结果层扩展completed/refused/invalid，见受控业务推理说明。过期转unknown一次；明确取消采用版本核对。加密恢复将pending租约转unknown、保留上下文和既有额度，原规划费用核对门控继续阻止新调用。SQL触发器和列权限冻结请求/证据/原经办人/预留，终态不能复活。元数据查看不回传目标、源字段、原始上下文或租约能力；当前同企业executive可在原请求人停用后查看及取消，敏感历史结论须走独立的[当前授权历史读取](BUSINESS_HISTORY.md)。

business-analysis-response/1是闭合模型输出合同，包含待补问题或带引用的假设/建议及局限。每个引用只能指向冻结上下文中的具体字段与源值SHA，禁止模型提交“源数值”、执行工具或自证正确。服务端直接填入精确源值和原回执/工具/时间/内容类型；流程元数据保持元数据。引用绑定通过不证明文本语义、计算、因果或提效正确，假设/建议均标记model-generated/unverified，不授予执行权限。此纯合同函数不检查实时权限、不调用模型，不能单独用作历史读取授权。

schema26宿主已接入有界工厂/RPC、当前权限前后复核和持久结果/自报使用量；独立历史当前授权读取见[历史合同](BUSINESS_HISTORY.md)，不宣称真实企业业务提效。参见ANALYSIS_POLICY.md与MODELS.md；默认模型未配置，无自动云路由或真实系统写入。
