# 私有流量停放、激活与排空

[English](TRAFFIC.en.md) · [企业宿主](HOST.md)

独立企业宿主支持持久active/parked受理策略，与部署UUID及期望版本绑定。parked拒绝新登录及全部正常页面/API；本机健康和私有运维仍可用。新初始化明确active/version0；旧安装/旧恢复点没有策略文件时默认parked/version0。正常停服仅暂时关闭本进程受理，不偷偷更改持久重启策略。

```text
node scripts/enterprise.mjs traffic-status --config ABSOLUTE_PRIVATE_CONFIG
node scripts/enterprise.mjs park --config ABSOLUTE_PRIVATE_CONFIG --input ABSOLUTE_PRIVATE_CHANGE
node scripts/enterprise.mjs activate --config ABSOLUTE_PRIVATE_CONFIG --input ABSOLUTE_PRIVATE_CHANGE
```

变更文件是私人JSON：expectedVersion为已核对的非负整数；可选waitMs为0–5000，默认1000。不要在重试时盲猜新版本，先读traffic-status。便携入口对应EnterpriseAction traffic-status/park/activate；后两项通过PrivateInput传文件路径。离线只允许状态读取/停放；激活必须在已核对且schema current的运行实例上完成。

命令与启动/停服/备份共用本机运维互斥。运行变更核对实例健康身份，再向/ops/traffic发送私人控制权限及实例UUID；浏览器Origin、代理头、错误实例、旧版本或控制密钥均拒绝。控制密钥不出现在参数/URL/浏览器或结果中。/ops/traffic不是公开API或身份管理员页面权限。

停放提交后，新受理立即被拒绝。已经受理的异步处理计数直到服务端处理结束；客户端断开不等于处理撤销。waitMs内未排空则返回202/drained=false，保持parked和准确在途计数；不能激活仍有在途处理的实例。排空仅覆盖本机HTTP处理，不证明外部已受理的业务动作完成或取消，也不新增后台图调度能力。

traffic.json采用有界私人文件、期望版本及临时文件同步/原子替换；写盘成功才提交内存状态。保留最近64条本机控制历史，不标识真实操作者，不是完整、不可篡改或合规审计账本，也不承诺任意断电/共享盘HA。文件ACL由甲方限制，普通文件mode不是Windows权限部署。

正常停服先关闭新受理并最多等待5秒本机处理排空，再关闭HTTP/数据库。超时不关闭仍在使用的库，保持停止受理，可在处理结束后重新请求停服；停服CLI仍有自己的有界等待。不要把强杀进程当作图动作已撤销。

企业加密备份显式保存策略；同代码恢复保留mode/version/最近控制历史，旧浏览器会话仍全部失效。缺失策略的恢复点保持parked，不能悄悄开放。恢复不会自动激活或运行候选业务。影子升级控制器必须显式核对parked并使用停止旧写入后的新回滚点；完整签名产品的[受控升级](UPGRADE_CONTROL.md)串起停止/新备份/保守迁移/指针与激活；写入后不自动回退旧快照。

裸程序级createEnterpriseApplication只有在受信工厂传入TrafficAdmission时才安装此持久门控；独立CLI宿主始终装配。自定义工具、角色、批准与源回执合同保持独立，激活不扩大业务写权限。

后台委托与HTTP共用受理计数和停放排空，见[图推进合同](SUPERVISION.md)。恢复active策略不会重新启用恢复的图委托。
