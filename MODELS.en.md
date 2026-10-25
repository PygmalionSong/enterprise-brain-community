# Private model installation and planning endpoints

[中文](MODELS.md) · [Model core](PLANNING_MODEL_CORE.en.md) · [Enterprise host](HOST.en.md) · [Traffic](TRAFFIC.en.md)

Schema21 commits installation metadata and durable budgets in one enterprise transaction.Default uninstalled: no model contact/download,automatic cloud routing or mock/beverage fallback.Only explicit127.0.0.1structured HTTP Responses/Chat Completions protocols are supported.Customers host their model service and manage credentials.

While stopped,run `node scripts/enterprise.mjs model-status --config ABSOLUTE_PRIVATE_CONFIG` for deployment `configurationSha256` and budget `configurationVersion`.The current IT operator obtains `principalId` from authenticated GET`/v1/context`.Save the following as a private file,replacing uppercase placeholders.`tokenFile` may be null or point to a private file containing1–8192printable ASCII characters without a newline.Never put tokens in command arguments,Git or documentation.

```json
{
  "action": "install",
  "principalId": "CURRENT_IT_UUID",
  "expectedConfigurationSha256": "DEPLOYMENT_SHA256",
  "installation": {
    "expectedVersion": 0,
    "installationAcknowledged": true,
    "descriptor": {
      "format": 1,
      "dialect": "responses",
      "endpoint": "http://127.0.0.1:8000/v1/responses",
      "model": "YOUR_EXACT_LOCAL_MODEL",
      "tokenFile": null
    },
    "budget": {
      "maxCalls": 30,
      "maxOutputTokens": 1024,
      "outputTokenBudget": 30720,
      "timeoutMs": 30000,
      "ttlSeconds": 1800
    }
  }
}
```

Run `node scripts/enterprise.mjs configure-model --config ABSOLUTE_PRIVATE_CONFIG --input ABSOLUTE_PRIVATE_INPUT`,then start normally.The Windows portable launcher accepts `Launch.ps1 -EnterpriseConfig ABSOLUTE_PRIVATE_CONFIG -EnterpriseAction model-status` or `configure-model -PrivateInput ABSOLUTE_PRIVATE_INPUT`.Initialization/other operations remain unchanged.Active instances,shared operations,wrong deployment SHA/budget versions reject changes.Configuration inspection makes no RPC.`configured_local_contract` verifies configuration only,not model reachability or output quality.

Pin source/protocol/configuration/credential digests.Credential/source drift blocks factories.Check installation before/after RPC and recheck current IT/configuration/process scope after async setup.Private status accepts local-control credentials only,denying browser Origin/proxy headers.Status/results expose neither tokens nor private paths.Business users cannot install or request IT planning.

Independent-host IT endpoints require current sessions;POST also requires canonical Origin/CSRF:

- POST`/v1/it/graph/planning/candidates`:`goal,scope,expectedConfigurationVersion,idempotencyKey`.Use the [context contract](PLANNING_CONTEXT.en.md) for explicitly selected current processes/tools.
- GET`/v1/it/graph/planning/requests/KEY`: inspect by original key while waiting;disconnect is not cancellation.
- GET`/v1/it/graph/planning/candidates/UUID`: read the durable candidate.
- POST`/v1/it/graph/planning/candidates/UUID/cancel`:`{expectedVersion}`,durably invalidate before requesting abort.

The initial handler waits for a bounded model response.Repeated keys inspect the original record without another call.Disconnect does not release Traffic admission early;parking waits for real completion.Timeout/cancel/unknown retain call/maximum-output reservations.Reported tokens are separate,not verified invoices.Completed means structurally reviewed candidate only.No automatic compilation,approval or business execution.Adoption still requires current-source review,explicit IT compilation and separate business approval.

Uninstall uses `action:'uninstall',principalId,expectedConfigurationSha256,expectedVersion,uninstallAcknowledged:true` while stopped.Uninstall/reinstall retain the stable budget ID/counters.Current caps:180total calls,8192output tokens/call,1474560total reservations and at most one-hour configuration.These are bounded authorization,not unlimited operating budgets.

Encrypted restore removes installation references,revokes sessions,suspends planning configuration exactly once and preserves budget/candidates plus `reconciliationRequired`.Old snapshots cannot establish subsequent external spend.Ordinary reinstallation cannot clear this block.IT may explicitly close/archive a [local quota period](BUDGET_PERIODS.en.md) while stopped and create a disabled new configuration.Unknown external spend/unverified invoices remain explicit.Linux/live models/native enterprise hosting/clean hosts remain unverified.Local protocols prove neither live AI/vendor compatibility nor a complete enterprise brain.Customer-installed business tools/field authority remain necessary;boss-goal UI is not connected.Signed-product [managed upgrades](UPGRADE_CONTROL.en.md) do not qualify every historical contract change.The approved operating showcase is preserved.


See [candidate adoption](CANDIDATE_ADOPTION.en.md) for explicit frozen-plan creation; independent business approval remains required and no automatic execution occurs.


Explicit [quota periods](BUDGET_PERIODS.en.md) preserve old reservations in immutable archives and create disabled new configuration identities. Post-restore operator assertions do not verify provider invoices. Ordinary installation still cannot bypass restore gating.
