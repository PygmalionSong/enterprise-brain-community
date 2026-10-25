# IT工具参数合同与预检

[English](TOOL_CONTRACTS.en.md) · [图运行](HOST.md) · [MCP安装](MCP_TOOLS.md)

GET `/v1/it/graph/tools` 仍仅允许当前IT身份。已提供参数合同的工具额外返回inputSchema与inputSchemaSha256（规范JSON/SHA256），未提供的受信程序工具保留原ID/版本/效果三个字段。默认流程摘要工具及明确安装的MCP工具已有参数合同。参数元数据不是业务授权，不包含安装命令、私人路径或凭证；任意远程/动态schema引用禁止，JSON复杂度与总大小有界。

工具目录在注册时复制合同并计算哈希，每次输出再复制，调用方不能通过修改返回对象改写目录。工具ID/版本/效果变动拒绝旧目录。合同仅描述该实例已装载的版本快照；改变安装声明需要按安装规程停服重装，不靠预检自动加载程序。

POST `/v1/it/graph/tools/validate` 使用当前IT会话、规范Origin和CSRF，严格输入为toolId、toolVersion、args（最多16KiB）。调用工具的纯参数验证器，返回规范化args、效果、可用的inputSchemaSha256，及validatedOnly:true、businessAuthorized:false、executed:false。参数错误422，角色403、版本冲突409；任意适配器异常不暴露SQL或凭证。

预检不调用authorize/submit/lookup，不创建图动作、不读取源端业务数据，也不证明来源实际可访问、批准有效或业务规则已经满足。受信工具的validate必须为无IO纯函数；MCP安装器生成的验证器和默认流程工具符合此约定。当前API不是源端沙箱试跑，不能把200当付款、履约、质量放行或业务批准。

IT结构确认和业务执行批准保持分开。未来通用规划可把合同作为模型输入数据，仍须核对选中工具/版本、参数、流程来源和独立批准；当前没有新增模型调用或自动规划，也没有改动老板驾驶舱。真实模型/Linux/厂商与生产环境按各自状态列示。
