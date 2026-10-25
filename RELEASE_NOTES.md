# v0.1.0-preview.1 · 开发者源码预览

Backend-connected reference source / 后端连接参考源码 / バックエンド接続の参照ソース: [run](RUN_OPERATING_CASE.en.md), [中文](RUN_OPERATING_CASE.zh.md), [日本語](RUN_OPERATING_CASE.ja.md), [evidence](BACKEND_EVIDENCE.en.md). The source includes a loopback reference application with persisted supply execution. Earlier exclusions of a full cockpit do not exclude this reference application; maps, the signed installer and production qualification remain excluded. / 本次新增本机参考应用与持久供货执行；原完整驾驶舱排除说明不再排除这个参考应用，地图、签名安装器和生产资格仍不包含。


[English](RELEASE_NOTES.en.md) · [快速开始](QUICKSTART.md)

Enterprise Brain面向企业自建Agent团队，提供独立存储、身份权限、获准流程登记/确认、受控计划、独立业务批准、持久动作和回执。现有ERP/SRM/WMS/CRM继续作为业务事实权威；模型可以替换，模型建议本身不授予执行权。

这份源码预览包含企业宿主/SDK、受信MCP资源与工具合同、结构化BPMN/OData子集、15域60环节参考、模型/分析合同、备份恢复及原生运维模块，以及可运行的两流程受控首任务。不含完整饮料驾驶舱/地图或签名一键安装器，不设置收费入口。

用[首任务](FIRST_TASK.md)讨论一个具体问题：源已提交但响应丢失时，怎样在新进程中核对原动作并避免重复提交？欢迎通过[安装反馈](INSTALLATION_VALIDATION.md)、[Issues](https://github.com/PygmalionSong/enterprise-brain-community/issues)或[Discussions](https://github.com/PygmalionSong/enterprise-brain-community/discussions)分享版本、最小报告和脱敏复现。不要提交真实凭证、业务数据或完整日志。

Apache-2.0及第三方NOTICE保持；维护者为PygmalionSong。预览不是生产认证，不声明真实SAP/Dynamics集成、实测业务ROI、完整干净宿主或真实模型质量已验。


本候选补充英语默认主页、中日入口、三语创始人故事、无地图实际任务证据及联系说明。维护者未公布项目邮箱；当前不推出收费服务。它们是发行文档与素材变化，核心、迁移、工具、测试、锁定依赖和工作流保持原字节。


Standalone browser experience / 独立浏览器体验 / ブラウザー内の業務体験: [scope](showcase/README.en.md), [中文](showcase/README.zh.md), [日本語](showcase/README.ja.md). This addition includes no geographic geometry or backend UI integration; earlier exclusions of the complete cockpit refer to that SQL-backed distribution. / 完整驾驶舱排除范围指SQL运行版；新本地体验不含地图和后端UI集成。
