# 第一个任务：跨流程执行与故障恢复

[English](FIRST_TASK.en.md) · [快速体验](QUICKSTART.md)

这个示例会读取两个流程，取得业务批准后执行方案，再检查结果。它故意让一个工具在保存操作后退出、不返回响应，用来演示任务如何在重启后查明结果，避免重复提交。示例在本地创建测试数据，不需要企业账号或模型密钥。

## 运行

声明环境：Windows x64、Node24.19.0、pnpm11.25.0。在全新源码目录先按快速体验安装锁定依赖并通过库存、类型和构建。输出必须是源码目录之外、父目录已存在的全新绝对目录，命令自行创建它，不覆盖旧结果。

```powershell
$taskOutput = Join-Path (Split-Path -Parent (Get-Location).Path) ("eb-first-task-" + [guid]::NewGuid().ToString())
node scripts/first-task.mjs --out $taskOutput --acknowledge-owned-fixture
if ($LASTEXITCODE -ne 0) { throw "First task failed; inspect the private phase logs" }
Get-Content -LiteralPath (Join-Path $taskOutput "report.json") -Raw | ConvertFrom-Json
```

`--acknowledge-owned-fixture`明确同意在新私人目录内创建自有企业、构造角色、PGlite状态库及独立SQLite源账本。命令不接收真实端点、账户、密码或模型密钥，也不启动已有工作台。

## 会发生什么

1. 实际MCP stdio读取两个允许的流程定义，分别确认版本/映射，再登记跨流程关系。
2. IT编译固定两动作计划。IT冒充业务批准、缺少有效批准创建运行均被拒绝，且不触发源端动作。
3. 构造业务责任人批准，构造操作人发起运行。受信工具向独立源账本提交第一动作；源端事务已提交后故意退出、不返回响应。运行核心准确保留unknown。
4. 第一工作进程正常关闭企业库并退出。父命令启动另一个全新工作进程，重新打开同一企业库，核对原计划、运行和动作身份。
5. 新进程查询原动作，不重新submit；同键创建仍返回原运行。第二个流程也按原动作核对，最终两动作均完成。

成功报告为status=passed，且checks包含：

| 字段 | 预期 |
|---|---|
| processesRead / processesConfirmed | 2 / 2 |
| crossLinks | 1 |
| actions / receipts / sourceRows | 2 / 2 / 2 |
| submitCalls / lookupCalls | 2 / 2，每个动作各一次 |
| duplicateSubmissions | 0 |
| responseLossObserved / freshWorkerProcess | true / true |
| originalActionRetained / planHashRetained / idempotentRunReused | 均为true |

源端“完成”的只是自有合成检查写入，没有真实订单、采购、库存或付款含义。资源读取与图工具使用独立MCP子进程；SQLite是模拟外部系统的独立账本，不是给产品新增一套存储架构。

## 结果与失败

`report.json`是可审阅的最小报告，仅含一次性runId、发行库存摘要、平台/Node及检查结果；无用户名、主机名、IP、路径、凭证或业务正文，无自动上传。真实企业、实模型、干净宿主和HTTP登录验收字段明确为false。

输出目录另有checkpoint、构造企业库、源账本、代码绑定声明和两份private.log，仅供私人定位，不粘贴到公开Issue或进入发行包。程序接口示例在受信夹具中直接创建角色，不证明浏览器登录/会话或生产身份配置。

失败时命令非零退出并保留failed报告与实际阶段日志；后续阶段不执行。已有目录、缺少确认、相对路径或源码内输出在运行前拒绝。不要手工删除源动作后重跑来冒充恢复；修复前置问题后使用新的输出目录，保留原失败证据。

这不是完整安装、加密备份恢复、原生PG升级、真实厂商适配或模型质量成绩。完整支持范围见[预览范围](PREVIEW_SCOPE.md)，自愿反馈见[安装验证](INSTALLATION_VALIDATION.md)。
