# Native deployment recovery after an abnormal exit

[中文](NATIVE_MAINTENANCE.md) · [Native foreground](NATIVE_SERVICE.en.md)

This entry inspects and clears confirmed dead local instance/operation claims. It does not connect to the enterprise database, terminate processes, start a service, change accounts, graphs, receipts, delegation or model budgets, or take over a database. It accepts explicit private format2 configuration only. Format1 retains its separate enterprise.mjs maintenance contract.

Run the read-only inspection first and save the entire returned plan object unchanged as private JSON. Keep both reports and recovery input out of public repositories:

```sh
node scripts/enterprise-native.mjs inspect-locks --config ABSOLUTE_PRIVATE_CONFIG_JSON
node scripts/enterprise-native.mjs recover-locks --config ABSOLUTE_PRIVATE_CONFIG_JSON --input ABSOLUTE_PRIVATE_PLAN_JSON
```

Input is the entire plan object, not the inspection envelope or a fabricated PID-only request. It binds the deployment UUID and exact instance/operation UUIDs, PIDs and digests; claims also bind the full actual configuration hash. Only matching dead claims are removed, after both original processes are absent, the loopback port can be bound, the exact plan remains unchanged and an exclusive recovery claim is acquired. PID reuse counts as a live owner. Live processes, occupied ports, stale plans, configuration changes and an existing recovery claim refuse recovery. Claim age never authorizes deletion. An abandoned recovery claim remains for operator ownership investigation rather than automatic takeover.

Recovery returns started:false and processesTerminated:0. The operator must explicitly start the service afterward. Clearing local files does not establish remote database availability: start still verifies the current descriptor SHA, native qualification, exclusive database ownership and surviving connection checks. Another deployment owning that database still prevents start. Do not terminate unknown PostgreSQL backends to bypass this condition.

Descriptor drift or an offline database does not prevent exact local recovery, and does not weaken strict start/activate descriptor checks. Graphs, actions, original receipts, idempotency keys and budgets remain in the original database; recovery neither reapproves nor resubmits actions. Prefer normal stop whenever possible. This feature does not qualify native pg_dump/pg_restore, cross-version upgrades, HA, clean hosts or Linux.


[Native backup/new-database restore](NATIVE_BACKUP_RESTORE.en.md) has a separate contract;local dead-lock recovery is not backup-task recovery.
