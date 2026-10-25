# 源码与首任务CI复现

[English](CI_REPRODUCTION.en.md) · [首任务](FIRST_TASK.md)

Source reproduction工作流有两个独立验收部分。windows-source四组保持原69个SDK文件的固定分组；first-task只运行一次新增的3项检查。每个部分均校验完整库存、安装锁定依赖并进行类型检查和构建。source-gate依赖两者，任何失败、取消或跳过都不能通过。

first-task运行命令：

~~~powershell
node --test --test-reporter=tap tests/first-task.test.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
~~~

首任务检查包含拒绝未确认/既有/越界输出，以及真实本地源提交后响应丢失、独立进程重开原库和原动作核对。SDK计数和新增3项分别报告；统计工具自身的单测另列，不混充产品用例数。

CI使用GitHub托管Windows、Node 24.19.0、pnpm 11.25.0、固定动作提交、只读contents权限；不使用企业凭证、自托管runner或自动上传原始日志。依赖安装禁用生命周期脚本，产品SQL权限及超时不因测试而放宽。自有测试输出保留在临时runner内，不作为发行附件。

工作流定义表示待执行检查。只有准确提交的实际运行、报告库存哈希和完成结果才能成为版本成绩。GitHub源码CI不等于完整私有化安装/备份恢复验收、独立用户采用、真实企业连接或真实模型质量。
