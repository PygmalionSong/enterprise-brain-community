# Product upgrades on native PostgreSQL

[中文](NATIVE_UPGRADE.md) · [Native service](NATIVE_SERVICE.en.md) · [Backup/restore](NATIVE_BACKUP_RESTORE.en.md) · [Allowance periods](NATIVE_BUDGET_PERIODS.en.md)

This page describes trusted local operations in a release candidate. Acceptance belongs to that exact source,SDK,portable package and actual upgrade record. Owned Windows x64/PostgreSQL17.11 evidence does not qualify a clean host,Linux,live models or an arbitrary enterprise. The upgrade changes product code and appended migrations;the supported database major remains PostgreSQL17. Database-major upgrades,HA and multi-node cutover are outside this contract.

Native format2 dedicated databases use a separate entry,not file-database recovery or upgrade commands. Both complete installations must be signed by an independently pinned publisher. Lockfile/runtime-profile changes currently refuse,and applied migration IDs/checksums cannot change. Models,business tools and business users receive no DBA credentials.

## Operations

All file arguments are absolute paths and JSON is UTF-8. Keep inputs and confirmations in private directories outside installations and Git. SHA-256 in these upgrade controls means actual file bytes;daily configuration/allowance-state hashes retain their own contracts;release-manifest hashes mean the UTF-8 bytes of `manifestText` inside `RELEASE.json`,not the outer wrapper. Use a fresh observation for each step and preserve inputs already bound to a pending operation.

```powershell
node scripts/plan-native-upgrade.mjs --input PLAN_INPUT --out PLAN_REPORT
node scripts/review-native-upgrade.mjs --input REVIEW_INPUT --out REVIEW_REPORT
node scripts/native-upgrade.mjs backup --input BACKUP_CONTROL_INPUT
node scripts/native-upgrade.mjs stop-source --input STOP_INPUT
node scripts/native-upgrade.mjs inspect --job JOB_DIRECTORY
node scripts/native-upgrade.mjs restore-target --input TARGET_CONTROL_INPUT
node scripts/native-upgrade.mjs commit-target --input TARGET_CONTROL_INPUT
node scripts/native-upgrade.mjs prepare-candidate --input CANDIDATE_INPUT
node scripts/native-upgrade.mjs commit-pointer --input CANDIDATE_INPUT
node scripts/native-upgrade.mjs managed-start --job JOB_DIRECTORY
node scripts/native-upgrade.mjs managed-status --job JOB_DIRECTORY
node scripts/native-upgrade.mjs managed-stop --job JOB_DIRECTORY
```

Uppercase names are placeholders for prepared absolute paths. Portable installations may use bundled `runtime/node.exe`. Planning/runtime review execute no candidate code,read no DBA credentials,migrate nothing and change no service. The original running foreground owner must park,drain and finish a fresh encrypted backup before explicit source stop. Taking a new owner after shutdown does not establish that backup.

The DBA explicitly prepares a different empty dedicated database,closes ordinary CONNECT and supplies agreeing restore/upgrade/runtime descriptors. The controller never creates,empties or overwrites its target. It fixes actual cluster/database identity before restoring,and checks complete original data,catalogue and migration contents afterward. Appended SQL,migration records,old-authority fencing,upgrade audit and final CONNECT grant share one transaction;exact expected state is fsynced before COMMIT. A real nonowner TLS connection independently verifies runtime qualification and fixed host grants afterward.

The candidate has a fresh deployment identity/private tokens and initial parked traffic at version0. Its admission barrier is written in staging before atomic configuration publication. Pointer commit releases only the exact candidate barrier;the source stays blocked. `managed-start` executes the actual candidate without activating traffic or installing models/tools. Later business data,control-token rotation and traffic changes are not compared to the initial whole-database snapshot. Status/stop retain the established control identity despite private descriptor drift;start still verifies the candidate descriptor.

The journal `committed_parked` stage fixes installation selection;later actual traffic comes from the candidate's daily traffic policy. Activation uses the candidate's own `enterprise-native.mjs activate` and exact version confirmation;see [native service](NATIVE_SERVICE.en.md). Historical spend,reservations and original receipts remain. New allowance periods and authority use [independent confirmation](NATIVE_BUDGET_PERIODS.en.md),not an upgrade-induced free reset.

## Private inputs

These fields match strict exported schemas;unexpected extensions refuse. Customer-authorized operations must explicitly supply each true acknowledgement.

| File | Required fields |
|---|---|
| Plan | `format: enterprise-brain.native-upgrade-plan-input/1`;`currentRoot`,`candidateRoot`,`publicKeyFile`,`pinnedFingerprint`,`currentConfigFile`;`expectedConfigurationSha256`,`expectedCurrentManifestSha256`,`expectedCandidateManifestSha256`;`planningAcknowledged: true` |
| Runtime review | `format: enterprise-brain.native-upgrade-runtime-review-input/1`;`planningInputFile`,`planFile`,`expectedPlanSha256`;`runtimeReviewAcknowledged: true` |
| Fresh backup control | `format: enterprise-brain.native-upgrade-backup-input/1`;`runtimeReviewInputFile`,`runtimeReviewFile`,`expectedRuntimeReviewSha256`,`backupInputFile`,`expectedBackupInputSha256`,`expectedSourceInstanceId`,`jobDirectory`;`freshBackupAcknowledged: true`. See [backup/restore](NATIVE_BACKUP_RESTORE.en.md) for the backup input |
| Source stop | `format: enterprise-brain.native-upgrade-stop-input/1`;`jobDirectory`,`expectedHeadSha256`;`sourceStopAcknowledged: true` |
| Target request | `format: enterprise-brain.native-upgrade-target-request/1`;complete `restoreDescriptorFile/Sha256`,`upgradeDescriptorFile/Sha256`,`runtimeDescriptorFile/Sha256` pairs;`maxMs`;true `targetRestoreAcknowledged`,`migrationAcknowledged`,`authorityFreezeAcknowledged`,`runtimeConnectGrantAcknowledged` |
| Target control | `format: enterprise-brain.native-upgrade-target-control/1`;`jobDirectory`,`expectedHeadSha256`,`expectedOwnershipSha256`,`targetRequestFile`,`targetRequestSha256`;`sourceMaintenanceAcknowledged: true`. Interrupted completion also needs `interruptedCompletionAcknowledged: true` |
| Candidate/pointer | `format: enterprise-brain.native-upgrade-candidate-input/1`;`targetControlInputFile`,`targetControlInputSha256`,`configurationFile`,`origin`,`port`;true `configurationAcknowledged`,`installationPointerAcknowledged`. Interrupted completion also needs `interruptedCompletionAcknowledged: true` |
| Source-only control | `format: enterprise-brain.native-upgrade-source-control/1`;`jobDirectory`,`expectedHeadSha256`,`expectedOwnershipSha256`;`sourceMaintenanceAcknowledged: true` |

`restoreDescriptorFile/Sha256` abbreviates the actual keys `restoreDescriptorFile` and `restoreDescriptorSha256`;other pairs follow the same rule. The restore descriptor has purpose `enterprise-brain.native-restore` and DBA field `restoreRole`;the upgrade descriptor has purpose `enterprise-brain.native-upgrade` and DBA field `upgradeRole`. All three agree on target address,database,enterprise,runtime role and verify-full mode,and both DBA role names agree. Runtime uses the existing [connection schema](NATIVE_RUNTIME.en.md). Reference private password/CA files;do not embed secrets in control inputs or terminal commands.

`inspect` reads current head/ownership hashes,pending producer and conservative commit markers without credentials or a database connection. A terminal file is reported only as `present_unverified` plus its hash,not as proof of successful abandonment/source release. Inspection never clears a lock,steals one by age or retries an operation.

## Interrupted completion and explicit abandonment

```powershell
node scripts/native-upgrade.mjs finish-target --input TARGET_CONTROL_INPUT
node scripts/native-upgrade.mjs finish-candidate --input CANDIDATE_INPUT
node scripts/native-upgrade.mjs finish-pointer --input CANDIDATE_INPUT
node scripts/native-upgrade.mjs abandon --input ABANDONMENT_INPUT
node scripts/native-upgrade.mjs abandon-target --input RESTORED_ABANDONMENT_INPUT
node scripts/native-upgrade.mjs finish-abandonment --input ABANDONMENT_INPUT
```

A new controller confirms actual producer exit and checks exact checkpoint,physical target,worker identity and real outcome. It never replays pg_restore or appended SQL. A complete raw restore can finish read-only;an actual empty rollback cannot masquerade as successful restore. Missing/changed worker identity,live children,unknown directories or unprovable database state remain blocked rather than relaxing verification.

Pre-dispatch `abandon` takes format `enterprise-brain.native-upgrade-abandonment-input/1`,`sourceControlInputFile`,`sourceControlInputSha256`,and true `abandonmentAcknowledged`. For a restored-uncommitted target or a restore-pending step with exited workers,`abandon-target` takes format `enterprise-brain.native-upgrade-restored-abandonment-input/1`,`targetControlInputFile`,`targetControlInputSha256`,and the same explicit acknowledgement. Independently prove either the exact original raw point,or—only during restore pending—a completely rolled-back empty target with CONNECT still closed. Missing commit receipts alone prove nothing.

After terminal-declaration persistence and interruption,`finish-abandonment` adds the exact `abandonmentSha256` and true `interruptedCompletionAcknowledged` to the source-only wrapper above. It rechecks source/target and releases only the exact source barrier,without starting the source or modifying target data. The job is never reused;normal business after release is not compared to the old snapshot. An actual upgrade commit,database-completion receipt or installation pointer prohibits source release and requires forward inspection/repair,not automatic rollback or revival of old approvals,sessions,models or allowances.
