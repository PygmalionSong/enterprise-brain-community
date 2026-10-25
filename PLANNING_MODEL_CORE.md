# 持久规划模型装配程序核心

[English](PLANNING_MODEL_CORE.en.md) · [存储](PLANNING_STORAGE.md) · [上下文](PLANNING_CONTEXT.md)

`DurableGraphPlanner`是受信宿主代码使用的程序模块，组合当前上下文、持久调用预留和明确安装的StructuredModel工厂。默认未安装；不存在mock或案例回退。独立宿主可按[模型安装合同](MODELS.md)显式装配CLI/候选HTTP入口；未安装仍报告模型未配置，老板目标界面尚未实现。

`generate`输入目标、明确scope、配置版本和幂等键。先保存上下文SHA/快照及调用/最大输出Token预留，只给首次请求一次派发资格。同键返回原候选；超时、错误或用量未知不退款、不自动重发。调用前再次检查配置/安装身份、当前IT与流程范围；模型等待不持数据库事务。

模型工厂只收到已预留的输出上限和剩余时限，准确profile在请求和响应两端核对。代码外层AbortSignal/时限阻止忽略取消的迟到Promise被采用。`cancel`先持久作废租约再请求中断；它无法撤销模型已发生的计算或费用。重启不重新派发旧候选。配置变化/撤权/来源漂移后的响应不发布；自报Token单独保存，不能当实际账单。

模型线上格式为单一封闭对象，所有字段必填：`format,kind,questions,rationale,assumptions,routes,bindings`。每个binding的`argumentsJson`是有界JSON字符串；服务端解析后仍逐项核对当前工具、参数schema、流程和图结构。封闭信封有助于兼容严格结构化输出；[官方结构化输出规则](https://developers.openai.com/api/docs/guides/structured-outputs)要求对象根、必填字段及封闭属性。协议形状不等于供应商兼容成绩，实际模型仍未验证。

模型只能生成need_input/candidate数据。程序核对通过后保存候选、当前上下文SHA与图hash（适用时），不建立plan/approval/run/action，不调用业务工具authorize/submit/lookup。采用仍需当前来源再次核对、显式IT编译及独立业务批准。只有流程定义不足以证明经营事实；业务观察授权及数据读取装配仍有缺口。

本机HTTP两协议测试使用自有结构化响应服务，所有用量为构造自报值，不是实际模型成绩或费用。此程序模块不是操作系统沙箱；模型工厂与参数验证器是明确受信的安装代码。独立宿主安装仅允许已声明的本机协议，不自动选择或路由云服务。公开候选仍不包含运行数据、秘密或私人项目资料。


明确采用候选生成冻结计划见[候选采用合同](CANDIDATE_ADOPTION.md)，采用后仍需独立业务批准，不自动执行。
