# 验证环境与已知限制

[English](PREVIEW_NOTES.en.md) · [CI工作流](CI_REPRODUCTION.md)

## Preview.2 发布验证

源码提交8345c0d74965ddd831fdcfc554772a1d53ce05c5的八个CI作业通过：Linux源码、四组Windows源码、首任务、经营案例及源码门槛。[查看运行](https://github.com/PygmalionSong/enterprise-brain-community/actions/runs/40836879257)。该次运行不证明后续提交或其他部署环境已通过同样检查。

本地准确源码清单的Windows检查为762项，其中759通过、3项仅适用于Linux而跳过；Ubuntu检查762项通过。组间有重叠的专项检查不合计成新的测试总数。本地验证复用锁定依赖缓存，不是独立用户在干净宿主上的安装结果。

## 环境

Windows x64 / Ubuntu24.04 x64，Node24.19.0及锁定依赖。Ubuntu原生运维另要求systemd255用户管理器、cgroupv2、非root账户及PostgreSQL17.11，见[Linux运维](LINUX_RUNTIME.md)。这些条件不等于支持所有Linux发行版或Windows配置。

## 尚未验证

独立企业宿主的生产运行、生产证书与身份集成、任意厂商兼容性、生产容量和高可用、真实模型质量及客户ROI。源码预览不包含完整签名行业运行包或地图。浏览器经营案例与本地后端是两套独立状态；构造的付款或销售画面不能作为后端业务事实。

## 复现与报告

使用[首任务](FIRST_TASK.md)和[本地经营案例](RUN_OPERATING_CASE.zh.md)。REPOSITORY_MANIFEST.json校验分发文件，SOURCE_MANIFEST.json记录SDK子集；内容哈希不是发布者签名或生产认证。安装报告由使用者检查后自愿提交，没有自动上传或遥测。
