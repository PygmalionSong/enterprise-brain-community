# Native PostgreSQL encrypted backup and new-database restore

[中文](NATIVE_BACKUP_RESTORE.md) · [Native host](NATIVE_SERVICE.en.md) · [Local lock recovery](NATIVE_MAINTENANCE.en.md)

Private operations for customer-hosted infrastructure. Current implementation is bounded to Windows x64, Node 24.19.0, PostgreSQL 17.11, one dedicated enterprise database and DBA-prepared roles. A pinned manifest covers the entire tool `bin/` and `lib/` trees. There is no PATH discovery, automatic PostgreSQL download or service installation. Local contracts do not qualify Linux, clean hosts, large-database capacity or cross-cluster role preparation.

## Backup

The native foreground must be running. Backup retains its original exclusive database owner, persistently parks admission and drains original handlers before opening a repeatable-read snapshot through a separate read-only DBA-prepared backup role. The application login remains nonowner/NOBYPASSRLS. The backup role must read complete tables rather than an RLS subset, without writes, DDL or reachable role memberships.

```powershell
node scripts/enterprise-native.mjs traffic-status --config ABSOLUTE_PRIVATE_CONFIG_JSON
node scripts/enterprise-native.mjs backup --config ABSOLUTE_PRIVATE_CONFIG_JSON --input ABSOLUTE_BACKUP_REQUEST_JSON
node scripts/enterprise-native.mjs backup-status --config ABSOLUTE_PRIVATE_CONFIG_JSON
node scripts/enterprise-native.mjs cancel-backup --config ABSOLUTE_PRIVATE_CONFIG_JSON --input ABSOLUTE_CANCEL_JSON
```

The backup command acknowledges registration, not completion. The original foreground continues after CLI exit. A completed task and authenticated archive completion record are both required. Backup never reactivates traffic. Activation, shutdown and conflicting operations are refused meanwhile. Cancel input contains the current task `id` and `expectedVersion`, obtained from fresh status.

| Private backup request | Contract |
|---|---|
| `format`, `backupAcknowledged` | `1`, `true` |
| `expectedTrafficVersion` | Current persistent admission version |
| `backupDescriptorFile`, `backupDescriptorSha256` | Private connection descriptor and exact SHA256 |
| `toolManifestFile`, `toolManifestSha256` | Complete private tool manifest and exact SHA256 |
| `archiveDirectory`, `keyFile` | New archive directory and separate new key file outside installation; no overwrite |
| `maxBytes`, `timeoutMs` | Default 256 MiB/60 seconds; maximum 4 GiB/300 seconds. Bounds are not capacity certification |

The strict descriptor contains `format:1`, `purpose:"enterprise-brain.native-backup"`, `host`, `port`, `database`, `backupRole`, `enterpriseId`, private `passwordFile`, and `tls:{mode:"verify-full",caFile:...}`. It binds the same endpoint/database/enterprise as the runtime descriptor through a distinct identity. Passwords never appear in arguments. Paths must be canonical absolute OS paths; escape Windows backslashes in JSON.

The manifest contains `format:1`, `platform:"win32-x64"`, `postgresVersion:"17.11"`, canonical absolute `root`, and complete `files:[{path,bytes,sha256}]`. Relative paths must cover every file beneath `bin/` and `lib/`, including pg_dump, pg_restore and libpq. Extra files, links and conflicting versions refuse execution. Customer administrators must verify the official tool distribution and generate the complete manifest/hash; listing only three executables does not establish trusted dependencies.

A fixed pg_dump child is suspended and assigned to a private Windows Job before its identity is durably recorded and explicitly armed. Cancellation and parent/guardian death terminate only that owned process tree. No plaintext dump is persisted. Output uses authenticated 64-KiB AES-256-GCM frames and a separate key. Source/code/migrations/runtime-role identities are bound, with same-snapshot data and object/RLS/ACL hashes in the authenticated terminal frame. Completion is fsynced before exclusive publication; incomplete output is not a recovery point. The DBA must keep the dedicated database and sequences stable during the window; this is not a general backup protocol under concurrent DDL or arbitrary administrator writes.

## New-database restore

```powershell
node scripts/enterprise-native.mjs restore --config ABSOLUTE_NEW_PRIVATE_CONFIG_JSON --input ABSOLUTE_RESTORE_REQUEST_JSON
```

This is an explicit offline command, outside the executive workbench. The DBA precreates an empty target owned by the restore administrator and revokes CONNECT from PUBLIC, ordinary roles and the runtime role, leaving only the specified administrator. The initial entry requires an explicitly trusted superuser DBA to preserve original object ownership, RLS and ACL. Referenced global roles must already exist and match. No role creation/mapping or no-owner/no-acl shortcut is performed. The runtime login gains no superuser privilege.

The restore descriptor contains `format:1`, `purpose:"enterprise-brain.native-restore"`, `host`, `port`, `database`, `restoreRole`, `runtimeRole`, `enterpriseId`, private `passwordFile`, and `tls:{mode:"verify-full",caFile:...}`. Enterprise/runtime role must match the archive; source and nonempty targets refuse. Provide a separate final runtime descriptor bound to that target, still subject to [runtime qualification](NATIVE_RUNTIME.en.md).

| Strict restore request | Contract |
|---|---|
| `format` | `1` |
| `restoreAcknowledged`, `trustedSourceAcknowledged`, `runtimeConnectGrantAcknowledged` | All explicitly `true` |
| `archiveDirectory`, `keyFile` | Original archive and separate key |
| `restoreDescriptorFile`, `restoreDescriptorSha256` | Private DBA target descriptor and exact SHA256 |
| `toolManifestFile`, `toolManifestSha256` | Complete trusted tool inventory and exact SHA256 |
| `runtimeDescriptorFile`, `runtimeDescriptorSha256` | Target nonowner runtime descriptor and exact SHA256 |
| `origin`, `port` | Canonical HTTPS origin and new local backend port; customer TLS proxy still required |
| `workDirectory` | New private operation directory outside installation/archive/configuration; never reused |
| `maxBytes`, `timeoutMs` | Same defaults/bounds as backup, with a total restore deadline |

Full archive authentication and identical code/migration verification precede any target SQL. Replay authenticates every frame again. Experimental file containers without provenance/inventory cannot authorize database restore. Integrity does not make malicious SQL safe: restore only this product's backups controlled by trusted source administrators, never arbitrary third-party dumps.

The parent holds target database ownership while fixed pg_restore uses a single transaction against the empty database. Framed input requires an exact END. Parent death ends the owned Job even under data-pipe backpressure. Ordinary CONNECT remains blocked after SQL commit. Complete contents/migrations/objects/RLS/ACL are verified, then one outer transaction revokes old sessions/unused bootstrap grants, removes model installations, disables planning/supervision/event-sync/observations/analysis, revokes old execution approvals/source authority, and only then grants CONNECT to the fixed target runtime login.

Original action UUIDs, source receipts, idempotency keys, reservations and immutable closed budget archives remain. Pending model leases become unknown without resending, refunding or resetting budgets. New approval cannot substitute into old runs. Real nonowner TLS and required host privileges must qualify before fresh private configuration is committed. It starts parked/version0, without model installation or automatic service start/activation/dispatch.

## Failure and operator recovery

After backup foreground death, use inspect-backup and pass its exact complete plan to recover-backup. Recovery checks dead original processes, task identity and exact temporary credential contents. It stays parked, opens no database, kills no process and never promotes abandoned output to success. Only afterward may the independent [local lock recovery](NATIVE_MAINTENANCE.en.md) be applied. Age never permits stealing another instance.

Restore work directories retain phase records, request digests and completion/failure outcomes; no reuse or automatic retry. Failed targets may be empty or restored but quarantined. A later recording failure after configuration publication explicitly records that configuration was prepared; failure alone never authorizes overwriting it. The DBA must inspect target privileges, original process ownership, private records and existing configuration before remediation. There is no automatic database drop/clean, failed-claim deletion or service start. Parent death can leave private temporary credentials for controlled identity-bound handling, not unknown-file cleanup.

This is not cross-version migration, lossless rollback after writes, HA, arbitrary enterprise-system backup or production certification. Existing PGlite installation/backup/upgrade contracts retain their separate scope.
