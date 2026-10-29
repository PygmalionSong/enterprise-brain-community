# 开始使用

## 不安装也能体验吗？

可以打开[饮料企业案例](https://pygmalionsong.github.io/enterprise-brain-community/?lang=zh)，比较保供方案、浏览业务流程和门店经营。案例使用示例数据，操作只改变当前浏览器中的状态。

## 可运行的任务展示了什么？

[第一个任务](FIRST_TASK.md)会读取两个示例流程，取得批准后执行方案，并演示系统已保存操作、但没有返回结果时如何恢复。后端会先检查已有操作的结果，再决定后续处理。无需企业账号或模型密钥；这个任务在本地运行，与浏览器案例相互独立。

## 怎样接入公司的系统？

需要开发或配置适配器，确定可以读取哪些信息，以及谁可以批准和执行任务。可以从[首次接入指南](FIRST_CONNECTION.md)开始。业务读取工具需要通过 SDK 安装，尚未加入默认 HTTP 工具目录。当前版本不支持扫描整个企业网络，也不会从数据库表自动推导完整流程。

## 数据和报告存在哪里？

流程定义、权限、方案和执行记录保存在部署环境内，业务记录仍由原有系统管理。可选的[安装报告](INSTALLATION_VALIDATION.md)写入本地文件，是否分享由使用者决定。服务器、凭证和模型连接由部署团队配置。

## 在哪里提问？

接入问题在 [Discussions](https://github.com/PygmalionSong/enterprise-brain-community/discussions) 交流，可复现错误提交 [Issue](https://github.com/PygmalionSong/enterprise-brain-community/issues)，项目合作见[联系页](CONTACT.md)。反馈时请使用示例数据，并隐去账号、密钥等敏感信息。
