# 验证与复现边界

Backend-connected reference source / 后端连接参考源码 / バックエンド接続の参照ソース: [run](RUN_OPERATING_CASE.en.md), [中文](RUN_OPERATING_CASE.zh.md), [日本語](RUN_OPERATING_CASE.ja.md), [evidence](BACKEND_EVIDENCE.en.md). The source includes a loopback reference application with persisted supply execution. Earlier exclusions of a full cockpit do not exclude this reference application; maps, the signed installer and production qualification remain excluded. / 本次新增本机参考应用与持久供货执行；原完整驾驶舱排除说明不再排除这个参考应用，地图、签名安装器和生产资格仍不包含。


[English](PREVIEW_NOTES.en.md) · [首任务](FIRST_TASK.md) · [CI说明](CI_REPRODUCTION.md)

这是无地图企业Agent基座的开发者源码预览。核心、迁移、固定依赖锁和原69个SDK测试文件保持已验版本字节；维护者先前固定SDK矩阵641项通过。该历史成绩不是本次文档变更重新运行641项，也不等于真实客户、真实厂商或完整服务器验收。

当前源码需通过完整库存校验、锁定依赖、类型/构建及首任务检查。Source reproduction工作流分别运行四组SDK和一次首任务3项，总门禁要求两者成功。发布后应按实际提交核对Actions结果，不能只看通用徽章，也不把静态工作流当已完成的CI结果。

首任务使用自有构造流程、角色和源账本；实际提交后丢响应，新进程重新打开原库并查原动作。它不是HTTP登录/SSO、真实企业或模型质量验收。最小报告由用户明确生成并保持本地，不自动上传；输出目录中的数据库、密钥、checkpoint和原始日志应保持私有。

本源码不包含完整驾驶舱、地图、签名企业运行包或预装依赖。Windows x64/Node24.19.0是当前声明路线；干净企业宿主全套运维、Linux、真实模型质量和全厂商适配仍未验。完整企业产品方向与本次源码发行范围分别管理。

REPOSITORY_MANIFEST.json核对本次完整发行清单；SOURCE_MANIFEST.json核对原SDK范围的当前字节。哈希是内容一致性证据，不是发布者签名或生产认证。保留LICENSE/NOTICE及第三方许可，见[资产范围](ASSET_SCOPE.md)与[支持矩阵](PREVIEW_SCOPE.md)。


当前文档/证据候选另在隔离目录对原388项运行了库存、类型、构建和一次实际首任务；不是重跑641/903，也不是干净依赖安装。新清单的库存和构建另行核对。准确公开提交CI仍以未来实际Actions为准，不把原清单成绩套给新提交。


Standalone browser experience / 独立浏览器体验 / ブラウザー内の業務体験: [scope](showcase/README.en.md), [中文](showcase/README.zh.md), [日本語](showcase/README.ja.md). This addition includes no geographic geometry or backend UI integration; earlier exclusions of the complete cockpit refer to that SQL-backed distribution. / 完整驾驶舱排除范围指SQL运行版；新本地体验不含地图和后端UI集成。
