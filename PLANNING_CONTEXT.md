# 受约束规划上下文与纯图核对

[English](PLANNING_CONTEXT.en.md) · [持久存储](PLANNING_STORAGE.md) · [图运行](HOST.md)

当前IT会话可在独立企业宿主POST以下接口，均需规范Origin、会话和CSRF：

- `/v1/it/graph/planning/context`：明确选择有序`processes[{id,expectedVersion}]`、`links[{id,expectedVersion}]`和`tools[{id,version}]`。
- `/v1/it/graph/planning/validate`：提交同一`scope`、上下文`contextHash`与`candidate`，只核对数据。

范围最多20流程、19链接、64工具；来源须当前确认、确认人仍有原IT授权，链接须准确端到起点。只接已安装且有参数schema的准确工具版本，不自动纳入其他工具。返回复制的定义/映射/链接语义、工具业务schema及哈希；模型上下文不含确认人身份、命令、程序路径或凭证。源端名称/条件文字标记为不可信数据，不是模型指令或执行授权。

候选只接受两种结构：`{kind:'need_input',questions,assumptions}`，或`{kind:'candidate',routes,bindings,rationale,assumptions}`。文字数组最多12项/每项1000字符；JSON仍受131072字节/16层/8192值限制。服务端补回冻结流程/链接，拒绝额外字段、未选择工具、无效参数、跨范围节点或版本。先重读范围SHA，再复用原图编译算法检查选路、无环、并行汇合和任务绑定；核对后再重读SHA，漂移即拒绝。

`GraphService.preview`和正式`compile`共享准备/核对逻辑；preview不插入plan/approval/run/action，也不调用工具authorize/submit/lookup。校验器是明确安装的受信代码，其validate必须遵守纯参数验证合同，不是操作系统沙箱。正式compile在插入事务再次核对，业务批准保持独立。成功响应`persisted:false,businessAuthorized:false,executed:false`，不代表任务完成。

这些接口没有模型调用，也不持久保存规划候选。模型协议/持久存储另由[显式模型安装与规划入口](MODELS.md)装配，这两个纯核对接口不启动模型，没有mock或案例回退，不支持动态数据流/任意企业系统。HTTP source/authority/tool/context漂移返回409；越界工具或结构/参数错误422；权限/CSRF错误403。技术入口留IT端，不改变已批准老板驾驶舱。
