# Adopt a planning candidate as a frozen plan

[中文](CANDIDATE_ADOPTION.md)

IT can explicitly adopt a structurally validated model candidate without copying tool arguments. Adoption only creates a frozen plan. Existing graph APIs separately require business approval, tool authorization and execution. Adoption calls neither the model nor a business source.

On the independent enterprise host, a current IT session sends its usual CSRF/Origin headers to `POST /v1/it/graph/planning/candidates/{id}/adopt`:

```json
{"expectedVersion":2,"contextHash":"64-character SHA256 returned by the candidate","adoptionAcknowledged":true}
```

Read expectedVersion/contextHash from the candidate; the example hash is an explanatory placeholder. Requests cannot replace scope, tools, arguments or plans. Responses contain plan id/version/planHash/taskCount/policy, candidateId, reused and explicit businessAuthorized=false/executed=false. Retrying the original request returns the same plan, including after a lost response or at plan capacity, without consuming another plan slot.

Adoption reconstructs the current process/tool scope and checks the original request/output, originating IT operator, source reviewers, configuration and versions. Plan insertion, mapping, candidate version increment and audit commit in one transaction; failure rolls all back. Need-input, cancelled, unknown, invalid or expired candidates cannot be adopted. Plans remain controlled acyclic graphs with fixed arguments; this does not imply dynamic business data mapping.

After adoption, GET candidate returns compiled=true and an adoption plan reference, retaining its output. Candidate cancellation returns409 planning_already_adopted. Use the existing IT plan revocation API to revoke a plan; existing runs retain their cancellation/receipt contracts. Reading a historical adoption after configuration expiry restores no business authority. Invalid input422, unauthorized403, missing404, version/state conflict409, capacity429 and corrupt mapping503.

Database restart and same-code encrypted recovery retain the mapping. Recovery still disables model configuration/background delegation and invalidates old sessions. It never adopts, approves or dispatches automatically. Schema22 is additive. Validate [upgrade preflight](HOST.en.md) and [shadow rehearsal](HOST.en.md) before replacing an active instance.

Owned model-protocol and SQL-source tests do not establish live model quality, vendor compatibility or business effectiveness. Linux, actual models and production integrations require their own verification. [Local quota periods](BUDGET_PERIODS.en.md) retain old reservations/uncertain external spend;[business observations](BUSINESS_OBSERVATIONS.en.md) have a separate current-authority contract.Provider invoice verification,executive goal UX and production cutover remain incomplete. See [model installation](MODELS.en.md), [planning storage](PLANNING_STORAGE.en.md) and [controlled graphs](HOST.en.md).
