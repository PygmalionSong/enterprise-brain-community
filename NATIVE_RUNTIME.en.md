# Native runtime connection core

Current source scope: [Linux operations](LINUX_RUNTIME.en.md) and [validation notes](README.en.md) supersede the early connection-only qualification below. Historical exclusions describe that earlier step, not the current native backup/restore entry.
[中文](NATIVE_RUNTIME.md) · [Enterprise host](HOST.en.md) · [Native entry](NATIVE_HOST.en.md) · [Ownership](NATIVE_OWNERSHIP.en.md) · [Architecture](README.en.md)

The one-click and private CLI channels still use PGlite; the optional native programmatic entry has a separate contract. This core qualifies trusted native connections. It is not a complete native installation, migration, backup or recovery channel. The original factory still refuses native profiles. Only dedicated loopback Windows PostgreSQL 17.11 has been exercised; Linux, other versions and customer production remain unverified.

inspectNativeRuntime(database,input) reads currentPG17 identity,explicit enterprise and code migration inventory.Both login and SET-target eb_app must lack super/BYPASS/CREATEDB/CREATEROLE/replication,ownership,databaseCREATE/TEMP,user-schemaCREATE,executable user SECURITY DEFINER and migration writes(including column grants).Require SET-only membership,identity/parent-lock grants,parentRLS/FORCE,safe search_path/row_security,explicit tenant,enterprise-mode parent and exact migration IDs/hashes.No automatic repair/role/tenant setting or record writes.Fixed failure codes/counts always hostEnabled=false/authorizationGranted=false;no raw database errors.

connectNativeRuntime(descriptorFile,expectedMigrations) accepts only canonical absolute privateJSON:

```json
{"format":1,"host":"db.internal","port":5432,"database":"enterprise_brain","runtimeRole":"brain_runtime","enterpriseId":"11111111-1111-4111-8111-111111111111","passwordFile":"<canonical absolute password-file path>","tls":{"mode":"verify-full","caFile":"<canonical absolute CA-file path>"}}
```

Replace placeholders locally.No passwords inJSON/URLs/CLI.Password file1–512UTF8 bytes,no newlines/control characters.CA≤64KiB/eight certificates,no private keys.Reject extra fields,arbitrarypg options/URLs,indirect directories/symlinks.Customer controlsOS ACLs;path/type checks are not WindowsACL audits.NonemptyPG* environment variables cause conflict rather than inferred connection settings.

Normal mode verifies CA and hostname with TLS 1.2 or newer. Only explicit owned loopback tests may use `owned-loopback-test` with host `127.0.0.1` or `::1`. The ordinary pool allows five connections; host ownership adds one stable client. Limits are 3 seconds to connect, 10 seconds per ordinary statement, 3 seconds for locks and 15 seconds for idle transactions. Qualification uses local 3-second statement and 1-second lock limits. The core fixes `search_path`, `row_security` and the explicit tenant context without migrations or seed data. Failure closes the pool; success returns a trusted database and qualification observation. The caller must close it.

Qualification observes current catalogs/connection,not permanent authority or protection from administrator changes.RawDatabase/eb_app can change tenant variables and are trusted capabilities,never browser/arbitrarySQL/model tools.Tenant variables are not unforgeable cross-tenant credentials.Deployments still need dedicated-database/account validation,current actors and independent business approvals;reconnection does not waive business checks.Full native identity/background grants,separate migration credentials,readiness,backup/recovery revocation,upgrade/operations exclusion remain unintegrated.Inventory equality does not prove administrators have not altered actual structures/policies.

Connection errors:native_runtime_configuration_invalid,native_runtime_environment_conflict,native_runtime_connection_refused.No password,host,role,enterprise,path or rawPG error.Read-only qualification codes are fixed in NativeRuntimePreflight;never automatically grant or repair from them.No HTTP/CLI/one-click installer enables this API.
