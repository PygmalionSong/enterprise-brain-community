# 原生 Agent 模型与工具配置

[English](NATIVE_AGENT_CONFIGURATION.en.md) · [原生部署](NATIVE_DEPLOYMENT.md) · [备份与恢复](NATIVE_BACKUP_RESTORE.md)

原生 format2 部署使用 `node scripts/enterprise-native.mjs` 的 `model-status`、`configure-model`、`tools-status`、`configure-tools`。所有命令要求绝对 `--config` 路径；配置命令另需绝对 `--input` 私人 JSON 路径。只操作已准备、已接入的专用 PostgreSQL 数据库；不建库、迁移、GRANT、安装服务或自动启动。旧 format1 命令不变。部署方负责凭证、TLS代理、主机和运维。

模型配置输入：`principalId`、`expectedConfigurationSha256` 与 `action`。`install` 使用既有 `installation` 接口约定：`expectedVersion`、`installationAcknowledged:true`、`descriptor` 和 `budget`；`uninstall` 使用 `expectedVersion`、`uninstallAcknowledged:true`。输入是拥有私人配置的受信本机运维指令，不是用账号 UUID 替代远程登录；操作时重新核对当前同企业 IT 身份及版本。模型仅支持显式本地 Responses/Chat Completions 协议，远端模型应由部署方在本地提供受控兼容网关；不发现模型、下载权重或回退云端。安装不会探测端点或产生模型调用。

停服配置同时持有本机运维声明与实际数据库会话归属。另一目录占库、本机实例锁、未结备份或失效声明均拒绝，不按锁龄接管、不结束其他进程。模型安装沿用原稳定额度身份和事务 CAS：卸载/重装不清除已预留调用或 token，恢复后的未知费用须先走原对账接口约定，普通安装不能解除冻结。安全摘要不输出模型凭证；固定错误码区分版本冲突、预算低于已预留及恢复待对账。运行中的状态读取先核对原生健康、实例和配置锁，再发送仅本机控制令牌。

工具输入为 `expectedConfigurationSha256`、`expectedVersion`、`expectedPolicySha256`、`installationAcknowledged:true`、`toolInstallationFile`。初次安装预期版本为0、策略摘要为 null；安装文件是绝对私人路径，卸载设 null。通过 `tools-status` 获取当前 CAS。受信安装文件沿用固定可执行文件/适配器 artifact SHA、参数子集、角色、效果和 MCP submit/lookup 描述接口约定。模型和业务源文字均不能选择或安装程序；状态和配置只检查文件，不启动 MCP 或访问源端。

工具策略固定存于 `state/native-tools.json`，绑定部署 UUID、原完整配置 SHA、单调版本与安装描述摘要。原 `config.json` 字节不变，已有终结备份的准确配置绑定仍有效。不存在表示默认只读工具；损坏、其他部署、错误摘要或文件漂移拒绝，不删除策略或静默退回默认。卸载不要求旧程序仍可执行。状态不输出私人路径、命令、参数或环境。

原生宿主只在实际单库归属内加载安装目录，加载后再次核对资格。配置过策略的目录版本绑定策略字节；即使装回相同工具也得到新版本，旧计划/批准不因重启或重装继续派发。每次授权及 MCP 元数据握手后再次核对策略、安装和当前角色，失效时不发出新的业务请求。源端受理或响应丢失后，仍按原动作 UUID 查询回执，不能盲目重发。工具安装不授予业务批准；委托与监督仍默认关闭。

新库恢复仍撤销模型、旧批准及外部授权，生成新的 parked0 部署和空 state，不继承源目录工具策略。不包含生产模型成绩、真实企业系统接入认证、Linux 安装或原生跨版本升级证明。检查使用自有构造企业及本机协议时须单独注明，不能视为真实业务效益。

原生恢复后的明确新额度声明参见[原生费用周期](NATIVE_BUDGET_PERIODS.md)，不使用旧format1命令，也不自动启用模型。
