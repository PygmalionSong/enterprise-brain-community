# Constrained planning context and pure graph review

[中文](PLANNING_CONTEXT.md) · [Durable storage](PLANNING_STORAGE.en.md) · [Graph runtime](HOST.en.md)

Current IT sessions may POST these independent-host endpoints with canonical Origin,session and CSRF:

- `/v1/it/graph/planning/context`: explicitly select ordered `processes[{id,expectedVersion}]`,`links[{id,expectedVersion}]` and `tools[{id,version}]`.
- `/v1/it/graph/planning/validate`: submit the same `scope`,`contextHash` and `candidate` for data-only review.

Limits:20processes,19links,64tools.Current confirmations and original IT reviewer authority are required,with exact end-to-start links.Only installed exact tool versions with argument schemas enter context;other tools are not implicitly included.Return copied definitions/mappings/link semantics,business schemas and hashes.Model-visible context excludes reviewer identities,commands,program paths and credentials.Source labels/conditions are explicitly untrusted data,not instructions or authority.

Candidate structures are exactly `{kind:'need_input',questions,assumptions}` or `{kind:'candidate',routes,bindings,rationale,assumptions}`.Text arrays allow12items/1000characters each;JSON remains bounded to131072bytes/16levels/8192values.The server restores frozen processes/links and rejects extra fields,unselected tools,invalid arguments,out-of-scope nodes or versions.Re-read the scope SHA,reuse existing graph compilation for routes,acyclic structure,parallel joins and bindings,then re-read the SHA again to reject drift.

`GraphService.preview` and formal `compile` share preparation/review logic.Preview inserts no plan/approval/run/action and calls no tool authorize/submit/lookup.Validators are explicitly installed trusted code and must follow the pure parameter-validation contract;this is not an operating-system sandbox.Formal compile rechecks in its insertion transaction;business approval remains separate.Success returns `persisted:false,businessAuthorized:false,executed:false`,not task completion.

These endpoints neither call models nor persist planning candidates.Model protocol/storage is separately assembled through [explicit installation/planning entries](MODELS.en.md);these pure-review endpoints start no model,without mock/case fallback,dynamic dataflow or universal vendor support.HTTP source/authority/tool/context drift returns409;out-of-scope tools or structural/argument errors422;authority/CSRF errors403.Technical entry points remain IT-only and preserve the approved boss cockpit.
