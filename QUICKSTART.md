# 快速体验：读取企业流程参考骨架

[English](QUICKSTART.en.md) · [项目首页](README.md)

本路径从当前源码实际运行 MCP stdio 读取器，生成可查看的流程报告。不访问真实企业，不调用大模型，不登记或执行工作流，也不启动经营驾驶舱。

## 1. 准备源码

声明复现环境：Windows x64及Ubuntu24.04 x64、Node 24.19.0、pnpm 11.25.0。Node 版本范围为 24.x；其他版本不在当前声明中。需可用包源连接。把源码解压到一个全新、可写、没有父级 node_modules 的目录，终端进入含 package.json 的目录。

~~~text
node --version
pnpm --version
node scripts/verify-repository.mjs
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm build
~~~

每条命令成功后再执行下一条。库存不匹配时重新取得完整源码，不跳过校验；安装失败时不复制别处依赖，不修改锁文件来冒充通过。库存 SHA 用于检测文件变化，不提供发行者身份认证。

## 2. 生成私人报告

以下 PowerShell 在源码目录的同级新建一个随机私人输出目录；已有文件不会覆盖。报告含参考定义，不应将将来真实企业的同类报告提交到仓库。

~~~powershell
$reportDirectory = Join-Path (Split-Path -Parent (Get-Location).Path) ("eb-reference-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $reportDirectory -ErrorAction Stop | Out-Null
$reportFile = Join-Path $reportDirectory "processes.json"
node scripts/read-processes.mjs --reference-blueprint --out $reportFile
if ($LASTEXITCODE -ne 0) { throw "Process reading failed" }
Get-Content -LiteralPath $reportFile -Raw | ConvertFrom-Json | Select-Object origin, authority, runtimeRegistered, coverage
~~~

读取命令的成功摘要为：

~~~json
{"processes":15,"modeledStages":60,"sourceReadStages":60,"mappedStages":0,"runtimeRegistered":false}
~~~

报告应标识 origin=constructed_reference_blueprint、authority=source_definitions_only，且 coverage.executableStages=0。这证明读取了参考骨架；0 个已映射/可执行环节是预期边界，不能把 60 个读取环节宣传成 60 个系统已接通。若需要再次运行，生成新的输出目录。

Ubuntu可用Bash生成报告：

```bash
report_directory="$(mktemp -d "${TMPDIR:-/tmp}/eb-reference.XXXXXXXX")"
node scripts/read-processes.mjs --reference-blueprint --out "$report_directory/processes.json" && cat "$report_directory/processes.json"
```


## 3. 按目标继续

| 你要做什么 | 下一入口 |
|---|---|
| 理解系统如何协调任务 | [架构与源码定位](ARCHITECTURE_OVERVIEW.md) |
| 建立企业账号与本机宿主 | [HOST](HOST.md)：私人初始化 JSON、规范 HTTPS origin 和受信代理；没有默认密码 |
| 接入自己的流程资源或工具 | [原始 SDK 接口约定](SDK_CONTRACT.md)、[工具接口约定](TOOL_CONTRACTS.md)、[MCP 工具](MCP_TOOLS.md) |
| 配置模型与经营分析 | [模型](MODELS.md)、[分析权限](ANALYSIS_POLICY.md)、[受控业务推理](BUSINESS_INFERENCE.md) |
| 复现测试或报告安装问题 | [安装验证](INSTALLATION_VALIDATION.md) |

源码中的 start-portable.ps1 是完整产品的保留模板，本包不能用它直接启动签名便携产品。不要从本参考报告推断原生 PostgreSQL 服务、真实模型或生产系统已验收。完整能力边界见[预览范围](PREVIEW_SCOPE.md)。


参考读取完成后，继续[首个受控任务](FIRST_TASK.md)，验证实际图执行、响应丢失和独立工作进程重启。
