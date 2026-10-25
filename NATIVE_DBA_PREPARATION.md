# 原生专用库 DBA 准备

[English](NATIVE_DBA_PREPARATION.en.md) · [只读接入](NATIVE_DEPLOYMENT.md) · [原生备份恢复](NATIVE_BACKUP_RESTORE.md)

本命令是受信 DBA 一次性基础设施操作，不属于日常 Agent 权限，也不是环境扫描或任意 SQL 执行入口。只处理 DBA 预建的新空专用 PostgreSQL 17 库：普通 CONNECT、PUBLIC 的 CREATE/TEMP 必须预先关闭，运行登录角色预先创建，且非超级、无 BYPASS/建库/建角色/复制/所有权/危险成员权限。受信 DBA 登录必须是专用库所有者及超级账号。拒绝 postgres、模板库、已有 eb_app 角色或存在其他应用数据库的集群，不创建、清空、覆盖或删除数据库，不修改旧迁移。

```text
node scripts/enterprise-native.mjs prepare --config ABSOLUTE_NEW_PRIVATE_CONFIG_JSON --input ABSOLUTE_PRIVATE_REQUEST_JSON
```

配置目标遵守原生部署目录规则，末文件名为 `config.json`。`workDirectory` 是另一个不存在的新私人目录，两者不能互相包含。所有路径绝对且规范化，私人文件不允许符号链接/间接父目录。工作目录保留审计、提交意图、控制器接续及失败证据，不能公开。

初始化请求字段为 `action:"initialize"`、`workDirectory`、`dbaDescriptorFile`、`dbaDescriptorSha256`、`runtimeDescriptorFile`、`runtimeDescriptorSha256`、`initialization`，及 `initializationAcknowledged:true`、`dedicatedDatabaseAcknowledged:true`、`runtimeConnectGrantAcknowledged:true`。`initialization` 包含必填企业 UUID、企业名、币种（CNY/USD/JPY/EUR，默认 CNY）、时区、HTTPS origin、端口、首个身份管理员用户名和密码；不接受工具安装文件。密码只在私人输入文件，不放命令行、数据库准备审计或普通状态输出。

DBA 描述为严格 JSON：`format:1`、`purpose:"enterprise-brain.native-prepare"`、`host`、`port`、`database`、`dbaRole`、`runtimeRole`、`enterpriseId`、`passwordFile`、`tls:{mode:"verify-full",caFile:ABSOLUTE_CA_FILE}`。运行描述沿用原生运行格式，以 `runtimeRole` 登录，没有 purpose/dbaRole。两描述的目标和企业必须一致。准确 SHA 在读取凭证前核对，CA 验证不跳过，PG 环境变量冲突拒绝。运行账号的实际认证探针必须被当前关闭的 CONNECT 拒绝；错误密码不能留到提交后才发现。

28 项未修改迁移、企业父行、单个身份管理员、固定 14 项宿主表权限、schema USAGE、eb_app SET-only 成员、准备审计和最后的 CONNECT 在同一个外层 SQL 事务中。运行角色不会获得 BYPASS、DDL 或全部表授权。提交前私有 fsync 的意图绑定目标集群/数据库、代码/迁移和完整数据/目录/角色权限摘要。写意图失败会回滚；提交响应不明返回 `native_prepare_completion_required`，不能据此认定提交失败并重跑。

提交后另用真实 verify-full 运行连接和原生宿主工厂核对资格，不把 DBA 对象交给宿主。目录发布复用原生 adopt，生成新部署身份、私有令牌、原接入回执及 parked/version0 策略。不会监听、启动、配置模型、安装 MCP、执行后台任务或自动调用模型。`adopt` 本身仍是现有已准备数据库的只读接入。

中断后先用 `action:"inspect",workDirectory` 检查。此动作只读本地文件，返回阶段、控制器是否仍活、`expectedJournalSha256`、`expectedOwnershipSha256`；提交意图不等于成功。`finish` 请求使用同一目录、这两个准确摘要及 `completionAcknowledged:true`。只允许同一主机、原控制器已失效/显式释放的准确接续；活进程、外来/损坏声明、旧观察或超过有界接续容量均拒绝。不会杀进程、按年龄抢占或删除原声明。

finish 要求原输入/凭证/代码一致、提交前意图存在、数据库真实准备审计和完整当前摘要一致。它只核对已提交状态并发布/确认原配置，不重放迁移、创建管理员或授权；数据、ACL、角色、目标身份或审计变化会拒绝，保留现场。原配置必须匹配已记录接入回执、部署字段和 parked0 策略，不能覆盖其他配置。失败暂存保留，新的接入尝试有独立持久身份。数据库提交与文件发布不是一个分布式事务。

没有提交意图或没有对应成功审计的失败工作不能由 finish 猜测成功。请由 DBA 核查原失败证据与目标状态，再准备独立的新请求/目录；本命令不提供自动清库或重放。私有日志不是对抗主机管理员/DBA 篡改的远程证明。原生跨版本升级、干净宿主、Linux、真实模型与地图公开资格另行验收；本合同不宣称这些条件已完成。

已有逻辑复制发布/订阅、默认授权、外部数据包装器、变换、自定义访问方法或public中的排序规则/转换/全文检索对象均不属于本合同的新空库；初始化和finish都会拒绝，不自动删除或修复。
