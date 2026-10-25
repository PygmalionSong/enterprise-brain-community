# Enterprise Brain

**企业自建业务Agent团队的私有化技术基座。**

[English](README.md) · [中文](README.zh.md) · [日本語](README.ja.md)

## 看清业务取舍，核对执行结果。

区域需求增加，自产、调拨和代工都能补货，但现金、交期和质量约束必须一起满足。Enterprise Brain把流程上下文、负责人批准与源端回执连起来，让跨部门工作可以检查。

## 从这里开始

- [体验三语经营案例](https://pygmalionsong.github.io/enterprise-brain-community/?lang=zh)
- [本地运行持久后端](RUN_OPERATING_CASE.zh.md)
- [了解技术架构](ARCHITECTURE_OVERVIEW.md)
- [适配一个小型数据源](EXTEND_A_SOURCE.md)
- [查看范围与限制](PREVIEW_SCOPE.md)

浏览器案例保存构造的本地状态；本地后端是独立可执行参考，采用构造源和确定性策略。两者都不代表真实企业或真实模型结果。

![Enterprise operating blueprint](showcase/media/01-processes.png)

## 查看源回执

15域全景保持。当前验证的保供路径为自产80万箱、调拨60万箱、代工20万箱。批准、受理、到货、付款和销售分别核对；付款和销售尚未验证。

在自有HTTP恢复测试中，三个动作源端提交后响应超时。后端查询原动作，重启后保留身份，以零重复提交核验160万箱到货。

[查看源回执](BACKEND_EVIDENCE.zh.md)

## 安装并运行

Windows x64 · Node24.19.0 · pnpm11.25.0。锁定依赖安装需要访问包仓库，命令失败即停。

```powershell
node scripts/verify-repository.mjs
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm build
node scripts/start-reference.mjs --acknowledge-owned-fixture
```

独立工作进程的恢复链路见 [受控首任务](FIRST_TASK.md)。 复用真实GraphTool合同的扩展示例见 [库存适配实验](EXTEND_A_SOURCE.md)。

## 本次预览包含什么

底座模块、持久化本地工作台、独立浏览器案例。流程读取采用明确MCP/BPMN/OData子集，工具由操作人安装。模型可替换，模型方案不授予操作权限。这是开发者源码预览，不是完整签名一键安装器或生产资格。Linux、独立甲方宿主和真实模型质量仍未验证。

## 讨论和贡献

流程与集成问题进Discussions，可复现缺陷和自愿安装反馈进Issues。可从Fork提出审阅PR；公开访问不授予官方写权限。不要附密钥、数据库或客户原始日志。

[Discussions](https://github.com/PygmalionSong/enterprise-brain-community/discussions) · [Issues](https://github.com/PygmalionSong/enterprise-brain-community/issues) · [Contact / 联系 / 連絡](CONTACT.md) · [Security](SECURITY.en.md) · [Contribute](CONTRIBUTING.en.md)

## 许可与自主部署

Apache-2.0，保留LICENSE、NOTICE及第三方声明。企业可自行部署、修改和运维，不要求购买服务。本次没有收费方案或生产SLA。

[LICENSE](LICENSE) · [NOTICE](NOTICE) · [Third-party notices](THIRD_PARTY_NOTICES.en.md)

[PygmalionSong维护。项目源于十多年管理咨询与数字化转型经验，详见项目故事。](STORY.md)
