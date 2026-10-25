# Local model quota periods

[中文](BUDGET_PERIODS.md)

Planning and business inference share one current local reservation ceiling. Ordinary configuration,installation,restart,cancellation,unknown results and restore never refund old reservations. Explicit period closure preserves an immutable archive and creates a disabled new configuration identity. This grants additional local authority,not refunds,automatic renewal,provider reconciliation or complete billing.

## Private stopped-instance operation

Stop the instance first. Run node scripts/enterprise.mjs budget-period --config ABSOLUTE_CONFIG --input ABSOLUTE_PRIVATE_INPUT. Windows portable uses EnterpriseAction budget-period,EnterpriseConfig and PrivateInput. The shared models maintenance claim excludes startup/backup/recovery. Existing live or stale instance locks refuse access without automatic takeover. Schema must be current,deployment SHA unchanged,and the operator current IT. No browser API or calendar-based renewal.

Input: principalId,expectedConfigurationSha256,action. action:inspect accepts no extra fields and returns current configuration version,snapshotHash,current reservations,closed-period count,known local reservations across all periods,and external-spend uncertainty. action:close-and-open additionally accepts period containing expectedVersion,snapshotHash,idempotencyKey,reason,newPeriodAcknowledged:true,and optional unknownExternalSpendAcknowledged/externalAccountingMaterialSha256.

Ordinary reason:routine_renewal. A restored configuration requires post_restore_new_allowance,unknownExternalSpendAcknowledged:true,an accounting-material SHA and a local restore identity. The SHA identifies an operator reference;it proves neither authenticity nor invoice settlement. Never reuse an old period key for another period. Exact retries return the original receipt only.

## Atomicity and history

Schema28 adds an isolated immutable archive table/function without changing old constraints. One transaction checks current authority/configuration/whole-ledger snapshot,archives the original configuration ID/version/limits/reservations,request inventory digest and restore uncertainty,terminates old reserved leases as unknown,deletes installation references,disables model-dependent analysis policy,and rotates configuration ID with increased version. The new configuration is disabled;zero current counters apply only to its new period.

Original requests,inputs,analysis output,reported usage,actions,approvals and adopted plans remain. Old keys return old records;old candidates never become adoptable again through renewal. Late results cannot use new authority or resurrect output. Independent history policy remains subject to current source/field authority and grants no inference. New model installation,budget and business analysis policy each require explicit confirmation.

Aggregates combine known local reservations from every closed/current period;providerInvoiceVerified=false. Backups cannot establish external spend after their snapshot. Explicit operator acceptance and a new period do not erase that uncertainty. Another restore preserves immutable archives and again disables current budget/installation pending fresh confirmation. Multiple machines/restored branches do not coordinate a global provider quota.

Current bounds:180 calls per period,64–8192 output per call,1474560 total output reserved,200 closed archives,500 planning and500 business request records across all history. Renewal never deletes records to evade capacity. Long-term retention,external billing and distributed accounting remain separate work. No unlimited-availability or cost-reduction claim. Each version requires independent SDK,full regression,actual CLI/signed installation/recovery acceptance;older packages exclude this capability. Linux/live-model and production-cutover results remain separate. Unpublished.

Native format2 uses the separate [native period CLI](NATIVE_BUDGET_PERIODS.en.md), retaining current IT/snapshot CAS/immutable history/unknown-spend acknowledgements and adding actual database ownership. The enterprise.mjs command above is not a native deployment entry.
