# IT tool argument contracts and preview

[中文](TOOL_CONTRACTS.md) · [Graph runtime](HOST.en.md) · [MCP installation](MCP_TOOLS.en.md)

GET `/v1/it/graph/tools` remains current-IT-only.Tools with argument contracts additionally return inputSchema/inputSchemaSha256(canonical JSON/SHA256);legacy trusted tools retain ID/version/effect.Default process-summary and explicitly installed MCP tools supply contracts.Metadata grants no business authority and contains no installation commands/private paths/credentials.Remote/dynamic schema references are forbidden;JSON complexity/bytes are bounded.

Catalog registration copies/hashes contracts and every response copies them again.Mutating returned objects cannot change the registry.Changed toolID/version/effect rejects old metadata.Contracts represent that instance's loaded snapshot.Installation changes still require the stopped installation procedure,never automatic code loading from preview.

POST `/v1/it/graph/tools/validate` requires current IT session/canonical Origin/CSRF.Strict JSON:toolId,toolVersion,args(max16KiB).Call the pure argument validator and return normalized args,effect,available inputSchemaSha256,validatedOnly:true,businessAuthorized:false,executed:false.Invalid args422,role403,version conflict409;arbitrary adapter errors never disclose SQL/credentials.

Preview never calls authorize/submit/lookup,creates graph actions,or reads source business data.It does not establish source access,valid approval or business admissibility.Trusted validate functions must be pure/noIO;installer-generated MCP/default process validators meet this contract.This is not a source sandbox trial;200 does not prove payment,fulfillment,quality release or approval.

IT structural review and business execution approval remain separate.Future planning may consume schemas as data while rechecking selected tools/versions,args,process sources and independent approval.No model calls/autoplanning or boss-cockpit changes are added here.Live models/Linux/vendors/production retain separate status.
