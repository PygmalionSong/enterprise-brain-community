# Read-only receipt recovery under current authority

[中文](RECEIPTS.md) · [Enterprise host](HOST.en.md)

Credential rotation/revocation must prevent old dispatch grants from continuing without stranding accepted receipts. POST `/v1/graph/runs/{runId}/recover-receipt` lets the same enterprise's current initiator or executive query an original action,subject to current tool authorize. IT identity administrators,unrelated business owners,auditors/foreign tenants gain no privilege. Normal parked admission still applies.

Strict JSON:expectedVersion(current run),actionId(original action UUID),receiptLookupAcknowledged:true. Require current business session/canonical Origin/CSRF. Forged roles,old sessions/unconfirmed model output are insufficient. The flag is explicit API acknowledgement,not independently verified human business evaluation.

Match frozen node/arguments/tool ID/version/effect/action relation. Only accepted/unknown/dispatching actions without another live lease qualify. Call lookup with the original UUID,never submit/create replacement actions/change initiator authorization/approval/deadline or revive revoked plans/approvals. Current source authorization still applies. Installed lookup must retain original source semantics/actually be read-only;LLM text is not financial/vendor receipt signature proof.

Authorization waiting/lookup are separately bounded;recheck current role version/lease fence after async authorization. Late authorization completion after timeout cannot trigger lookup/submit. Trusted in-process callbacks may themselves be uncancellable;timeout never proves external cancellation. Tool authors must not hold database transactions across external authorization network waits.

Validate action reference/known receiptRef. Unknown/inconsistent responses never complete nodes. Store facts on the original action/receipt and leave the run waiting_input rather than dispatching successors. Cancelled orchestration can still have completed source work;run.cancelled does not prove source-order cancellation. Invalid original write grants remain invalid for step.

Each explicit acknowledgement permits one lookup,incrementing cumulative lookup_count without resetting automatic budget. Refuse recovery at100;automatic20-limit remains. Current run version/15-second lease/fence serialize callers. Refresh on conflicts rather than blind retry. No pending action409,exhausted recovery429,authorization timeout/corrupt data503. Adapter errors never expose SQL/credentials.

This restores fact visibility,not ownership transfer,execution resumption or source-transaction reversal. Further responsibility/process repair still needs current business review/approval. Checks use independent constructed SQL/local HTTP,not vendor rollout/live-model performance.
