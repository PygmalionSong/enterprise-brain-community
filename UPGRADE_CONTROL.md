# 升级控制核心接口约定

[English](UPGRADE_CONTROL.en.md)

程序API位于src/enterprise/upgrade-control.ts与upgrade-inventory.ts。日志与离线清单可进入无地图企业SDK；完整签名安装的准备/提交CLI另属完整产品，不把SDK改名后当作签名安装。

initialUpgradeControl/createUpgradeControl建立绑定；read/inspect仅校验和读取；change/update按当前版本CAS推进。绑定包含企业/部署UUID、配置/完整计划SHA、旧/新安装清单SHA与独立发布者指纹。阶段为created、quiesced、backed_up、rehearsed、candidate_ready、committed_parked、active。每个外部步骤前保存pending operationId/意图SHA，完成后保存证据SHA。不能跳步、回退、改绑定或重复操作ID。

提交指针与committed_parked属于同一次原子文件更新；之后才允许开放受理。提交前失败保留current，提交后失败保留candidate并要求前向处理。pending一律needs_inspection，不自动重放；文件声明异常遗留不自动偷取。事件有界、严格字段、文件大小限制、规范私人路径、同步临时文件与同目录rename。对方持有声明或版本变化会拒绝，不把年龄当授权。没有浏览器入口、模型或业务源调用，也不授予业务批准。

captureUpgradeDatabase仅在本进程持有backup运维声明且实例已停止时读取PGlite文件。精确文件字节、相对路径与空目录参与SHA，输出仅含汇总SHA/计数/字节和部署身份，不含文件正文或路径清单。前后均复核运维声明/无实例。最多5000文件/5000目录/总128MiB；不是在线/大库备份。切换前的双方清单须与本次准备点一致，正常active业务重启不能用旧快照强制回退。

UnderClaim启动/备份/流量入口验证本进程声明和用途；一般入口仍自己取得互斥。受信程序/OS权限是前提：摘要与阶段断言不证明真实效果，不是签名授权、OS文件锁、断电恢复或分布式HA。原生PG企业宿主未放开。本机专项、真实子进程中断、实际签名安装链与完整回归分别记录，不互相代替。
