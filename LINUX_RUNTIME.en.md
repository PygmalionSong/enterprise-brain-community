# Ubuntu native runtime and backup/restore contracts

[中文](LINUX_RUNTIME.md)

This page describes Ubuntu contracts in the open-source foundation. The source preview includes no complete industry product or signed runtime bundle. Source execution needs operator-provided Node24.19.0 and locked dependencies. The PGlite reference case and native PostgreSQL enterprise entry are distinct routes; do not change profile to bypass guards.

The native declared environment is Ubuntu24.04x64/PostgreSQL17.11/systemd255 user manager/cgroupv2 and a dedicated non-root account. An administrator explicitly prepares dedicated databases, DBA/runtime/backup roles, verify-full certificates and a tool inventory. The source does not install databases, change system trust, configure linger or register boot services. No default password is supplied.

Invoke `node scripts/enterprise-native.mjs ACTION --config /absolute/private/config.json`, adding `--input /absolute/private/request.json` where required. DBA-confirmed prepare/adopt initializes or adopts; start/status/stop control explicit configuration. See[NATIVE_BACKUP_RESTORE](NATIVE_BACKUP_RESTORE.en.md) for private request fields. Keep credentials, certificates, configuration, backups and work directories outside installation; never put passwords in arguments.

Managed startup/restore creates a separate systemd user primary; fixed task workers use BindsTo units and verify primary identity, invocation, cgroup and captured kernel handles. Missing prerequisites fail closed, without recorded-PID fallback termination. Windows retains its separate Job worker/format1 evidence rather than fabricated Linux ownership.

Ubuntu tool manifests use format2/platform `linux-x64-ubuntu24`/postgresVersion `17.11`, listing every bin/lib file with path, size, SHA256 and mode. Programs use0755; ordinary libraries0644or0755. Real non-symlink roots and account-owned files are required; pg_dump/pg_restore/libpq.so.5 require ELFx64 and actual version checks. Added/missing/changed files or modes are rejected. OS shared libraries remain inside the declared Ubuntu trust boundary, not arbitrary-distribution or hostile-same-account isolation proof.

Only fixed dump/restore commands run, with no PATH discovery or arbitrary executable/SQL/arguments. Clients start only after readiness, durable identity confirmation and explicit arming. Authenticated bounded frames are not a complete recovery point until completion. Cancellation/primary death affects only owned tasks; acceptance does not imply success.

Restore requires a completely authenticated archive and a new empty dedicated target with ordinary CONNECT closed. SQL restore, content validation, authority fencing and configuration publication are separate; runtime CONNECT is granted last. Lost connections/uncertain commits retain quarantine for reconciliation, not automatic resubmission, original-database overwrite or assumed rollback. A completed restore prepares parked configuration rather than execution authority.

inspect-backup produces the exact abandoned-task recovery plan; recover-backup follows verified owner/worker exit. It does not qualify incomplete archives or terminate arbitrary recorded PIDs. Signed upgrade readers handle Windowsformat1/Ubuntuformat2 evidence; see[NATIVE_UPGRADE](NATIVE_UPGRADE.en.md). This unsigned source tree is not a complete signed product; upgrades require two explicitly supplied complete signed installations.

Constructed sources/public protocols validate infrastructure, not customer deployment, universal vendor versions, real-model quality, HA, unbounded capacity or production SLA. Follow actual version/platform-specific evidence.

The legacy PGlite signed managed-migration/rehearsal route remains Windows-only. Native PostgreSQL backup/restore and native signed-upgrade contracts are separate; this source update does not claim Linux PGlite managed migration.
