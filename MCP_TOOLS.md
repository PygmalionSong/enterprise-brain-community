# 运维安装MCP图工具

[English](MCP_TOOLS.en.md) · [企业宿主](HOST.md) · [图委托](SUPERVISION.md) · [回执恢复](RECEIPTS.md)

独立企业CLI可在运维明确安装后使用MCP2025-11-25 stdio适配器，复用同一图计划、业务批准、当前权限和原动作回执。不读取旧饮料种子，不配置模型回退。默认只有process.definition.read@v1；HTTP及MCP源文本均不能安装程序。

这是enterprise-brain.graph-tool/1桥接合同，不是任意MCP工具都具有幂等交易能力。[MCP工具规范](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)支持tools/list、tools/call和structuredContent，工具注解不能天然作为权限依据。我们只使用经过本地明确安装的submit/lookup工具；效果及角色由本地安装声明决定，不根据readOnlyHint授予权限。[传输规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)用于stdio消息边界；原流程资源读取档位仍禁止工具调用。

新初始化的私人输入可提供toolInstallationFile绝对路径。现有/恢复部署先stop，再运行 `node scripts/enterprise.mjs tools-status --config ABS_PRIVATE_CONFIG` 得到configurationSha256；`configure-tools --config ABS_PRIVATE_CONFIG --input ABS_PRIVATE_INPUT` 的严格JSON为expectedConfigurationSha256、installationAcknowledged:true、toolInstallationFile（绝对路径，或null卸载）。配置CAS、实例锁/异常锁及共用运维锁均须通过；它不自动停服或启动。完成后start重新加载目录。便携Launch.ps1对应EnterpriseAction与PrivateInput参数。

安装文件为严格JSON：format:1、installationAcknowledged:true、tools数组（1–16）。每项包含id、effect(read/delegated)、roles(executive/operations非空子集)、arguments（业务参数schema）、server（command绝对路径、args数组、可选绝对cwd/timeoutMs）、artifacts（file绝对路径/sha256）和contract。artifacts必须包含命令及运维审核的所有代码，最多8项/工具，所有去重文件总128MiB；脚本及其他运行依赖不能因为命令已签名就省略审核。文件和路径不允许符号链接/间接目录。命令无shell、无继承秘密，只传系统/临时目录环境；这是受信本机程序权限，不是OS沙箱，也不自动提供网络凭证/OAuth。

contract包含format:'enterprise-brain.graph-tool/1'、serverInfo:{name,version}、submit:{name,descriptorSha256}、lookup:{name,descriptorSha256}，名称必须不同。descriptorSha256使用src/runtime/contracts.ts导出的hash（规范JSON/SHA256）对完整tools/list描述对象计算，不是对格式化JSON文本直接sha256。工具版本自动由规范化整个安装声明哈希派生，包含私有路径/代码指纹；配置语义、声明或代码变化须停服重装/重新编译确认旧计划。空白格式变化不改变版本。目录API只返回ID/版本/效果，不返回私人路径或代码。

业务参数只支持严格有界JSON Schema子集：根object、additionalProperties:false、最多32属性、显式required；object/array/string/number/integer/boolean/null及原始值enum。字符串须maxLength≤8192，数值须有限minimum/maximum且不超过安全整数范围，数组须maxItems≤64及items。至多4层/128 schema节点、schema16KiB、参数16KiB。不支持$ref/远程引用/组合/条件/pattern/format/default/自动强制类型，未知关键词拒绝；可选根$schema只能为https://json-schema.org/draft/2020-12/schema。不是完整JSON Schema实现。

每次调用先验证当前角色/授权版本、安装声明及代码SHA，建立独立受限子进程，核对准确协议/serverInfo和两个工具完整描述哈希；元数据等待后再验证当前权限。发送tools/call.arguments={reference,arguments,actor:{enterpriseId,principalId,authorizationVersion,role}}。reference是原动作UUID；submit必须源端幂等，lookup必须只读查询这个UUID。源端仍需自行验证权限/业务状态，不能只信客户端自报角色。

返回必须有structuredContent={reference,state,receiptRef,sourceRevision,data}，符合原graphResultSchema。有效业务状态需稳定回执编号和源修订，原UUID/已知回执必须一致。isError、普通文字、URI或RPC成功不等于业务完成；文字/链接不执行。超时/丢响应保留unknown，后续只查原动作，不盲重发；结束子进程/本机等待不等于撤销外部业务。当前GraphService的2秒调用/授权预算独立于传输timeoutMs，复杂适配器需满足该合同或留人工处理，不能无限等候。

加密恢复仅恢复企业库/策略，不复制安装声明、适配程序或凭证，也不自动重新安装工具；图委托仍禁用。IT停服后明确重装并核对来源/权限，业务再确认委托，不能把恢复出的旧会话/批准当新环境外部授权。当前验证使用独立自有SQLite协议源，不代表真实SAP/Microsoft接通或任意MCP服务器认证。Linux/真实模型/干净宿主按各自状态列示。

正常stdio关闭先结束输入，最多等1秒；必要时终止本次启动的直接子进程，再等1秒实际close，未确认则报错，不能把发出信号当作退出。错误/请求超时会关闭会话并请求终止；这不撤回外部已受理业务。生产图调用两秒等待预算不变，测试文件清理的重试不用于重发业务。
