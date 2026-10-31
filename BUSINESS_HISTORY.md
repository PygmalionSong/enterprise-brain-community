# 业务分析历史读取

[English](BUSINESS_HISTORY.en.md)

已完成分析的历史查阅与模型调用分离。默认关闭，IT必须明确授予当前业务角色、原只读工具版本/接口约定及字段范围。历史读取不依赖模型仍安装、旧分析策略仍有效或原写计划仍可执行。旧权限、旧上下文哈希和缓存输出都不是当前读取授权。

## 接口

IT通过 GET /v1/it/graph/history-policy 查看策略，POST 修改。启用参数为 expectedVersion、enabled:true、roles（operations/executive）、rules（toolId/toolVersion/toolContractHash/paths）、maxSelectedBytes（1024–65536，默认32768）、ttlSeconds（30–1800，默认300）及 historyPolicyAcknowledged:true。最多16工具、每工具64个有界RFC6901路径。禁用只接收版本、enabled:false和明确确认。

业务用户显式 POST /v1/graph/analysis/requests/{id}/history，参数仅为 expectedVersion、expectedHistoryPolicyVersion、historyReviewAcknowledged:true。使用当前会话、Origin和CSRF；IT/审计员不能读取正文。当前原责任人或executive可查阅，executive也须通过源系统当前授权。旧GET不隐式切换至本策略。

## 读取接口约定

逐次核对不可变原请求/经办人上下文/结构化输出/用量哈希、当前读者与授予IT版本、当前只读工具接口约定、原完成动作和全部原选择字段。即使模型只引用其中一字段，也须重新批准全部原字段，避免通过整段正文绕行字段限制。来源authorize做两次有界检查，源IO期间不持SQL事务，最后事务再次核对本地权限、策略和原证据。

读取原SQL回执数据，不调用submit/lookup，不刷新源事实。返回historical/currentReadAuthorized、原来源时间和当前reviewedAt/reviewHash。保留精确十进制字符串、单位和期间。假设/建议仍为unverified；没有验证数学、因果或业务提效，历史结果不等于最新经营事实。reportedUsage仅为原供应商报告，不是账单核对。

明确撤销的观察始终拒绝。过期或恢复挂起的观察可在新的当前授权下只读复核，但不重新激活观察、不续模型租约、不退还/预留额度，不恢复业务执行。恢复关闭已启用历史策略并递增版本一次，保留原输出/证据/用量；旧会话失效，重新启用需要IT明确确认。

源权限撤销、工具版本改变、字段缺失批准、策略过期/停用、当前角色或IT权限变化时整段正文不返回。审计仅记录身份/版本/哈希，不记录正文、目标或字段值。分布式源authorize与本地提交不构成跨系统原子事务；两次检查能发现已观察到的撤权，不承诺来源缺乏版本化授权租约时的瞬时全局撤权。

schema27为新增隔离策略表。同代码加密恢复不等于生产跨版本升级。Windows/PGlite本机测试结果与Linux、真实模型、真实厂商上线分开报告。实际支持范围见[版本说明](PREVIEW_SCOPE.md)。
