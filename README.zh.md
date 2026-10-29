# Enterprise Brain

**企业级 Agent 的私有化技术基座**

[English](README.md) · [中文](README.zh.md) · [日本語](README.ja.md)

为企业自建 Agent 团队提供流程上下文、授权、任务执行和结果核对。ERP、CRM、SRM、WMS 等既有系统继续保存业务正本。

## 先运行一个跨流程任务

读取两个示例流程，批准方案并执行；当工具已写入源记录但响应丢失时，查询原动作，核对实际结果。示例使用构造数据，不需要企业账号或模型 API 密钥。

[运行首任务](FIRST_TASK.md)

![Beverage business processes](showcase/media/01-processes.png)

## 选择你的入口

- [浏览饮料业务案例](https://pygmalionsong.github.io/enterprise-brain-community/?lang=zh)
- [本地运行保供案例](RUN_OPERATING_CASE.zh.md)
- [查看技术架构](ARCHITECTURE_OVERVIEW.md)
- [适配一个数据源](EXTEND_A_SOURCE.md)
- [接入业务系统](FIRST_CONNECTION.md)
- [常见问题](FAQ.zh.md)

## 安装与运行

Node24.19.0 · pnpm11.25.0

```sh
node scripts/verify-repository.mjs
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm build
node scripts/start-reference.mjs --acknowledge-owned-fixture
```

## 当前范围

这是开发者源码预览。Windows x64 和 Ubuntu24.04 x64 的源码检查已执行；独立企业宿主、生产容量、真实模型质量及客户业务收益尚未验证。饮料案例采用构造系统与确定性策略，浏览器体验和本地后端分别运行。

接入工具需要显式安装并授权。当前不支持全网扫描，也不会从数据表自动推导完整业务流程；业务读取工具尚未注册到默认 HTTP 工具目录。完整一键生产部署仍未提供。

[范围与限制](PREVIEW_SCOPE.md) · [CI / validation](PREVIEW_NOTES.md)

## 讨论与贡献

遇到可复现错误，请在 Issues 提供版本、环境和脱敏复现步骤。接入方式与业务场景在 Discussions 交流；代码和文档改进通过 Pull Request 提交。请勿上传凭证、数据库或客户记录。

[Discussions](https://github.com/PygmalionSong/enterprise-brain-community/discussions) · [Issues](https://github.com/PygmalionSong/enterprise-brain-community/issues) · [Contact](CONTACT.md) · [Security](SECURITY.md)

## 许可

源码与案例采用 Apache-2.0。再分发请保留适用的版权、许可及 NOTICE 声明。

[LICENSE](LICENSE) · [NOTICE](NOTICE) · [Third-party notices](THIRD_PARTY_NOTICES.en.md) · [Attribution](ATTRIBUTION.zh.md)

PygmalionSong · [Project background](STORY.md)
