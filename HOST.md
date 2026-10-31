# 独立企业宿主与本机运维

当前身份校验后请求的企业父行锁，必须实际取得且只对应目标企业一行；零行/错行会拒绝，不能将SQL没有异常当成已加锁。原UPDATE/SHARE模式及先身份、后企业的顺序保持不变，CSV仍只在原有配额写入路径锁父行。守卫不自动改变连接上下文或提权；原生账号的登录默认上下文不是授权凭证，受信原始数据库能力可以选择其他上下文。当前企业宿主仍只启用PGlite，原生凭证/TLS/运维需单独集成验收。

[English](HOST.en.md) · [账号权限](src/identity/operators.ts) · [图运行](src/runtime/graph-http.ts)

新增入口 `scripts/enterprise.mjs` 使用独立私人配置和企业库，不调用演示入口，不加载饮料案例、HTTP/SQL构造源、mock模型或演示会话。原Start-Local与经营驾驶舱仍是独立的参考案例。企业宿主提供三语登录/账号管理、身份API、流程登记与受控图计划；空企业业务工作区明确尚未配置，不返回旧案例或静默回退数据。

当前声明范围为Windows x64、Node24.19.0、PGlite单进程本机后端及受信HTTPS代理接口约定。本机TLS/CLI/恢复验证不证明干净宿主、原生PG、生产证书、企业网络/高可用或SSO/MFA已验。后端只绑定127.0.0.1；模型未配置时明确not_configured，不退回mock。默认安装工具仅 `process.definition.read@v1`，读取经确认的流程版本摘要；其他业务动作需受信安装代码提供工具，HTTP不能任意安装脚本或端点。

## 初始化与启动

先构建。以下ABSOLUTE参数需替换为企业私人目录的真实绝对路径；凭证不得作为命令参数。安装副本可直接用包内 `runtime/node.exe` 执行相同入口。

```text
node scripts/build.mjs
node scripts/enterprise.mjs init --config ABSOLUTE_NEW_PRIVATE_CONFIG --input ABSOLUTE_PRIVATE_INPUT
node scripts/enterprise.mjs start --config ABSOLUTE_PRIVATE_CONFIG
node scripts/enterprise.mjs status --config ABSOLUTE_PRIVATE_CONFIG
node scripts/enterprise.mjs stop --config ABSOLUTE_PRIVATE_CONFIG
```

Windows便携包的原生入口先核对签名、运行时与全文件，再运行企业通道：`Launch.ps1 -EnterpriseConfig ABSOLUTE_PRIVATE_CONFIG`。初始化加`-EnterpriseAction init -PrivateInput ABSOLUTE_PRIVATE_INPUT`；状态/停服/备份使用对应EnterpriseAction；恢复另传EnterpriseArchive/RecoveryKey文件路径。未传EnterpriseConfig时仍为参考演示，两个通道不混用。

私人输入是JSON，包含name、timezone（有效IANA时区）、origin（无尾斜杠的规范HTTPS来源）、port（本机后端1024–65535）、username、password；可选enterpriseId及currency（默认CNY，另支持USD/JPY/EUR）。使用自己的强密码，至少14个Unicode码点且最多72个UTF-8字节。没有默认密码或示例凭证。输入文件由运维妥善保管/处理，命令不打印密码内容；它不会替运维删除原输入。

首次初始化只接受新配置/新state目录，生成独立企业、首个IT身份管理员和私人密钥文件。已有配置不覆盖；失败后遗留的私人目录应核对后处理，不能用旧企业数据冒充新初始化。配置、代理密钥、控制密钥、数据库和备份留在私人目录，不进入Git或公开包。文件mode不等于Windows ACL设置，部署方应将目录限制为运行账号/管理员可访问。

start以前台进程运行，写入PID/端口/实例UUID/部署UUID及配置SHA。重复启动核对实际健康身份；不匹配、端口占用、陈旧锁、路径间接跳转或错误密钥均拒绝，不杀同名/同端口进程。正常停止先核对实例健康和锁，再发送私人控制密钥；每次新启动轮换控制密钥，代理密钥保持稳定。

启动、停服、备份共用operation.json互斥声明，冲突立即拒绝，不排队或按锁龄接管。备份从核对/停服到归档加密完成始终持有声明，防止另一命令中途重启。异常退出后，先运行`node scripts/enterprise.mjs inspect-locks --config ABSOLUTE_PRIVATE_CONFIG`，将输出中的plan对象保存为私人JSON并核对部署、实例/运维UUID、PID、SHA。再运行`node scripts/enterprise.mjs recover-locks --config ABSOLUTE_PRIVATE_CONFIG --input ABSOLUTE_PRIVATE_PLAN`。便携入口对应EnterpriseAction为inspect-locks/recover-locks，后者配PrivateInput。

恢复要求计划与当前全部声明完全相同、原PID均不存在、配置端口可独占绑定；活进程、PID复用、端口占用、计划变化或另一次恢复均拒绝。只移除准确的失效声明，不终止进程、不打开数据库、不启动服务。恢复声明lock-recovery.json存在时禁止所有启动/停服/备份；它自身若异常遗留也不自动窃取，应先确认无运维进程并保全私人目录，交由受控人工处理或已验同代码备份恢复。该协议仅约束遵守入口的本机进程，不是HA或任意外部程序的数据库锁。

## TLS与界面

健康就绪由本安装完整、有序的SQL迁移编号和SHA清单驱动，不写死schema数量。初始化/启动先拒绝断档、非SQL、间接文件或超限清单，再迁移。/health返回实际schema、expectedSchema与schemaState(current/mismatch/unavailable)；编号/校验和漂移或元数据查询失败均503，实例身份仍可供本机运维核对。正常代理流量也被拒绝，不新建登录会话或派发流程动作。

status明确报告unavailable；不把降级当成新实例启动。stop只在应用/enterprise模式/实例UUID及HTTP状态与响应状态一致时接受健康503，再发送私人控制密钥。其他端口/实例、伪造状态或其他HTTP错误收不到控制密钥。这个能力允许停止已核实的降级实例，不自动修复数据或证明备份能够修复损坏。

企业TLS代理终止HTTPS，并向本机后端转发。后端Host须为127.0.0.1:后端端口或localhost:后端端口；代理覆盖X-EB-Proxy为私人proxy-token文件的内容，不能信任客户端同名头。不要把该值放入浏览器、公开配置或日志。代理对外拒绝/health、/ops/和/_dev/路径；只有本机运维访问健康/停服。后端不信任Forwarded/X-Forwarded的租户、角色或来源。

浏览器从规范origin进入根路径，未登录跳转/login，身份管理员进入/console，其他账号进入/workspace。会话使用__Host-eb_session、Secure/HttpOnly/SameSite=Strict，写请求核对规范Origin与CSRF。登录有进程内全局/账号失败上限及并发限制；不等于分布式风控。中文/English/日本語共用代码，响应式登录与账号目录；语言偏好不含秘密，存储不可用时仍可工作。老板的参考驾驶舱不嵌入本身份后台。

| API | 接口约定 |
|---|---|
| POST /v1/identity/session | username/password；TLS规范Origin、JSON、受限登录；返回CSRF和Secure Cookie |
| GET /v1/context | 当前账号、角色、授权版本与新CSRF |
| POST /v1/identity/logout | 空对象、当前会话/CSRF；撤销会话并清Cookie |
| GET/POST /v1/identity/operators | 独立身份管理员列表/创建；普通IT无权 |
| POST /v1/identity/operators/{id}/change | expectedVersion、changes(role/disabled/identityAdministrator) |
| POST /v1/identity/operators/{id}/password | expectedVersion、password |
| POST /v1/identity/operators/{id}/revoke-sessions | expectedVersion |
| /v1/it/process-registry、/v1/it/graph、/v1/graph | 沿用流程/图接口约定、当前权限与独立业务批准；不授予任意源端动作 |

身份请求最多64KiB；流程/图使用各自400/600KiB限制。请求/头/保持连接时限分别10/5/5秒。服务端只返回白名单错误码和关联UUID，不回显密码、密钥或SQL异常。

独立宿主另有私人持久active/parked门控：traffic-status读取版本，park停放并有界排空，activate在运行且schema current时恢复受理。变更通过PrivateInput/--input私人JSON(expectedVersion及可选waitMs)；旧无策略默认parked，新初始化明确active。备份恢复保留策略，停放不撤销业务动作；详细接口约定见本发行的TRAFFIC文档。

## 企业库加密备份与恢复

```text
node scripts/enterprise.mjs backup --config ABSOLUTE_PRIVATE_CONFIG
node scripts/enterprise.mjs restore --config ABSOLUTE_NEW_PRIVATE_CONFIG --archive ABSOLUTE_ARCHIVE --key ABSOLUTE_RECOVERY_KEY
node scripts/enterprise.mjs start --config ABSOLUTE_RESTORED_CONFIG
```

backup核对并正常停止自己的实例，再加密独立企业库；不用演示卷恢复器。AES-256-GCM、逐文件SHA、路径/重复/大小校验；最多5000文件/128MiB原始数据。归档及恢复密钥生成在私人backups目录，密钥内容不输出；运维须将密钥与归档分别保护。当前不适用于大库、原生PG或在线备份。

restore只接受新配置/新state，核对源码/迁移/依赖锁/环节定义及CLI、本机传输、便携启动模板的整体指纹，拒绝跨代码版本直接恢复。保留企业/部署身份、账号/授权、流程定义与图计划/动作/事件、代理密钥；控制密钥另生成，新启动再轮换。所有恢复会话强制失效并留审计，授权版本及图动作UUID不因此重建。只有重新登录后才能续跑；到期批准不允许新动作。恢复不自动启动，不代表跨版本升级/迁移回滚或HA接管；正式升级工具仍需单独工程。

构造数据读取、实际标准接口约定、真实模型与真实企业集成分别报告。实际客户环境与模型人工对照不是当前技术基座前提；尚未接入的系统不报兼容。完整驾驶舱仍有地图权利/制图公开门槛，企业宿主本身不把这些历史资产当成企业数据。
