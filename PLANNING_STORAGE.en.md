# Planning candidates and durable call reservations

[中文](PLANNING_STORAGE.md) · [Tool argument contracts](TOOL_CONTRACTS.en.md)

`src/runtime/planning-ledger.ts` is a programmatic storage core with two enterprise-isolated schema20 tables. Default unconfigured/off; no model HTTP calls, user planning entry, automatic compilation, business approval or graph execution. This is not a completed generic agent planner.

Trusted host code uses current IT authority for `configure/reserve/view/cancel`. Configuration stores the installed identity SHA and limits, without endpoint/credential data. `complete` is a trusted internal callback bound to enterprise/candidate/lease UUIDs, never an exposed HTTP input. Input snapshots/output remain in the enterprise database; audit records candidate IDs only. Business roles and forged/stale authority cannot use IT storage methods.

Configuration uses CAS and a stable UUID. Version changes never reset reservations. Limits:1–180total calls,64–8192maximum output tokens/call,64–1474560total reserved output tokens;configuration TTL30–3600seconds,call timeout20–60000milliseconds,result lease adds5seconds bounded by configuration expiry. These are software limits,not a monetary budget. Unknown/timeouts/refusals/cancellation never refund. Reported tokens are separate and cannot reduce reservations. Limits cannot fall below existing reservations.

`reserve` atomically charges limits and stores goal/context snapshot/hash,current IT authority,configuration identity/version,lease and idempotency key. Only the first reservation returns a dispatch lease;identical enterprise/key/input/operator returns the original record with `dispatch:null`. Different input/authority conflicts reject;no automatic redispatch. Context/output JSON is bounded to131072bytes,16levels and8192values;500candidates/enterprise. Closing a page is not cancellation.

Only a valid lease,current original authority and unchanged configuration can complete a candidate. Cancellation/configuration drift/revocation/expiry fence late results;expired pending work becomes unknown. `eligibleForStructuralReview` only means eligible for subsequent review now. Process/tool/output validation,explicit IT compilation and separate business approval remain necessary. It is neither task completion nor business authority. This core does not validate a particular business-candidate structure;callers must not bypass later deterministic validation.

Encrypted restore preserves snapshot reservations/history,disables configuration,marks pending candidates unknown and sets `reconciliation_required`. Old snapshots cannot establish later external model spend. Ordinary configuration cannot clear this block;clearing restore gating requires explicit operator acknowledgement and a [new local quota period](BUDGET_PERIODS.en.md),not ordinary reinstallation. Restore is not a fresh budget. Configuration/candidate changes also invalidate old output eligibility.

The trusted storage core is explicitly assembled through [model installation/planning entries](MODELS.en.md).Uninstalled defaults remain unconfigured.Current process/tool allowlists and bounded output validation stay separate,without mock/beverage-case fallback. Live models remain unverified; Ubuntu infrastructure scope is separate in LINUX_RUNTIME.en.md. Local SQL protocol tests do not prove AI efficacy or vendor compatibility.


See [candidate adoption](CANDIDATE_ADOPTION.en.md) for explicit frozen-plan creation; independent business approval remains required and no automatic execution occurs.


Explicit [quota periods](BUDGET_PERIODS.en.md) preserve old reservations in immutable archives and create disabled new configuration identities. Post-restore operator assertions do not verify provider invoices. Ordinary installation still cannot bypass restore gating.
