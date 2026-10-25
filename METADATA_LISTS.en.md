# Current-authority record navigation

[中文](METADATA_LISTS.md)

The independent enterprise host provides four passive GET collections to find existing authorized records. Lists grant no source-data,inference or execution authority. The business goal UI does not yet expose these APIs;this is its navigation foundation contract.

| Endpoint | Current role | Scope |
|---|---|---|
| GET /v1/it/graph/planning/candidates | IT | Same-tenant candidate state/version/original owner,reserved output ceiling,adopted-plan reference |
| GET /v1/graph/analysis/requests | operations/executive | Own records for operations;tenant records for executive;analysis state/version/owner/reserved ceiling only |
| GET /v1/graph/observations | operations/executive | Same owner scope;observation identities/source hashes/active and expiry hints only |
| GET /v1/graph/runs | operations/executive | Same owner scope;state/version/plan and approval references,steps and expiry hints only |

Query keys:limit(decimal1–20,default20) and cursor. Reject unknown/duplicate keys. The whitelist applies only to these GET collections,not content,POST,health,identity or tools endpoints. Use current sessions and the existing host/proxy contract. GET requires no CSRF;existing mutations still require CSRF. IT/auditors cannot list business records.

Response format:enterprise-brain.graph-metadata-list/1 with kind/items/nextCursor/limit,sourcePayloadRedacted:true,currentSourceAuthorityChecked:false,modelCalled:false,sourceCalled:false,budgetReserved:false,executed:false. Redaction means original content is absent,not permission to read it. Observation currentReadAuthorized stays false;active/unexpired metadata grants no source read.

Lists omit original goals,arguments,contexts,model prose,source payloads,raw receipt/source revisions,credential paths and lease IDs. Full content retains the [host](HOST.en.md) and existing APIs,with current source/field checks through [field policy](ANALYSIS_POLICY.en.md),[inference](BUSINESS_INFERENCE.en.md) or [history](BUSINESS_HISTORY.en.md). Source revocation may leave navigation metadata available without allowing cached-prose bypass.

Order by database created_at/UUID descending with microsecond UTC positions within AD0001–9999,avoiding JavaScript millisecond truncation. Bounded cursors bind tenant/current actor/role/authority epoch/collection;reject changed roles or reuse by another actor. Cursors are positions,not unforgeable access tokens. SQL always filters current server-derived identity/tenant,so a caller-chosen position grants nothing. These are live views;new head records appear on refreshing the first page,no multi-page snapshot promise.

Reads show existing state/lease/expiry hints without terminating expired rows,reactivating observations,renewing leases,writing audits/business actions or reserving budget. Corrupt projections return503 metadata_projection_unavailable without raw rows/internal errors;invalid input/cursor422,authority/cursor ownership403,no session401. Schema stays28 with no migration. Each version still requires full regression,independent SDK and actual installation/recovery verification. HTTP contracts prove neither complete goal UX,vendor compatibility nor AI effectiveness.
