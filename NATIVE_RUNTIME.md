# 原生运行连接核心

当前源码范围以[Linux运维](LINUX_RUNTIME.md)及[验证记录](README.md)为准；下文连接核心的早期验收排除项只说明当时阶段，不覆盖当前原生备份恢复入口。
[English](NATIVE_RUNTIME.en.md) · [企业宿主](HOST.md) · [原生程序入口](NATIVE_HOST.md) · [实例归属](NATIVE_OWNERSHIP.md) · [架构](README.md)

本页介绍原生数据库连接的检查模块。原生CLI入口见[NATIVE_SERVICE](NATIVE_SERVICE.md)，PGlite使用独立入口。下述核心核对受信部署程序的原生连接前置条件，不是完整原生安装、迁移、备份或恢复通道。保留旧宿主对原生档位的拒绝。只验证了本机Windows PostgreSQL17.11专用回环集群，不声明Linux、其他PG版本或客户生产环境已通过。

`inspectNativeRuntime(database,input)`只读核对已连接PostgreSQL17的预期角色、显式企业和代码迁移清单。登录角色和SET目标eb_app均不得有超级/BYPASS/建库建角色/复制、所有权、数据库CREATE/TEMP、用户schema CREATE、可执行用户SECURITY DEFINER或迁移表写权限（含列级）。要求SET-only成员、必需身份/父行锁权限、父行RLS/FORCE、正常search_path/row_security、明确企业上下文、本企业enterprise父行与完整迁移ID/SHA一致。失败不会修复权限、设置角色/租户或写入记录。输出固定码与迁移数量，始终hostEnabled=false、authorizationGranted=false；数据库错误不返回原文。

`connectNativeRuntime(descriptorFile,expectedMigrations)`只接收规范绝对路径的私人JSON，示意字段：

```json
{"format":1,"host":"db.internal","port":5432,"database":"enterprise_brain","runtimeRole":"brain_runtime","enterpriseId":"11111111-1111-4111-8111-111111111111","passwordFile":"<规范绝对密码文件路径>","tls":{"mode":"verify-full","caFile":"<规范绝对CA证书文件路径>"}}
```

路径占位必须由部署方替换，不把密码写在JSON/URL/命令行。密码文件为1–512字节UTF8，无换行/控制字符；CA文件至多64KiB/8证书，不包含私钥。拒绝未知字段、任意pg选项/URL、间接目录或符号链接。文件访问权由部署方配置操作系统ACL；本程序的路径/类型检查不等于Windows ACL审计。非空PG*环境变量作为冲突拒绝，不使用环境猜测连接参数。

正常档位固定CA与主机名验证、TLS≥1.2；无降级开关。仅自有回环测试可显式用tls={mode:"owned-loopback-test",plaintextAcknowledged:true}且host必须是127.0.0.1或::1；此档位不证明远程明文安全。普通池最多5，宿主归属另用1个稳定客户端；连接3秒、普通语句10秒、锁3秒、事务空闲15秒；只读资格查询局部语句3秒/锁1秒，结束恢复原事务设置。固定pg_catalog/public、row_security=on和描述符中的企业启动上下文；不会执行迁移或加载案例。失败关闭池并返回固定错误，通过才返回受信Database与资格观察；调用者必须close。

资格只反映当时目录/连接，不是持续权限或防管理员变更证明。原始Database和eb_app可设置企业变量，属于受信强能力，不得交给浏览器、任意SQL或模型。企业变量不是不可伪造的跨租户边界；部署程序仍须独立验证专库/专用账号、当前角色与每项业务批准，重连不免除后续业务权限检查。完整原生企业身份/后台路径授权、独立迁移凭证、健康、备份/恢复撤授权、升级和运维互斥尚待集成验收。代码库存清单一致也不证明实际结构/策略未被管理员改动。

失败码：native_runtime_configuration_invalid、native_runtime_environment_conflict、native_runtime_connection_refused；不含密码、主机、角色、企业、路径或原始PG错误。只读资格的详细固定码在NativeRuntimePreflight类型中，不能据此自动授权或自动修复。连接API不经HTTP、CLI或一键安装公开启用。
