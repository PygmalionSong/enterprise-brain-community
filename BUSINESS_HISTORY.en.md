# Business analysis history reads

[中文](BUSINESS_HISTORY.md)

Completed analysis history is separate from inference. It is off by default. IT must explicitly grant current business roles, exact original read tool versions/contracts and fields. A model installation, old analysis policy or executable old write plan is not required. Old grants, context hashes and cached output never constitute current read permission.

## APIs

IT uses GET /v1/it/graph/history-policy and POST to change it. Enable with expectedVersion, enabled:true, roles (operations/executive), rules (toolId/toolVersion/toolContractHash/paths), maxSelectedBytes (1024–65536, default32768), ttlSeconds (30–1800, default300), and historyPolicyAcknowledged:true. At most16 tools and64 bounded RFC6901 paths each. Disable accepts only version, enabled:false and acknowledgement.

Business readers explicitly POST /v1/graph/analysis/requests/{id}/history with only expectedVersion, expectedHistoryPolicyVersion and historyReviewAcknowledged:true. Current sessions, Origin and CSRF are required. IT/auditors cannot read the prose. The current original owner or executive may read, subject to current source authorization for that reader. Legacy GET never implicitly adopts this grant.

## Read contract

Each read validates immutable original request/actor context/closed output/usage hashes, current reader and granting IT epochs, exact read tool contract, completed original actions and every originally selected field. Even uncited original fields require current approval because model prose could mention them. Two bounded source authorization checks occur outside SQL transactions; the final transaction rechecks local roles, policy and original evidence.

Read original SQL receipt data without submit, lookup or fact refresh. Responses carry historical/currentReadAuthorized, original source times and current reviewedAt/reviewHash. Decimal strings, units and periods are preserved. Hypotheses/recommendations remain unverified; mathematical, causal and efficiency claims are not validated. Historical analysis is not current business fact. Original provider-reported usage is not invoice reconciliation.

Explicitly revoked observations remain blocked. Expired or restore-suspended observations may undergo a new current-authority read without reactivation, new model leases, budget refunds/reservations or execution. Restore disables enabled history policies and increments their version once, retains original output/evidence/usage, and invalidates old sessions. Re-enabling requires explicit IT confirmation.

Source revocation, tool drift, unapproved fields, expired/disabled policy or changed reader/granting-IT authority withholds the entire prose. Audit contains identity/version/hash metadata, not goals, prose or values. External authorization and local commit are not a distributed atomic transaction. Rechecks detect observed revocations; instant global revocation requires a source-supported versioned authorization lease.

Schema27 adds an isolated policy table. Same-code encrypted restore is not production cross-version upgrade. Windows/PGlite local contracts are reported separately from Linux, live models and vendor deployment. Unpublished.
