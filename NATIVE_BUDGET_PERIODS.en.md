# Native model allowance periods

[中文](NATIVE_BUDGET_PERIODS.md) · [Period storage contract](BUDGET_PERIODS.en.md) · [Native daily configuration](NATIVE_AGENT_CONFIGURATION.en.md)

Native format2 deployments use a separate private stopped-instance command:

```text
node scripts/enterprise-native.mjs budget-period --config ABSOLUTE_PRIVATE_CONFIG_JSON --input ABSOLUTE_PRIVATE_INPUT_JSON
```

The old `scripts/enterprise.mjs budget-period` remains format1 only. Do not interchange them or place connection strings/passwords in arguments. Native operations reuse the existing period core,durable reservation ledger and strict runtime connection. They do not migrate,add grants,grant BYPASS or use a DBA database object for daily allowances.

Requests supply `principalId`, `expectedConfigurationSha256` and `action`. Obtain the configuration hash from current model/tool status. The actor must be current same-enterprise IT. `inspect` reads an existing period without creating a default allowance. It returns current `version`, `snapshotHash`, call/output-token reservations,closed-period count,all-period known local reservations and external-spend uncertainty. It excludes endpoints,credentials,request prose and provider invoices.

`close-and-open` adds `period`: `expectedVersion`, `snapshotHash`, `idempotencyKey`, `reason` and `newPeriodAcknowledged:true`. Routine rotation uses `routine_renewal`. After restore,require `post_restore_new_allowance`, `unknownExternalSpendAcknowledged:true`, `externalAccountingMaterialSha256` and a same-enterprise successful-restore database audit. Both legacy `enterprise_restored` and native `native_enterprise_restored` are recognized. Failure records or local files alone do not prove a restore identity. The material hash is an operator-asserted reference;`providerInvoiceVerified` remains false.

Inspection/rotation retain the local models claim and require a stopped instance,no unfinished backup and actual database ownership. Another directory owning the database,live/stale locks,changed configuration,invalid actors and version/snapshot conflicts refuse. Age never authorizes takeover. Precommit owner/configuration loss rolls back the transaction. Corrupt archives or inconsistent ledgers return fixed errors without ignoring or rewriting history.

Rotation immutably archives the old configuration,request inventory hash,call/token reservations,unknown-spend state and restore identity. Requests,analyses,actions and receipts remain. The new configuration ID's zero counters belong only to that new period;aggregate summaries still include prior reservations. Old pending work becomes unknown and loses leases. Model installation references are removed and related analysis policies disabled. The new allowance/model remain disabled,without reapproving or replaying old work or making calls.

The exact original idempotent request under the same actor/epoch returns its original receipt. Changed materials,reason or authority epoch is a different operation. Operators must separately install a model and set its budget explicitly. Installation and normal restart make no automatic model calls. A later restore retains closed history and fences the current allowance again.

This local ledger is not a provider invoice,global multi-node cost coordinator or refund. Restored copies cannot prove actual post-snapshot consumption;acknowledging unknown spend does not remove uncertainty. Existing per-period/history capacity limits apply. Linux,live models,clean hosts and native cross-version upgrades require separate verification;local protocols do not establish model quality or business benefit.

Successful native product upgrades use the actual same-enterprise `native_enterprise_upgraded` audit,alongside legacy `enterprise_restored` and `native_enterprise_restored`. The stable reason remains `post_restore_new_allowance`;the archive `restoreId` may reference the real upgrade audit ID without fabricating a restore event.Unknown-spend acknowledgement and material references remain required.
