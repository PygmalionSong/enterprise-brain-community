# 原生部署的异常退出恢复

[English](NATIVE_MAINTENANCE.en.md) · [原生前台](NATIVE_SERVICE.md)

本入口只核对和清理已失效的本机实例/运维声明。它不连接企业数据库、不终止任何进程、不启动服务、不改账号、图、回执、委托或模型额度，也不提供数据库故障接管。仅处理显式 format2 私人配置；原 format1 仍使用原 enterprise.mjs 运维合同。

先运行只读检查，将输出的整个 plan 对象原样保存为私人 JSON；检查报告和恢复输入都不能进入公开仓库：

```sh
node scripts/enterprise-native.mjs inspect-locks --config ABSOLUTE_PRIVATE_CONFIG_JSON
node scripts/enterprise-native.mjs recover-locks --config ABSOLUTE_PRIVATE_CONFIG_JSON --input ABSOLUTE_PRIVATE_PLAN_JSON
```

输入必须是整个 plan 对象，而非整个检查报告或只含 PID 的自制请求。它绑定部署 UUID 和原实例/运维声明的 UUID、PID、准确摘要；声明还绑定完整实际配置哈希。只在两个原进程都不存在、本机端口可绑定、准确计划未变且没有另一恢复声明时删除匹配的失效锁。PID 复用视为仍存活；活进程、占用端口、陈旧计划、配置变化或已有恢复均拒绝。不会按锁龄删除，也不会自动恢复异常遗留的恢复声明；这种情况保留原文件，交由运维核查归属。

recover 返回 started:false 和 processesTerminated:0。恢复后需要运维明确执行 start；仅清理本机文件并不证明远端数据库空闲。start 仍须通过当前描述符 SHA、原生资格、数据库独占归属和遗留连接检查，另一部署持有同库时继续拒绝。不得手动终止未知 PostgreSQL 后端以绕过它。

描述符变化或数据库离线不妨碍本机准确锁恢复；这不放宽 start/activate 的严格描述符检查。图、动作、原回执、幂等键和预算仍保留在原数据库，恢复不会重新批准或重发动作。正常停服仍优先使用 stop。本功能不是原生 pg_dump/pg_restore、跨版本升级、HA、干净宿主或 Linux 的验收证明。


[原生备份与新库恢复](NATIVE_BACKUP_RESTORE.md)另有独立合同；本页的失效锁处理不等于备份任务恢复。
