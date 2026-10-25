# 扩展一个源：小型库存读取工具

[English](EXTEND_A_SOURCE.en.md) · [日本語](EXTEND_A_SOURCE.ja.md) · [架构](ARCHITECTURE_OVERVIEW.md)

安装依赖、类型与构建通过后，从这个实验开始。它实现基座实际GraphTool合同和目录，是只读工具合同示例，不单独演练完整批准/运行链；完整路径见[FIRST_TASK](FIRST_TASK.md)。

```powershell
$adapterOutput = Join-Path (Split-Path -Parent (Get-Location).Path) ("eb-adapter-" + [guid]::NewGuid().ToString())
node examples/minimal-adapter/run.mjs --out $adapterOutput --acknowledge-owned-fixture
if ($LASTEXITCODE -ne 0) { throw "Adapter example failed" }
Get-Content -LiteralPath (Join-Path $adapterOutput "report.json") -Raw
```

输出是新的私人同级目录，不接收端点、账号、模型密钥或网络目标。SQLite里是构造库存，保留私人，不能当企业库存。

## 看这三个文件

1. [inventory-tool.ts](examples/minimal-adapter/inventory-tool.ts)：校验参数和源数据、调用传入授权函数、实现submit/lookup，直接复用核心GraphTool和graphResultSchema。
2. [owned-inventory.mjs](examples/minimal-adapter/owned-inventory.mjs)：可替换的源边界。authorize只认本实验构造身份，生产需使用企业当前授权，不可复制夹具身份。
3. [run.mjs](examples/minimal-adapter/run.mjs)：在GraphToolCatalog登记工具，先观察2400箱，再把构造源改为1700箱，重开源库并查原动作。原查询仍返回2400及相同回执，新动作才观察1700。

报告包含两次观察、原回执保留、跨企业拒绝、冲突参数拒绝，并明确fullGraphApprovalExercised=false。查询不存在的动作不生成新观察。当前库存与过去观察是不同事实。

## 第一次修改

可同时修改构造源SKU/数量及runner匹配参数和预期，用新目录运行。然后在InventorySource接口后替换capture/original为获准的读取API。不要让模型参数任意指定端点；保留动作身份/参数绑定和原观察。语义变化时更新工具/源合同版本并复核旧计划。inventory-fixture-v1仅为构造源修订，不是通用源版本策略。

真实写入还需要独立业务批准、源端幂等/查询能力、授权/撤权和结果语义。元数据不安装代码、不授予访问。先读[工具合同](TOOL_CONTRACTS.md)及[MCP安装](MCP_TOOLS.md)。实验通过不代表生产连接器认证。

检查：`node --test tests/minimal-adapter.test.mjs`。不新增依赖、自动上传或遥测。
