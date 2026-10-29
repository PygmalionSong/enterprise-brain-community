# 原生前台与私人运维入口

[English](NATIVE_SERVICE.en.md) · [接入配置](NATIVE_DEPLOYMENT.md) · [程序宿主](NATIVE_HOST.md) · [会话归属](NATIVE_OWNERSHIP.md)

`scripts/enterprise-native.mjs`仅处理明确的原生format2配置。部署方DBA须先准备专用PG17企业库、运行账号/权限和有效身份管理员；接入输入与固定SHA见接入配置合同。下列接入/启动/控制操作不迁移、GRANT、建账号、扫描网络或创建演示数据，不回退到DATABASE_URL或原PGlite入口。

构建后，在安装根使用随包Node或声明的Node24运行；下列大写名称为私人绝对文件路径，不是把密码放进参数：

```sh
node scripts/enterprise-native.mjs adopt --config ABSOLUTE_NEW_PRIVATE_CONFIG_JSON --input ABSOLUTE_PRIVATE_ADOPTION_JSON
node scripts/enterprise-native.mjs start --config ABSOLUTE_PRIVATE_CONFIG_JSON
node scripts/enterprise-native.mjs status --config ABSOLUTE_PRIVATE_CONFIG_JSON
node scripts/enterprise-native.mjs traffic-status --config ABSOLUTE_PRIVATE_CONFIG_JSON
node scripts/enterprise-native.mjs activate --config ABSOLUTE_PRIVATE_CONFIG_JSON --input ABSOLUTE_PRIVATE_TRAFFIC_JSON
node scripts/enterprise-native.mjs park --config ABSOLUTE_PRIVATE_CONFIG_JSON --input ABSOLUTE_PRIVATE_TRAFFIC_JSON
node scripts/enterprise-native.mjs stop --config ABSOLUTE_PRIVATE_CONFIG_JSON
```

首次接入parked0。流量输入严格为 `{"expectedVersion":0,"waitMs":1000}`；使用traffic-status返回的当前版本，每次状态改变递增，陈旧版本拒绝。离线只能park；activate必须有已就绪的原实例，且描述符SHA仍匹配。start为前台进程，部署方运维负责进程托管/受信HTTPS反代/证书；后端仅127.0.0.1。信号走同一排空关闭，不杀其他PID。首次启动轮换本机控制令牌，代理令牌始终由私人反代配置读取，不能发送到浏览器。

status/stop/park不依赖当前描述符仍存在；完整私人配置哈希、实例UUID、进程和健康响应身份必须一致。只接受原生数据库/归属/流量的有界健康合同，不向其他profile或错误实例发送控制令牌。实际失去数据库归属后，健康快速返回unavailable/schema unavailable，不等待SQL或伪称上次schema仍current。正常停服先停泵/受理、最多原5秒排空真实在途处理，再关HTTP/归属/池并删除本次实例锁；断开的客户端仍计数。停服不改变持久重启策略；失败保留可核对状态，不凭锁龄抢占或自动删除陈旧锁。异常退出后使用[准确锁检查与恢复](NATIVE_MAINTENANCE.md)，只清理确认失效的本机声明，不接管数据库。

图、身份、CSRF和业务批准共用原核心；后台委托仍默认关闭，必须明确批准/委托且当前代码/工具/经办人权限一致。start加载显式登记且当前身份仍匹配的本机模型，加载发生在数据库归属取得后，之后重新检查资格/工作负载权限/归属。没有安装不回退mock，不在启动时调用模型。[原生日常模型/工具CLI](NATIVE_AGENT_CONFIGURATION.md)在停服/实际归属内复用现有合同，工具策略用独立版本侧文件且不改部署配置；不要把旧PGlite configure-model命令用于原生配置。

规划原经办人元数据在父记录共享锁取得后经租户读取事务预取；该独立事务不锁经办人、不写数据，完整当前授权/原动作/额度门控继续在实际事务检查，不给运行登录账号增加planning_candidate直接权限。正常重启与数据库实际重启保留原动作、结果和预留；重试原幂等键不增加调用。自有协议模拟不验证模型语义或业务提效。

独立[原生加密备份/新库恢复](NATIVE_BACKUP_RESTORE.md)保持原前台归属并先隔离目标CONNECT，恢复核对后同事务冻结旧授权/未知费用，仅准备parked0配置；该显式DBA恢复操作才会授予固定目标运行角色CONNECT。DBA准备与签名原生升级已有独立命令和验收范围，见[NATIVE_UPGRADE](NATIVE_UPGRADE.md)；当前 Linux 实测是同 schema28 的代码升级，不是数据库大版本迁移。HA未交付。旧文件备份/恢复/受控升级只适用各自已声明的PGlite合同。Windows自有PG17.11/TLS不等于干净宿主、Linux或生产证书；本机候选未获公开发布或地图许可，消费行业驾驶舱与独立企业入口分别使用。


指纹兼容：已核对的旧安装早于原生服务模块时，保留其原CLI清单/准确指纹；包含原生服务模块的新安装必须校验enterprise-native.mjs，修改会改变指纹、删除会拒绝，不接受新版漏脚本或任意未签名代际。
