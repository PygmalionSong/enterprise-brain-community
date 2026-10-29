# 原生企业库接入配置

[English](NATIVE_DEPLOYMENT.en.md) · [连接前提](NATIVE_RUNTIME.md) · [会话归属](NATIVE_OWNERSHIP.md)

受信本机程序接口 `adoptNativeEnterprise(root, configFile, inputFile)` 接入由部署方DBA预先迁移、授权和初始化管理员的专用PostgreSQL企业库。它不迁移、不GRANT、不创建账号，不改业务表、预算或模型安装。专库确认是DBA的明确声明，不以RLS可见的一个企业父行冒充全库盘点。

`configFile` 必须为现有规范私人父目录下全新专用子目录中的 `config.json`；拒绝已有目标、间接路径、设备名和隐藏配置目录。私人输入JSON严格包含 `enterpriseId`、`runtimeRole`、规范HTTPS `origin`、后端 `port`、绝对 `runtimeDescriptorFile`、准确64位小写 `runtimeDescriptorSha256`，以及两个明确的 `adoptionAcknowledged: true`、`dedicatedDatabaseAcknowledged: true`。不要把私人输入、描述符、凭证或配置加入仓库。

连接核心对同一次读取的有界描述符字节核对SHA后才解析并读取密码/CA；必须是原生验证的账号与TLS来源，企业、角色及SHA都匹配。接入还复核当前迁移、账号/工作负载权限、有效身份管理员并取得专库会话归属。存在模型安装记录或启用的图委托即拒绝，不读取其凭证、不调用模型/工具、不隐式卸载或停用。操作人须先通过原有受控接口处理这些配置。

成功后只发布独立 `format: 2, storage: "postgres"` 配置、随机私人代理/控制令牌及 `parked`/版本0流量策略，不监听端口、不启动后台泵。绝对路径绑定最终目录；代理/控制令牌分别保存，不写进描述符或输出。目标绑定协作声明与私人兄弟暂存防止两个正常接入者同时提交；提交期间持续持有数据库归属。失败保留声明及可能的暂存以供人工核对，不窃取陈旧声明，不覆盖现有目录，不递归清除未知路径。异常结果后先检查目标、声明和暂存，不能盲目重试或删除别人的文件。这不是防恶意本机管理员或断电耐久性认证。

`readNativeDeployment` 校验固定私人路径、令牌与描述符当前SHA，用于启动。`readNativeControlDeployment` 只校验本地配置/固定路径/令牌，用于核对原实例与停服；描述符丢失或改变不会阻断此读取，不能据此启动新连接。共用运维锁始终散列实际完整配置，包含原生角色/描述符SHA。密码/CA文件的轮换仍需明确停服/重新连接；描述符SHA不证明引用文件未变或新凭证已生效。

原 `format: 1` PGlite读取、文件备份和升级入口拒绝此配置。不要用文件复制备份外置PostgreSQL。独立本机合同现覆盖[原生前台](NATIVE_SERVICE.md)、[日常模型工具](NATIVE_AGENT_CONFIGURATION.md)、[加密备份/隔离恢复](NATIVE_BACKUP_RESTORE.md)及[新空专库DBA准备](NATIVE_DBA_PREPARATION.md)。DBA准备是单独显式命令，不改变adopt的只读边界；原生跨版本升级和HA仍须单独交付和验收。自有Windows/PG17/TLS验证不等于干净宿主、Linux、生产证书或真实客户环境验收；模型实测与公开发布另外保留边界。
