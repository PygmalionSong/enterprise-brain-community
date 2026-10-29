# 原生企业 HTTP 程序入口

[English](NATIVE_HOST.en.md) · [连接核心](NATIVE_RUNTIME.md) · [实例归属](NATIVE_OWNERSHIP.md) · [现有宿主](HOST.md)

独立[原生前台CLI](NATIVE_SERVICE.md)提供format2生命周期与流量控制；本工厂仍为程序入口，原生备份恢复及签名升级见各自独立运维合同。可选受信loadOwnedModel只在归属内执行，之后复查资格；不接受HTTP回调安装。归属失效的健康/schema直接不可用，不等待SQL。
`createNativeEnterpriseApplication`位于src/http/enterprise.ts，是受信部署程序的可选原生HTTP构建入口；本工厂自身不提供CLI或一键安装/备份恢复/升级。现有createEnterpriseApplication仍拒绝非PGlite，现有初始化/启动/恢复使用PGlite，不通过更改profile绕过守卫。Windows专用集群合同与[Ubuntu运行合同](LINUX_RUNTIME.md)各有独立本地证据，不声明完整企业生产资格。

先用connectNativeRuntime建立verify-full连接，再传入返回的database、规范绝对安装根、现有enterpriseId/instanceId/HTTPS origin/proxyToken/controlToken配置，及{enterpriseId,runtimeRole,ownershipAcknowledged:true}。工厂核对对象的模块内连接来源、企业/角色与verify-full档位，重新检查当前账号资格、代码迁移清单和实际PG后端TLS状态，并取得数据库独占会话归属。连接对象冻结，关闭清除来源；包装对象、伪profile、底层回环明文测试连接不能用于宿主。来源只证明创建策略，不是持续业务授权或管理员变更防护。

额外运行权限逐项核对：principal/auth_session/identity_administrator的SELECT、INSERT、UPDATE；enterprise的SELECT、UPDATE；audit_event的INSERT；process_registry和schema_migration的SELECT。多项权限分别检查，不把数据库权限函数的逗号OR误当AND。迁移/首次初始化仍由独立DBA完成，运行账号不持有bootstrap或DDL/迁移表写权限。没有自动GRANT、migrate、案例种子、模型安装或外部工具配置。

共用同一内部HTTP/身份/CSRF/当前角色/独立业务批准实现；内部通用构建函数不导出。未配置模型保持不可调用，导航不新增预算或动作，schema不匹配或归属失效使普通API不可用。工厂不会自动监听或装配后台泵/本机运维；默认仅内存计数实际在途请求，用于安全关闭，持久流量策略仍由调用者提供。返回server、可等待close和受控组件，调用者负责回环监听、可信HTTPS反代及前台扩展。正常关闭顺序是await app.close()，再await database.close()。程序HTTP验证不能替代完整私有前台生命周期验收。

固定拒绝码包括native_enterprise_input_invalid、native_enterprise_postgres_required、native_enterprise_connection_required、native_enterprise_runtime_unqualified、native_enterprise_transport_unverified、native_enterprise_workload_grants_missing、native_enterprise_unavailable。角色/凭证/SQL错误不进入响应。当前企业原始Database仍为受信能力，不交给浏览器/模型/任意SQL；专库/甲方管理员权限、凭证轮换与持续运维由部署合同约束。

原生配置/前台/实例锁/停服流量见新CLI；pg_dump与pg_restore、恢复撤授权、原生锁恢复和跨版本升级仍待集成。现有PGlite文件复制和离线字节快照不适用于原生服务器，不能把新入口当作这些能力已经完成。老板驾驶舱/行业案例与企业基础设施入口分开，独立企业工作区仍为占位。
