# 从初始化到结果查询：独立企业宿主示例

[English](GETTING_STARTED.en.md) · [日本語](GETTING_STARTED.ja.md) · [首页](README.zh.md)

这个示例会创建独立宿主和IT、业务账号，导入样例流程，经业务批准后执行并读取结果。随后重启宿主，再查询原操作。账号和数据均在本地生成，不需要企业账号或模型密钥。

## 准备环境

使用Node24.19.0和pnpm11.25.0，在新的可写源码目录内，先按[快速体验](QUICKSTART.md)校验库存、安装锁定依赖、完成类型检查和构建。示例需要构建后的企业运维模块。以下命令使用PowerShell。

```powershell
$onboardingOutput = Join-Path (Split-Path -Parent (Get-Location).Path) ("eb-onboarding-" + [guid]::NewGuid().ToString())
node examples/enterprise-onboarding/run.mjs --out $onboardingOutput --acknowledge-owned-fixture
if ($LASTEXITCODE -ne 0) { throw "Onboarding failed; inspect the private report and logs" }
Get-Content -LiteralPath (Join-Path $onboardingOutput "report.json") -Raw | ConvertFrom-Json
```

Ubuntu可以直接使用Bash，无需安装PowerShell：

```bash
onboarding_output="$(mktemp -d "${TMPDIR:-/tmp}/eb-onboarding-parent.XXXXXXXX")/run"
node examples/enterprise-onboarding/run.mjs --out "$onboarding_output" --acknowledge-owned-fixture && cat "$onboarding_output/report.json"
```

输出必须是源码之外的全新绝对目录，程序自行创建，不覆盖旧结果。目录中有初始化输入、生成的账号凭证、配置、数据库和宿主日志，整个目录应保持私有。最小报告不包含凭证或本机路径，没有自动上传。文件模式不能代替Windows访问权限配置。

## 按步骤检查

1. CLI初始化一个空企业和IT身份管理员，不安装饮料数据或模型。
2. 宿主在本机端口启动。自有客户端携带此安装的受信代理头和规范HTTPS来源访问本机HTTP后端；示例**没有**启动TLS代理或浏览器会话。
3. IT管理员创建独立业务责任人，导入三个节点的样例定义。示例显式将任务映射到既有参考节点`channel-1`，不自动推断业务映射。
4. IT使用已安装的`process.definition.read@v1`工具编译计划。IT自行批准、没有有效业务批准就执行，均会被拒绝。
5. 业务责任人批准并执行。普通运行记录隐去来源正文；经授权的结果观察接口返回包含三个节点的流程元数据。
6. 宿主停止后由另一个进程启动。重新登录，查询同一个已完成操作。示例最后关闭自己的宿主，保留私人输出。

成功报告包含`status=passed`、`hostStopped=true`、一个已确认流程、一个动作、`resultKind=process_metadata`、`resultNodes=3`及`originalActionRetained=true`。结果是流程定义信息，不是库存、订单或付款。

任一步失败时命令非零退出并保留报告和日志。修正问题后使用新目录，不删除来源记录来冒充恢复成功。程序不终止其他进程，也不接管既有安装。

## 接下来可以尝试

| 目标 | 指南 |
|---|---|
| 从自有HTTP样例读取元数据及获准业务字段 | [首次接入](FIRST_CONNECTION.md) |
| 观察两个流程的响应丢失和恢复 | [首个任务](FIRST_TASK.md) |
| 适配只读库存工具 | [数据源适配](EXTEND_A_SOURCE.md) |
| 配置自己的企业宿主及受信TLS代理 | [宿主配置](HOST.md) |

示例程序通过实际API创建账号和批准任务，不代表人工批准、浏览器登录验收、自动系统发现、厂商适配或生产部署。安装自己的工具仍需明确的受信配置和授权。
