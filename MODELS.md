# 私人模型安装与规划接口

[English](MODELS.en.md) · [模型核心](PLANNING_MODEL_CORE.md) · [企业宿主](HOST.md) · [流量控制](TRAFFIC.md)

schema21把模型安装元数据与持久预算放在同一企业事务。默认没有安装，不联系任何模型，不下载模型、不自动路由云端、不回退mock/饮料案例。当前只支持明确的127.0.0.1结构化HTTP协议（Responses或Chat Completions），部署方自行部署模型服务和管理凭证。

停服后执行`node scripts/enterprise.mjs model-status --config ABSOLUTE_PRIVATE_CONFIG`取得部署`configurationSha256`和模型预算`configurationVersion`。当前IT用户登录后GET`/v1/context`取得自己的`principalId`。把以下结构保存为私人文件，替换大写占位值；`tokenFile`可为null，或指向无换行、1–8192个可打印ASCII字符的私人Token文件。不要把Token放入命令参数、Git或此文档。

```json
{
  "action": "install",
  "principalId": "CURRENT_IT_UUID",
  "expectedConfigurationSha256": "DEPLOYMENT_SHA256",
  "installation": {
    "expectedVersion": 0,
    "installationAcknowledged": true,
    "descriptor": {
      "format": 1,
      "dialect": "responses",
      "endpoint": "http://127.0.0.1:8000/v1/responses",
      "model": "YOUR_EXACT_LOCAL_MODEL",
      "tokenFile": null
    },
    "budget": {
      "maxCalls": 30,
      "maxOutputTokens": 1024,
      "outputTokenBudget": 30720,
      "timeoutMs": 30000,
      "ttlSeconds": 1800
    }
  }
}
```

运行`node scripts/enterprise.mjs configure-model --config ABSOLUTE_PRIVATE_CONFIG --input ABSOLUTE_PRIVATE_INPUT`，然后正常start。Windows便携包使用`Launch.ps1 -EnterpriseConfig ABSOLUTE_PRIVATE_CONFIG -EnterpriseAction model-status`或`configure-model -PrivateInput ABSOLUTE_PRIVATE_INPUT`。初始化与其他运维入口不变。活实例、共享运维互斥、错误部署SHA或预算版本都会拒绝修改。配置检查没有RPC；`configured_local_contract`表示配置接口约定通过，不证明模型在线或输出质量。

安装固定代码/协议/配置及凭证摘要。凭证或代码变化后工厂不能继续调用；每次模型RPC前后核对身份，异步检查完成后再查当前IT/配置/流程范围。私人状态入口只接本机控制凭证，拒绝浏览器Origin和代理头；状态/结果不返回Token或私人路径。普通业务用户不能安装或发起IT规划。

独立宿主的IT接口均需当前会话，POST还需规范Origin和CSRF：

- POST`/v1/it/graph/planning/candidates`：`goal,scope,expectedConfigurationVersion,idempotencyKey`。scope见[上下文接口约定](PLANNING_CONTEXT.md)，只允许当前明确选择的流程和工具。
- GET`/v1/it/graph/planning/requests/KEY`：等待期间按原幂等键查候选，关闭连接不会取消请求。
- GET`/v1/it/graph/planning/candidates/UUID`：查看持久候选。
- POST`/v1/it/graph/planning/candidates/UUID/cancel`：`{expectedVersion}`，先落库失效再请求中断。

首次请求在一个受理处理内等待有界模型响应；重复键只查原记录，不再调用。断连不提前扣掉Traffic在途计数，停放会等真实处理完成。超时/取消/未知结果保留调用和最大输出Token预留，模型自报用量另存，不是实际账单。候选completed只表示结构核对完成；不编译计划、不批准或执行业务。采用时仍需当前来源再次核对、显式IT编译和独立业务批准。

卸载输入使用`action:'uninstall',principalId,expectedConfigurationSha256,expectedVersion,uninstallAcknowledged:true`，同样停服执行。卸载/重装保留稳定预算ID及累计预留，不能清零。当前上限180次总调用、8192单次输出Token、1474560累计预留，配置期限至多一小时；这是有界授权，不是无限运营预算。

加密恢复清除安装引用、撤销旧会话、只使规划配置失效一次，并保留预算/候选及`reconciliationRequired`。旧快照无法证明之后的外部费用，普通重装不能解除此封锁。独立[额度周期](BUDGET_PERIODS.md)可由IT停服操作明确关闭旧周期、保留档案并开放新的禁用配置；未知外部费用与未核验账单状态继续保留。真实模型和干净部署方宿主仍未验证；Ubuntu原生PG基础设施范围另见LINUX_RUNTIME.md；本机协议测试不是实际AI、厂商兼容或完整企业脑验收。通用经营工具仍需部署方明确安装和字段授权；老板目标界面尚未接入；完整签名产品升级见[受控升级](UPGRADE_CONTROL.md)，原历史接口约定变化不自动通过，已批准经营展示不变。


明确采用候选生成冻结计划见[候选采用接口约定](CANDIDATE_ADOPTION.md)，采用后仍需独立业务批准，不自动执行。


新增明确的[额度周期](BUDGET_PERIODS.md)：旧预留永久保留于关闭档案，新的配置身份默认禁用；恢复后的操作人声明不等于供应商账单已验证。普通安装仍不能绕过恢复门控。
