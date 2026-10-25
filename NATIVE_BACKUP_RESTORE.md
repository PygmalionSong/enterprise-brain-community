# 原生 PostgreSQL 加密备份与新库恢复

[English](NATIVE_BACKUP_RESTORE.en.md) · [原生宿主](NATIVE_SERVICE.md) · [本机锁恢复](NATIVE_MAINTENANCE.md)

这是企业私有化部署的私人运维接口。当前实现限定 Windows x64、Node 24.19.0、PostgreSQL 17.11、专用单企业数据库和受信管理员准备的角色。固定工具清单校验覆盖 `bin/`、`lib/` 全部文件；不从 PATH 寻找程序，不自动下载 PostgreSQL，也不安装系统服务。Linux、干净宿主、大库容量和跨集群角色准备不由本机合同推定通过。

## 备份

原生前台必须正在运行。备份保持原数据库独占归属，持久停放流量、排空原处理后，使用独立只读备份账号打开重复读快照。运行账号仍为非所有者、无 BYPASSRLS 的最小权限账号；备份账号由 DBA 单独准备，必须能够读全库而不是仅看到 RLS 子集，不能拥有写入、DDL 或可达的其他角色权限。

```powershell
node scripts/enterprise-native.mjs traffic-status --config ABSOLUTE_PRIVATE_CONFIG_JSON
node scripts/enterprise-native.mjs backup --config ABSOLUTE_PRIVATE_CONFIG_JSON --input ABSOLUTE_BACKUP_REQUEST_JSON
node scripts/enterprise-native.mjs backup-status --config ABSOLUTE_PRIVATE_CONFIG_JSON
node scripts/enterprise-native.mjs cancel-backup --config ABSOLUTE_PRIVATE_CONFIG_JSON --input ABSOLUTE_CANCEL_JSON
```

`backup` 返回已登记的任务，不代表备份已完成。CLI 退出后由原前台继续执行；只有任务 `completed` 且归档完成清单可认证，才构成可用备份。备份不会自动恢复 active。期间激活、停服和其他冲突运维被拒绝。取消输入为 `{ "id": "当前任务UUID", "expectedVersion": 当前版本 }`，须读取当前状态后提供。

私人备份请求字段：

| 字段 | 合同 |
|---|---|
| `format`、`backupAcknowledged` | `1`、`true` |
| `expectedTrafficVersion` | 当前持久流量版本 |
| `backupDescriptorFile`、`backupDescriptorSha256` | 私人备份连接描述符及其准确 SHA256 |
| `toolManifestFile`、`toolManifestSha256` | 私人工具完整清单及其准确 SHA256 |
| `archiveDirectory`、`keyFile` | 安装树以外的全新归档目录和分离密钥文件；不覆盖 |
| `maxBytes`、`timeoutMs` | 默认 256 MiB、60 秒；上限 4 GiB、300 秒。上限不是已验容量 |

描述符严格包含 `format:1`、`purpose:"enterprise-brain.native-backup"`、`host`、`port`、`database`、`backupRole`、`enterpriseId`、私人 `passwordFile`、`tls:{mode:"verify-full",caFile:...}`。它必须绑定原运行描述符的同一端点、数据库和企业，且账号独立。密码不放命令参数。所有路径为操作系统规范化的绝对路径；JSON 中 Windows 反斜杠须转义。

工具清单为 `format:1`、`platform:"win32-x64"`、`postgresVersion:"17.11"`、规范绝对 `root`、完整 `files:[{path,bytes,sha256}]`。路径相对 root，必须准确覆盖 `bin/`、`lib/` 整棵树，包含 `pg_dump.exe`、`pg_restore.exe`、`libpq.dll`，不接受额外文件、链接或版本冲突。清单及 SHA 应由甲方对官方工具核验后生成，不能只列三个程序便认为依赖已受信。

固定 `pg_dump` 子进程先暂停加入私有 Windows Job，身份持久化后才明确启动。取消、父进程或守护器退出只终止所属进程树。原始 dump 不落盘；输出按 64 KiB 分帧进行 AES-256-GCM 认证加密，密钥单独保存。来源、代码、迁移和运行角色身份受绑定；同一快照的数据及对象/RLS/ACL 摘要在终帧中认证。完成清单刷盘后排他发布，半成品不构成恢复点。需 DBA 保持专用库及序列在备份窗口内稳定；这不是并发 DDL 或其他管理员任意写入下的通用数据库备份协议。

## 新库恢复

```powershell
node scripts/enterprise-native.mjs restore --config ABSOLUTE_NEW_PRIVATE_CONFIG_JSON --input ABSOLUTE_RESTORE_REQUEST_JSON
```

这是一次显式离线命令，不通过老板工作台触发。DBA 先创建全新空目标库，并撤销 PUBLIC、普通角色及运行角色的 CONNECT，只保留指定恢复管理员。目标库由该恢复管理员拥有；当前恢复入口要求明确受信的超级用户 DBA，以保留原对象所有者、RLS 和 ACL。备份中引用的全局角色须预先存在且匹配，不自动建角色、做角色映射或以 `no-owner/no-acl` 绕过。原生运行账号不获得超级用户权限。

恢复描述符字段为 `format:1`、`purpose:"enterprise-brain.native-restore"`、`host`、`port`、`database`、`restoreRole`、`runtimeRole`、`enterpriseId`、私人 `passwordFile` 和 `tls:{mode:"verify-full",caFile:...}`。运行角色与企业必须匹配备份，目标库不能是原库或非空库。另提供一个绑定目标库的正式运行描述符；它仍按 [运行账号合同](NATIVE_RUNTIME.md) 校验。

恢复请求严格包含：

| 字段 | 合同 |
|---|---|
| `format` | `1` |
| `restoreAcknowledged`、`trustedSourceAcknowledged`、`runtimeConnectGrantAcknowledged` | 均明确为 `true` |
| `archiveDirectory`、`keyFile` | 原归档及分离密钥 |
| `restoreDescriptorFile`、`restoreDescriptorSha256` | 私人 DBA 目标描述符及准确 SHA256 |
| `toolManifestFile`、`toolManifestSha256` | 完整受信工具清单及准确 SHA256 |
| `runtimeDescriptorFile`、`runtimeDescriptorSha256` | 目标非所有者运行描述符及准确 SHA256 |
| `origin`、`port` | 规范 HTTPS 来源及新的本机后端端口；仍需甲方 TLS 代理 |
| `workDirectory` | 安装树、归档及配置目录以外的全新私人操作目录，不复用 |
| `maxBytes`、`timeoutMs` | 与备份相同的默认值与边界，整个恢复有总时限 |

先完整认证容器并核对同代码/迁移身份，才允许接触目标数据库；重放时每帧再次认证。普通文件实验容器缺少来源或清单时不能授权恢复。解密完整性不能把不可信 SQL 变安全：只恢复受信源管理员控制的本产品备份，不执行第三方随意提供的 dump。

父连接持有目标数据库归属，固定 `pg_restore` 以单事务恢复到空库。数据输入分帧并有明确 END，父进程退出时即使数据管道被阻塞也会结束所属 Job。SQL 提交后普通 CONNECT 仍关闭；先核对全部内容、迁移、对象、RLS、ACL，再在一个外层事务内使旧会话/未用初始化凭据失效，移除模型安装，停用规划、委托、事件、同步、观察及分析策略，撤销旧执行批准与源授权，最后才向固定目标运行角色授权 CONNECT。

保留原动作 UUID、源回执、幂等键、费用预留和不可变额度档案。未完成模型租约标记 unknown，不补发、不退款、不重置额度。重新批准新工作也不会把新批准替入旧运行。只有真实非所有者 TLS 与宿主所需权限再次通过，才提交全新私人配置；初始 `parked`、版本 0，无模型安装，不自动启动、激活或派发。

## 失败和恢复操作

备份前台异常退出后，先使用 `inspect-backup`，再将完整准确计划作为 `recover-backup` 私人输入；它只核对已退出的原进程、任务和临时凭证，保持停放，不连库、不杀进程、不把遗留归档提升为成功。随后才可按 [原本机锁合同](NATIVE_MAINTENANCE.md) 单独处理失效锁。不能凭时间删除锁或接管另一实例。

恢复操作目录保留逐阶段记录、请求摘要及成功/失败结果，不能复用或自动重试。失败的新库可能为空，或已恢复但仍被隔离；最终配置已经提交后的后续记录失败也会明确记录这一事实，不能按“失败”一词推定可以覆盖目标。DBA 应核对目标权限、原进程归属、私人操作记录和已有配置后再处理。不自动删库、清库、删除失败声明或启动实例。父进程强退可能保留私人临时凭证；需按原任务身份受控处理，不对未知文件做清理。

本接口不构成跨版本迁移、写入后无损回退、HA、任意企业系统备份或正式生产认证。原 PGlite 安装/备份/升级合同保持其独立范围。
