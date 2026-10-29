# 源码与首任务CI复现

[English](CI_REPRODUCTION.en.md) · [首任务](FIRST_TASK.md)

工作流包含四组Windows SDK、首任务、业务案例、Ubuntu24.04源码任务及最终source-gate。SDK清单现为71文件、649项结果；Windows仅允许三个精确命名的Linux专属跳过，其他跳过、失败、取消或缺失任务均拒绝。Ubuntu不允许跳过，另运行首任务、案例、投影和适配检查。本地准备好的工作流不等于已运行的远程成绩。

first-task运行命令：

~~~powershell
node --test --test-reporter=tap tests/first-task.test.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
~~~

首任务检查包含拒绝未确认/既有/越界输出，以及真实本地源提交后响应丢失、独立进程重开原库和原动作核对。SDK计数和新增3项分别报告；统计工具自身的单测另列，不混充产品用例数。

CI使用GitHub托管Windows及Ubuntu24.04、Node 24.19.0、pnpm 11.25.0、固定动作提交、只读contents权限；不使用企业凭证、自托管runner或自动上传原始日志。依赖安装禁用生命周期脚本，产品SQL权限及超时不因测试而放宽。自有测试输出保留在临时runner内，不作为发行附件。

工作流定义表示待执行检查。只有准确提交的实际运行、报告库存哈希和完成结果才能成为版本成绩。GitHub源码CI不等于完整私有化安装/备份恢复验收、独立用户采用、真实企业连接或真实模型质量。
