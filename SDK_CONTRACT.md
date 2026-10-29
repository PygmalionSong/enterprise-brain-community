# Enterprise Brain 企业基座 SDK

[English](SDK_CONTRACT.en.md)

本页描述底座SDK入口。当前仓库还包含独立构造本地经营应用与浏览器案例，见[当前分发范围](PREVIEW_SCOPE.md)。仅SDK入口不会启动这些应用，也不提供模型回退。

需要Node24和pnpm，已验Windows x64/Node24.19.0/PGlite本机合同；Ubuntu源码/原生范围见LINUX_RUNTIME.md；干净宿主与生产TLS证书另列未验；原生模型/工具日常配置见[NATIVE_AGENT_CONFIGURATION](NATIVE_AGENT_CONFIGURATION.md)；原生备份/新库恢复见[NATIVE_BACKUP_RESTORE](NATIVE_BACKUP_RESTORE.md)，其他原生PG17.11分项合同见[NATIVE_SERVICE](NATIVE_SERVICE.md)。执行 `pnpm install --frozen-lockfile --ignore-scripts`、`pnpm build`、`pnpm typecheck`、`pnpm test`。依赖锁保留完整产品的35包集合和全部许可，其中有本子集不使用的库；复制依赖的成绩不代表干净安装。

用 `node scripts/enterprise.mjs init --config ABSOLUTE_NEW_PRIVATE_CONFIG --input ABSOLUTE_PRIVATE_INPUT` 初始化，然后用start/status/stop/backup/restore子命令运维。输入是私人JSON：name、timezone、规范HTTPS origin、后端port、username/password；没有默认密码。凭证不放参数或公开材料。后端只监听127.0.0.1，需运维受信TLS代理；代理密钥不发浏览器。详见[宿主/HTTP/恢复合同](HOST.md)。源码中的start-portable.ps1仅为指纹一致性保留的完整产品启动模板，不是本源码SDK可直接运行的便携启动器。

流程读取支持固定MCP2025-11-25 stdio资源、统一enterprise-brain.process/1、BPMN XML结构子集和OData4.01 JSON实体元数据；实体不自动成为工作流。`node scripts/read-processes.mjs --reference-blueprint --out ABSOLUTE_NEW_PRIVATE_REPORT`读取15域60环节参考骨架，不是实际企业流程。读取CLI的输入路径与报告均留私人目录。

已确认定义/关系可编译为固定排他选路、并行依赖和有序跨流程连接的版本化计划；IT结构确认与业务执行批准分开，超时先查原动作，不盲目重发。显式step或默认关闭的[已批准图委托推进](SUPERVISION.md)，无循环/嵌套/动态数据流。默认安装process.definition.read@v1，只读取已确认定义摘要；其他工具由受信代码实现submit/lookup/权限合同，不能经HTTP随意安装脚本。模型未配置保持明确不可用，不回退到案例推理。

账号变更使旧授权/会话失效；恢复会使全部旧浏览器会话失效而保留图动作UUID。备份为同源码/迁移/锁文件指纹的PGlite离线恢复，不是跨版本升级、在线/大库备份或HA接管。另有独立原生加密备份及同代码新库恢复命令，先关闭普通CONNECT、核对全量内容，再冻结旧会话/模型/批准/后台授权，保留费用与原动作，最终仅准备parked0配置；它不改变上述PGlite合同。原始哈希合同由完整产品两函数逐字提取，没有复制供需构造模型。

本子集Apache-2.0，保留[第三方许可](THIRD_PARTY_NOTICES.md)。这是本地可单独审阅的基础设施子集，不决定未来付费边界，不等于已获远程发布批准或完整驾驶舱地图审查通过。


明确业务分析请求、共用额度、当前来源引用核对及历史读取限制见[受控业务推理](BUSINESS_INFERENCE.md)。


受信DBA的新空专库初始化与准确不重放完成独立于只读adopt，见[原生DBA准备](NATIVE_DBA_PREPARATION.md)。


[原生产品升级候选](NATIVE_UPGRADE.md)操作明确提供的两个完整签名安装，不把本未签名SDK目录当作签名产品；附带发行模块支持核验，本子集不提供完整产品打包资源。
