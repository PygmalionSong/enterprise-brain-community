# 开始之前

## 我可以先试什么？

先运行[首任务](https://github.com/PygmalionSong/enterprise-brain-community/blob/v0.1.0-preview.2/FIRST_TASK.md)：读取两个示例流程、批准执行，并观察工具在写入记录后丢失响应时，任务如何查询原动作并核对结果。示例使用构造数据，不需要企业账号或模型 API 密钥。

## 能直接接入公司的业务系统吗？

需要先开发或配置适配器，并确定读取范围与业务授权。当前版本提供首次接入和受限读取的参考实现，不支持自动扫描整个企业网络，也不会从数据库表自动推导完整业务流程。业务读取工具需要通过 SDK 显式接入，默认 HTTP 工具目录尚未启用该工具。接入前请阅读[版本范围](https://github.com/PygmalionSong/enterprise-brain-community/blob/v0.1.0-preview.2/PREVIEW_SCOPE.md)。

## 数据存在哪里？

运行时在部署环境内保存流程、授权、计划与执行记录。ERP、CRM、SRM、WMS 等原系统继续保存业务正本。项目不会自动上传安装报告，也不会自动启用托管模型或付费服务。企业部署时，由部署方管理服务器、凭证和运维。

## 怎样提问或参与？

- 运行失败：提交 [Issue](https://github.com/PygmalionSong/enterprise-brain-community/issues)，说明版本、运行环境、复现步骤与错误信息，并删除敏感内容。
- 讨论接入方式或业务场景：前往 [Discussions](https://github.com/PygmalionSong/enterprise-brain-community/discussions)。
- 改进代码或文档：提交 Pull Request，由维护者审阅合并。

请勿提交凭证、客户记录或未脱敏的日志。
