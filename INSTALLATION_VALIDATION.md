# 检查安装结果

[English](INSTALLATION_VALIDATION.en.md) · [支持范围](PREVIEW_SCOPE.md)

安装依赖后，可以运行本地检查，依次核对源码清单、类型、构建和 SDK 测试。检查结果写入本地 JSON 文件，不会自动上传；使用项目不需要提交报告。

## 生成报告

在全新目录解压或克隆源码，使用 Node 24.19.0、pnpm 11.25.0，执行：

```text
pnpm install --frozen-lockfile --ignore-scripts
node --test tests/installation-report.test.mjs
node scripts/installation-report.mjs --out ABSOLUTE_NEW_PRIVATE_REPORT_JSON --log-dir ABSOLUTE_NEW_PRIVATE_LOG_DIRECTORY
```

将两个占位符替换为尚不存在的绝对路径，其父目录必须已存在。Windows 使用 Windows 绝对路径。每条命令成功后再执行下一条；失败后保留报告和日志，用于定位问题。

报告命令不安装依赖，也不连接企业系统或模型。测试可能创建临时数据库和本机服务；这些仅用于检查代码行为。测试通过不等于已完成企业生产部署。

## 报告包含什么？

格式为 `enterprise-brain.installation-report/2`，包含本次运行编号、源码清单摘要、操作系统、架构、Node 版本、各步骤结果和测试数量。实际跳过项单独记录；Windows 上允许的 Linux 专属跳过不计为执行通过。遇到失败，后续步骤标为未执行。

报告不包含用户名、主机名、IP、环境变量、目录、客户数据、凭证或原始日志。输出目录中的详细日志仅供本地排查，分享前仍需自行检查。

## 怎样反馈？

可在 [Issues](https://github.com/PygmalionSong/enterprise-brain-community/issues) 选择安装反馈模板，填写版本、环境、操作步骤和实际结果，也可以附上自己检查过的最小报告。Issue 是公开的；无需提供公司名称或提交私人日志。不想公开报告也不影响使用。

成功和失败的尝试都欢迎。重复测试请关联之前的 Issue，便于跟进同一个问题。下载次数、CI 测试和开发者安装尝试分别统计，不能相互替代。

## CI 检查与本地报告有什么不同？

仓库 CI 在 Windows 和 Ubuntu 上执行源码检查。Windows SDK 测试分四组，Linux 单独检查，另有首任务、保供案例和汇总检查。准确提交及实际结果见[验证记录](PREVIEW_NOTES.md)，实现见[工作流](.github/workflows/source-ci.yml)。CI 不代表独立客户的部署验证。

安全问题请按[安全政策](SECURITY.md)报告。
