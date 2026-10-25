# Independent enterprise host and local operations

Every requested enterprise parent lock after current-identity validation must return exactly the intended row;zero/wrong rows refuse rather than treating successful SQL execution as lock acquisition. Existing UPDATE/SHARE modes and identity-before-enterprise ordering remain;CSV locks only its existing quota-write path. The guard neither sets context nor elevates privileges. Native login defaults are not authorization credentials;trusted raw database capabilities can select other contexts. Enterprise hosting remains PGlite-only pending integrated native credentials/TLS/operations qualification.

[中文](HOST.md) · [Accounts](src/identity/operators.ts) · [Graph runtime](src/runtime/graph-http.ts)

The new `scripts/enterprise.mjs` entry uses separate private configuration/storage. It never calls the demo entry or loads beverage fixtures, owned HTTP/SQL demo sources, mock models or demo sessions. Start-Local and the operating cockpit remain a separate reference case. The enterprise host supplies three-language login/account administration, identity APIs, process registration and controlled graph plans. An empty business workspace explicitly remains unconfigured rather than receiving old-case/fallback facts.

Current declared scope is Windows x64/Node24.19.0, single-process PGlite on loopback and a trusted HTTPS-proxy contract. Local TLS/CLI/recovery do not establish clean hosts, native PostgreSQL, public certificates, enterprise networking/HA or SSO/MFA. The backend binds127.0.0.1 only. Unconfigured models stay not_configured without mock fallback. The default tool is `process.definition.read@v1`, returning reviewed process revision summaries. Other business tools require trusted installed code; HTTP cannot install arbitrary scripts/endpoints.

## Initialize and start

Build first. Replace ABSOLUTE arguments with actual absolute paths in enterprise private storage. Credentials must not be command arguments. An installed copy can use bundled `runtime/node.exe` with the same entry.

```text
node scripts/build.mjs
node scripts/enterprise.mjs init --config ABSOLUTE_NEW_PRIVATE_CONFIG --input ABSOLUTE_PRIVATE_INPUT
node scripts/enterprise.mjs start --config ABSOLUTE_PRIVATE_CONFIG
node scripts/enterprise.mjs status --config ABSOLUTE_PRIVATE_CONFIG
node scripts/enterprise.mjs stop --config ABSOLUTE_PRIVATE_CONFIG
```

The Windows portable entry verifies signatures/runtime/all files before this channel: `Launch.ps1 -EnterpriseConfig ABSOLUTE_PRIVATE_CONFIG`. Initialize with `-EnterpriseAction init -PrivateInput ABSOLUTE_PRIVATE_INPUT`; use the corresponding EnterpriseAction for status/stop/backup, adding EnterpriseArchive/RecoveryKey paths for restore. Without EnterpriseConfig, the reference demo remains the default; channels do not mix.

Private JSON input contains name, timezone(valid IANA zone), origin(canonical HTTPS origin without trailing slash), port(loopback backend1024–65535), username and password. enterpriseId/currency are optional; currency defaults CNY and also permits USD/JPY/EUR. Supply your own strong password of at least14 Unicode code points and at most72 UTF-8 bytes. There are no default/example credentials. Operators protect/dispose of the original input file; commands never print its password and do not delete it on the operator's behalf.

Initialization requires a new config/state directory and creates a separate enterprise, first IT identity administrator and private secret files. Existing config is not overwritten. Inspect any partial private initialization before handling it; do not substitute old-enterprise state. Configuration, proxy/control secrets, database and backups stay outside Git/public packages. File mode is not Windows ACL provisioning; restrict the directory to the service account/administrators.

start is foreground and records PID/port/instance UUID/deployment UUID/config SHA. Duplicate startup checks actual health identity. Mismatch, occupied ports, stale locks, indirect paths and invalid secrets fail without killing same-name/port processes. Normal shutdown verifies health/lock before sending its private control secret. Each new start rotates control authority while proxy authority remains stable.

Start, stop and backup share an operation.json claim. Conflicts fail immediately without queues or age-based takeover. Backup holds the claim from identity checks/shutdown through archive encryption, preventing another command from restarting the database. After a crash, run `node scripts/enterprise.mjs inspect-locks --config ABSOLUTE_PRIVATE_CONFIG`, save its plan object as private JSON and review deployment, instance/operation UUIDs, PIDs and hashes. Then run `node scripts/enterprise.mjs recover-locks --config ABSOLUTE_PRIVATE_CONFIG --input ABSOLUTE_PRIVATE_PLAN`. Portable EnterpriseAction accepts inspect-locks/recover-locks; the latter uses PrivateInput.

Recovery requires an exact current plan, both original PIDs absent and exclusive binding of the configured port. Live/reused PIDs, occupied ports, changed plans and another recovery fail. It removes only those stale claims, never kills processes, opens the database or starts a service. A lock-recovery.json claim blocks start/stop/backup; if that claim itself survives a crash, it is never automatically stolen. Preserve private storage, establish that no operations process exists and use controlled manual handling or verified same-code recovery. This cooperative local protocol is neither HA nor a database lock against arbitrary external programs.

## TLS and interface

Readiness follows the installation's complete ordered SQL migration IDs/hashes,not a fixed schema count. Initialization/start reject gaps,non-SQL/indirect/oversized inventory before migrations. /health reports actual schema,expectedSchema and schemaState(current/mismatch/unavailable). ID/checksum drift or metadata-query failure returns503 while retaining instance identity for local operations. Normal proxied traffic also fails closed,without creating login sessions or dispatching workflow actions.

status explicitly reports unavailable;duplicate start does not replace a degraded instance. stop accepts health503 only with matching application/enterprise mode/instance UUID and consistent HTTP/body status,then sends private control authority. Other ports/instances,forged status or other HTTP errors never receive it. This stops authenticated degraded instances without automatically repairing data or claiming backup repairs corruption.

The enterprise proxy terminates HTTPS and forwards to loopback. Backend Host must be127.0.0.1:backend-port or localhost:backend-port. Override X-EB-Proxy with the private proxy-token file's value; never trust a client-supplied header. Keep it out of browser/public config/logs. Public proxy routes reject /health, /ops/ and /_dev/; health/shutdown are local operations only. The backend never trusts Forwarded/X-Forwarded identity, tenant or origin claims.

The canonical root redirects unauthenticated users to/login, identity administrators to/console and other accounts to/workspace. Sessions use __Host-eb_session with Secure/HttpOnly/SameSite=Strict; writes require canonical Origin and CSRF. Process-local global/account failure budgets and concurrency bounds are not distributed anti-abuse. Chinese/English/Japanese share code; responsive access/account views retain language-only preferences and work with storage disabled. The reference boss cockpit is not embedded in the identity console.

| API | Contract |
|---|---|
| POST /v1/identity/session | username/password; canonical TLS Origin, JSON, bounded login; returns CSRF/Secure Cookie |
| GET /v1/context | Current principal, role, authority version and fresh CSRF |
| POST /v1/identity/logout | Empty object/current session/CSRF; revoke and clear cookie |
| GET/POST /v1/identity/operators | Independent identity administrator lists/creates; ordinary IT denied |
| POST /v1/identity/operators/{id}/change | expectedVersion, changes(role/disabled/identityAdministrator) |
| POST /v1/identity/operators/{id}/password | expectedVersion/password |
| POST /v1/identity/operators/{id}/revoke-sessions | expectedVersion |
| /v1/it/process-registry, /v1/it/graph, /v1/graph | Existing process/graph contracts, current authority and separate business approval; no arbitrary source actions |

Identity bodies are capped64KiB; process/graph retain400/600KiB limits. Request/header/keepalive limits are10/5/5 seconds. Responses expose only allowed codes/correlation UUIDs, never credentials or SQL exceptions.

## Encrypted enterprise backup/recovery

```text
node scripts/enterprise.mjs backup --config ABSOLUTE_PRIVATE_CONFIG
node scripts/enterprise.mjs restore --config ABSOLUTE_NEW_PRIVATE_CONFIG --archive ABSOLUTE_ARCHIVE --key ABSOLUTE_RECOVERY_KEY
node scripts/enterprise.mjs start --config ABSOLUTE_RESTORED_CONFIG
```

backup identifies/stops its own instance and encrypts the separate enterprise database instead of demo volumes. AES-256-GCM, per-file SHA, path/duplicate/size checks apply, bounded to5000 files/128MiB raw data. Archives/keys are written under private backups storage without printing key contents; operators protect keys separately. Large databases/native PostgreSQL/online backup are unsupported.

restore requires new config/state and checks a combined source/migration/dependency-lock/stage-definition/CLI/local-transport/portable-template fingerprint, refusing cross-code restoration. It retains enterprise/deployment identity, accounts/grants, process definitions/graph plans/actions/events and proxy authority. Control authority is freshly generated and rotates again on startup. All restored browser sessions are invalidated with audit while authorization versions/action UUIDs remain intact. Reauthentication is required before resuming; expired approvals never grant new dispatch. Recovery does not auto-start or establish cross-version upgrades/migration rollback/HA takeover. Formal upgrade tooling remains work.

Report constructed data, standard-contract verification, actual models and enterprise integrations separately. Actual customer access/model human comparisons are not prerequisites for foundation engineering; unconnected systems remain unsupported. Full cockpit map rights/cartographic publication gates remain, and those historical assets never become enterprise facts.

The independent host also persists active/parked admission. traffic-status reads versions;park bounds drain;activate requires a running current-schema instance. PrivateInput/--input JSON supplies expectedVersion/optional waitMs. Legacy missing policies default parked;new initialization explicitly active. Backup/recovery retains policy;parking never cancels business actions. See this release's TRAFFIC contract.
