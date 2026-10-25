# Analysis policy and current field context

[中文](ANALYSIS_POLICY.md)

Prepare sourced fields without model calls,budget reservations,graph compilation,approval or execution. Installing a model never enables business analysis automatically. PlanningLedger retains its IT boundary;business field selection has a separate default-off policy.

Current IT reads `GET /v1/it/graph/analysis-policy`(initial0/disabled),then explicitly POSTs with Origin/CSRF:expectedVersion,enabled=true,expectedConfigurationVersion,modelIdentitySha256,roles,rules,maxSelectedBytes,ttlSeconds,policyAcknowledged=true. Roles are operations/executive only. Rules bind toolId/toolVersion/toolContractHash and approved paths. Hash tool-directory entries using canonical/hash;obtain model identity from private model-status. At most16 tools/64 paths each,30–1800 seconds,never beyond model configuration expiry. Disable with expectedVersion,enabled=false,policyAcknowledged=true;model budget remains intact.

An authorized business session sends `POST /v1/graph/analysis/context` with this structure,using an actual saved observation ID:

```json
{
  "expectedPolicyVersion": 1,
  "observations": [
    {"id":"original observation UUID","expectedVersion":1,"fields":["/rows/0/amount","/rows/0/currency"]}
  ],
  "selectionAcknowledged": true
}
```

At most4 current observations from distinct original actions,32 fields each. Paths use [RFC6901 string escapes and concrete indices](https://www.rfc-editor.org/rfc/rfc6901). Product restrictions additionally bound depth/length,require own scalar properties and reject whole-root selection,URI fragments,wildcards and prototype names. This is not complete JSON Pointer support. Preserve decimal strings without currency/unit/period conversion. Endpoints,commands,credential paths and unselected data are not automatically included.

Recheck business role,original observations/receipts/tools/sources,granting IT epoch,policy and model configuration. Bound authorization and installation-file waits without SQL transactions;recheck all sources in the final transaction. Model inspection checks local metadata/code/credentials only,no reachability probe or inference. Bound the entire context in UTF8 bytes(default32768,configurable1024–65536);reject excess without truncating source values.

Return context/contextHash and context.validUntil,preparedOnly=true,analysisAuthorized=false,modelCalled=false,budgetReserved=false,executed=false. Fields retain paths/value SHA and observation/tool contract/receipt/source revision/contentKind. Metadata is not operating facts and receiptRecordedAt is not live sampling. Hashes also bind the current actor and cannot transfer authority to another account.

POST the same request plus contextHash to `/v1/graph/analysis/validate`. It rebuilds current authority/source checks and still grants no model permission. Preparation creates no additional long-lived copy;[controlled business inference](BUSINESS_INFERENCE.en.md) freezes the snapshot with its explicit request/reservation. Cached context is not offline authority. This policy layer calls no model;explicit business requests use the inference API.Semantic/causal validation remains unverified.

Disabling/expiry,model configuration/credential/code drift,source/role changes and observation revocation/expiry deny preparation. Invalid input422,unauthorized/unapproved fields403,version/state drift409,context limit413,unavailable installation/source authorization or corrupt policy503. Same-code recovery retains settings hashes but disables the policy with one version increment;observations/model configuration/old sessions also retain their existing invalidation rules. No automatic regrant or inference. See [observations](BUSINESS_OBSERVATIONS.en.md),[private models](MODELS.en.md),[graphs](HOST.en.md).
