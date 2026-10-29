# 原生 PostgreSQL 产品升级

[English](NATIVE_UPGRADE.en.md) · [原生前台](NATIVE_SERVICE.md) · [备份恢复](NATIVE_BACKUP_RESTORE.md) · [费用周期](NATIVE_BUDGET_PERIODS.md)

本页描述发行候选的受信本机运维合同。功能验收仍以该发行的准确源码、SDK、便携包及实际升级记录为准。已完成的自有 Windows x64 / PostgreSQL 17.11 验证不能代替干净宿主、Linux、真实模型或任意企业环境验证。这里升级的是产品代码与追加迁移，支持的数据库主版本仍为 PostgreSQL 17；不是数据库主版本升级、HA或多节点切换。

原生 format2 专库使用独立升级入口，不能套用文件数据库的恢复或升级命令。原安装、新安装都必须完整签名并匹配独立固定的发布者指纹；锁文件或运行时档位变化目前拒绝，已应用迁移的编号和校验和不能重写。模型、业务工具和业务用户不获得 DBA 凭证。

## 运维顺序

全部文件参数使用绝对路径，JSON 使用 UTF-8。输入和确认文件保存在安装目录以外的私人目录，不提交 Git。本页升级控制中的 SHA-256 指实际文件字节；日常配置/费用状态摘要沿用各自合同；发布清单摘要指 `RELEASE.json` 中 `manifestText` 的 UTF-8 字节，不是整个外层 JSON。每一步使用新的当前观察，不修改已开始步骤绑定的旧输入。

```powershell
node scripts/plan-native-upgrade.mjs --input PLAN_INPUT --out PLAN_REPORT
node scripts/review-native-upgrade.mjs --input REVIEW_INPUT --out REVIEW_REPORT
node scripts/native-upgrade.mjs backup --input BACKUP_CONTROL_INPUT
node scripts/native-upgrade.mjs stop-source --input STOP_INPUT
node scripts/native-upgrade.mjs inspect --job JOB_DIRECTORY
node scripts/native-upgrade.mjs restore-target --input TARGET_CONTROL_INPUT
node scripts/native-upgrade.mjs commit-target --input TARGET_CONTROL_INPUT
node scripts/native-upgrade.mjs prepare-candidate --input CANDIDATE_INPUT
node scripts/native-upgrade.mjs commit-pointer --input CANDIDATE_INPUT
node scripts/native-upgrade.mjs managed-start --job JOB_DIRECTORY
node scripts/native-upgrade.mjs managed-status --job JOB_DIRECTORY
node scripts/native-upgrade.mjs managed-stop --job JOB_DIRECTORY
```

这些是命令格式，文件名大写部分必须替换为已准备的实际绝对路径。便携包可使用随包 `runtime/node.exe`。规划和运行核对不执行候选代码、不接触 DBA、不迁移、不启停。新备份必须由原来仍运行的前台持有原归属，完成停放、排空和加密备份后，才显式停止原实例；停服后另抢归属不能冒充这份备份。

DBA 明确准备另一个空专库，关闭普通 CONNECT，并提供同一目标的恢复、升级和运行账号描述。控制器不创建、清空或覆盖目标库。恢复前固定真实集群/数据库物理身份；恢复后核对原完整数据、目录和迁移。追加 SQL、迁移记录、撤旧授权、升级审计和最后的 CONNECT 授权处于同一事务；提交前 fsync 准确预期状态。提交后另用真实非所有者 TLS 账号核对运行资格及固定宿主授权。

候选使用新部署身份、新私人令牌和初始 `parked`、版本 `0` 流量策略。暂存目录内先写启动阻挡，再原子发布配置；安装指针提交后只清准确候选阻挡，旧源继续阻挡。`managed-start` 运行实际候选，不自动激活流量或安装模型/工具。后续日常数据、控制令牌和流量变化不再与升级时的旧全库快照比较。状态/停服保留既有控制身份，私人描述漂移不能使正在运行的实例失去受控停服能力；启动仍核对候选描述。

升级日志的 `committed_parked` 固化的是安装选择；之后实际流量由候选的日常流量策略控制。激活使用候选自身的 `enterprise-native.mjs activate` 及准确版本确认，见[原生前台](NATIVE_SERVICE.md)。历史费用、预留及原回执保留；新费用周期和新授权使用[独立确认合同](NATIVE_BUDGET_PERIODS.md)，不因升级获得免费重置。

## 私人输入合同

下表字段对应源码导出的严格 schema；未列出的扩展字段会拒绝。`true` 确认必须由部署方授权运维明确提供。

| 文件 | 必需内容 |
|---|---|
| 规划输入 | `format: enterprise-brain.native-upgrade-plan-input/1`；`currentRoot`、`candidateRoot`、`publicKeyFile`、`pinnedFingerprint`、`currentConfigFile`；`expectedConfigurationSha256`、`expectedCurrentManifestSha256`、`expectedCandidateManifestSha256`；`planningAcknowledged: true` |
| 运行核对 | `format: enterprise-brain.native-upgrade-runtime-review-input/1`；`planningInputFile`、`planFile`、`expectedPlanSha256`；`runtimeReviewAcknowledged: true` |
| 新备份控制 | `format: enterprise-brain.native-upgrade-backup-input/1`；`runtimeReviewInputFile`、`runtimeReviewFile`、`expectedRuntimeReviewSha256`、`backupInputFile`、`expectedBackupInputSha256`、`expectedSourceInstanceId`、`jobDirectory`；`freshBackupAcknowledged: true`。原备份输入见[备份恢复](NATIVE_BACKUP_RESTORE.md) |
| 停止原源 | `format: enterprise-brain.native-upgrade-stop-input/1`；`jobDirectory`、`expectedHeadSha256`；`sourceStopAcknowledged: true` |
| 目标请求 | `format: enterprise-brain.native-upgrade-target-request/1`；`restoreDescriptorFile/Sha256`、`upgradeDescriptorFile/Sha256`、`runtimeDescriptorFile/Sha256` 三组完整字段；`maxMs`；`targetRestoreAcknowledged`、`migrationAcknowledged`、`authorityFreezeAcknowledged`、`runtimeConnectGrantAcknowledged` 均为 `true` |
| 目标控制 | `format: enterprise-brain.native-upgrade-target-control/1`；`jobDirectory`、`expectedHeadSha256`、`expectedOwnershipSha256`、`targetRequestFile`、`targetRequestSha256`；`sourceMaintenanceAcknowledged: true`。完成中断步骤另加 `interruptedCompletionAcknowledged: true` |
| 候选及指针 | `format: enterprise-brain.native-upgrade-candidate-input/1`；`targetControlInputFile`、`targetControlInputSha256`、`configurationFile`、`origin`、`port`；`configurationAcknowledged`、`installationPointerAcknowledged` 均为 `true`。中断完成另加 `interruptedCompletionAcknowledged: true` |
| 仅源控制 | `format: enterprise-brain.native-upgrade-source-control/1`；`jobDirectory`、`expectedHeadSha256`、`expectedOwnershipSha256`；`sourceMaintenanceAcknowledged: true` |

`restoreDescriptorFile/Sha256` 是表格缩写，实际键为 `restoreDescriptorFile` 与 `restoreDescriptorSha256`，其余同理。恢复描述的 `purpose` 为 `enterprise-brain.native-restore`、DBA 字段为 `restoreRole`；升级描述为 `enterprise-brain.native-upgrade`、DBA 字段为 `upgradeRole`。三份描述的目标地址、数据库、企业、运行角色及 verify-full 模式必须一致，恢复/升级 DBA 角色相同；运行描述使用原有[运行连接 schema](NATIVE_RUNTIME.md)。密码与 CA 通过私人文件引用，不写进这些控制文件或终端命令。

`inspect` 只读返回当前 `headSha256`、`ownershipSha256`、pending 操作、原生产者和保守提交标记，不读凭证、不连接库。终止文件存在时只报告 `present_unverified` 及摘要，不能据此宣称放弃或源释放已经成功。它不会清锁、按时间抢锁或自动重试。

## 中断完成与显式放弃

```powershell
node scripts/native-upgrade.mjs finish-target --input TARGET_CONTROL_INPUT
node scripts/native-upgrade.mjs finish-candidate --input CANDIDATE_INPUT
node scripts/native-upgrade.mjs finish-pointer --input CANDIDATE_INPUT
node scripts/native-upgrade.mjs abandon --input ABANDONMENT_INPUT
node scripts/native-upgrade.mjs abandon-target --input RESTORED_ABANDONMENT_INPUT
node scripts/native-upgrade.mjs finish-abandonment --input ABANDONMENT_INPUT
```

新控制器必须确认原生产者实际退出，核对准确 checkpoint、物理目标、worker 身份及实际状态。不重复 `pg_restore` 或追加 SQL。完整原恢复点可只读完成；实际空回滚目标不能冒充恢复成功。缺少或变化的 worker 身份、活动子进程、未知目录或无法证明的数据库状态保持阻挡，不能放宽校验强行完成。

派发前 `abandon` 输入为 `format: enterprise-brain.native-upgrade-abandonment-input/1`、`sourceControlInputFile`、`sourceControlInputSha256`、`abandonmentAcknowledged: true`。已恢复但未提交，或已退出 worker 的恢复 pending 步骤，使用 `abandon-target`：`format: enterprise-brain.native-upgrade-restored-abandonment-input/1`、`targetControlInputFile`、`targetControlInputSha256`、同一明确确认。必须独立证明目标仍是准确原恢复点，或仅在恢复 pending 阶段证明目标已完整回滚为空、仍关闭 CONNECT；“没有提交回执”本身不是证明。

放弃声明落盘后中断，`finish-abandonment` 在上述仅源输入之外提供准确 `abandonmentSha256` 和 `interruptedCompletionAcknowledged: true`，再次核对原源及目标后仅释放准确源阻挡，不启动原源、不改目标数据。同一 job 永不重用；已释放后的正常原源业务不与旧快照比较。实际升级已提交、已有数据库完成回执或安装指针时禁止释放旧源，只能前向核对/修复，不自动回滚或恢复旧批准、会话、模型与费用额度。
