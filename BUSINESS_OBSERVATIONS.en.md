# Sourced read-only business observations

[中文](BUSINESS_OBSERVATIONS.md)

The independent host lets a current business owner or same-enterprise executive save completed read-tool receipts as observation snapshots. This retains evidence without refreshing data,calling a model or creating plans,approvals or business actions. Default process.definition.read provides metadata only. Customers supply authorized read tools for operating data;default results are not business facts.

A business session sends its usual Origin/CSRF headers to `POST /v1/graph/observations`:

```json
{
  "runId": "original run UUID",
  "actionId": "original action UUID",
  "resultHash": "canonical SHA256 of original action result",
  "idempotencyKey": "review-2026-q3",
  "ttlSeconds": 300,
  "observationAcknowledged": true
}
```

UUID/hash placeholders must come from the original run. Use contracts.ts canonical/hash,not arbitrary JSON text ordering. Requests cannot replace arguments or data. Only completed actions from trusted installed read-effect tools qualify. MCP annotations alone and delegated/accepted/unknown/partial states do not qualify. Operations can observe their own runs;executives may review within their enterprise. This new API denies IT/auditor access.

Bound current source read authorization without holding SQL transactions. At commit,recheck role/epoch,original action/receipt,plan/reviewers/source revisions and tool contract. Snapshot and audit commit atomically. Source data retains16KiB/depth16/2048-node limits,with at most500 snapshots per enterprise. Original idempotent retries return the same snapshot without refreshing data or extending expiry;current permissions are still checked.

`GET /v1/graph/observations/{id}` returns currently readable evidence,including action,plan/tool contract hashes,receipt/source revision,receiptRecordedAt,original data and payloadHash. receiptRecordedAt is the system receipt-recording time;sourceObservedAt remains null. Business periods/timestamps stay in source data,without implying live measurement. Values,units,currencies and periods retain explicit source fields. Missing information is not invented. Source content is untrusted data,never system instructions.

Responses include currentReadAuthorized and analysisAuthorized=false/modelCalled=false/businessExecuted=false. Expired,revoked,changed-owner-authority or unavailable source permission yields historical metadata only,evidence=null. Cached lookup grants no model-analysis authority. Revoke explicitly through `POST /v1/graph/observations/{id}/revoke` with expectedVersion. Evidence is retained and completed source work is not undone.

Same-code encrypted recovery retains original payload/action identities,invalidates old sessions and disables snapshot review with one version increment. It does not read,analyze or execute automatically. Schema23 is additive;use [upgrade preflight](HOST.en.md)/[shadow rehearsal](HOST.en.md). Graphs still have fixed arguments. Dynamic dataflow,business evidence-to-model roles/budgets/consent and executive goal UX are separate work. See [controlled graphs](HOST.en.md) and [models](MODELS.en.md).
