# Ubuntu 原生运行与备份恢复合同

[English](LINUX_RUNTIME.en.md)

本页描述此开源技术基座中的Ubuntu运行合同。源码预览不附完整行业产品或签名运行包；源码执行需要运维提供Node24.19.0及锁定依赖。PGlite本地参考案例和原生PostgreSQL企业入口是两种不同路线，不通过更改profile绕过检查。

原生路线的声明环境为Ubuntu24.04 x64、PostgreSQL17.11、systemd255用户管理器、cgroupv2及专用非root账号。管理员明确准备专用数据库、DBA/运行/备份角色、verify-full证书和工具清单。源码不自动安装数据库、修改系统信任、配置用户linger或注册开机服务；没有默认口令。

入口为 `node scripts/enterprise-native.mjs ACTION --config /absolute/private/config.json`，需要请求时另传 `--input /absolute/private/request.json`。prepare/adopt由DBA确认初始化或接管；start/status/stop管理明确配置。备份及恢复请求字段见[NATIVE_BACKUP_RESTORE](NATIVE_BACKUP_RESTORE.md)。账户、口令、证书、配置、备份及工作目录保留在安装外的私有位置，密码不放参数。

受管启动/恢复建立独立systemd用户主单元；固定工作器按任务建立BindsTo子单元，并核验主单元身份、启动代次、cgroup及已捕获内核句柄。未具备这些前提时拒绝，不回退到按记录PID盲目终止。Windows使用独立Job工作器和format1证据，不以Linux字段伪装Windows归属。

Ubuntu工具清单为format2、platform `linux-x64-ubuntu24`、postgresVersion `17.11`，覆盖工具根bin/和lib/全部文件。记录路径、字节数、SHA256与mode；程序为0755，普通库为0644或0755。根目录真实无符号链接、文件由运行账号持有，必需pg_dump/pg_restore/libpq.so.5检查ELFx64和实际版本。新增、遗漏、摘要或权限变化均拒绝。系统共享库属于声明的Ubuntu信任范围，不是任意发行版兼容或敌对同账号隔离承诺。

仅执行固定dump/restore命令，不从PATH寻找程序，不接受任意可执行文件、SQL或参数。就绪前不启动数据库客户端，持久身份确认并明确武装后才执行。数据按有界认证帧处理，未完成输出不是恢复点。取消或主进程退出只影响所属任务；仍需核对完成状态，受理不等于成功。

恢复只接受认证完整的归档以及已关闭普通CONNECT的新空专用目标。SQL恢复、内容核对、旧授权冻结和配置发布分开，最后才授予运行角色CONNECT。连接丢失或提交状态不明时保持隔离并查证，不自动重发、覆盖原库或宣称已回滚。完成后只准备停放配置，重新执行需要明确授权。

异常备份通过inspect-backup生成准确计划，确认原服务/工作器退出后recover-backup结清；不把遗留归档转成成功，不终止记录中的任意PID。签名升级读取Windows format1和Ubuntu format2证据，详见[NATIVE_UPGRADE](NATIVE_UPGRADE.md)。此源码树不是完整签名产品，需要升级时必须明确提供两个完整签名安装。

构造数据和公开协议可验证基础设施，不代表真实甲方、全部厂商版本、真实模型质量、HA、无限容量或生产SLA。具体源码、平台和测试范围以对应版本的实际证据为准。

既有PGlite签名受控迁移/演练路线仍限Windows。原生PostgreSQL备份恢复与原生签名升级合同另列，本次源码更新不宣称Linux PGlite受控迁移已支持。
