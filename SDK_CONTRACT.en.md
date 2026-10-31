# Enterprise Brain foundation SDK

[中文](SDK_CONTRACT.md)

Use the SDK to add process reading, plan approval and task execution to your application. The repository also includes a local operating example and a browser showcase; see [distribution details](PREVIEW_SCOPE.en.md). Using the SDK does not start either example or configure a model.

Use Node24/pnpm. Local checks have run on Windows x64 with Node24.19.0 and PGlite; Ubuntu source/native operation scope is documented in LINUX_RUNTIME.en.md; clean hosts/public certificates remain unverified;native daily model/tool configuration is scoped in[NATIVE_AGENT_CONFIGURATION](NATIVE_AGENT_CONFIGURATION.en.md);native backup/new-database restore is scoped in[NATIVE_BACKUP_RESTORE](NATIVE_BACKUP_RESTORE.en.md);Additional PostgreSQL17.11 service checks are documented in [NATIVE_SERVICE](NATIVE_SERVICE.en.md). Run `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm build`, `pnpm typecheck`, `pnpm test`. The lockfile pins35 packages and their licenses, including libraries not directly used by the SDK. Tests using existing dependencies do not establish installation in a fresh environment.

Initialize with `node scripts/enterprise.mjs init --config ABSOLUTE_NEW_PRIVATE_CONFIG --input ABSOLUTE_PRIVATE_INPUT`, then use start/status/stop/backup/restore. Private JSON contains name/timezone/canonical HTTPS origin/backend port/username/password; no default credentials. Do not put credentials in arguments/public files. Backend binds127.0.0.1 and requires a trusted TLS proxy; never send its private authority to browsers. See [host/HTTP/recovery contracts](HOST.en.md). The included start-portable.ps1 is a full-product template retained for fingerprint consistency, not a runnable portable launcher for this source SDK.

Readers support pinned MCP2025-11-25 stdio resources,enterprise-brain.process/1,BPMN XML structural subset and OData4.01 JSON entities; entities do not imply workflows. `node scripts/read-processes.mjs --reference-blueprint --out ABSOLUTE_NEW_PRIVATE_REPORT` reads15-domain/60-stage reference skeletons rather than actual enterprise workflows. Keep CLI input/reports private.

Reviewed sources/links compile into versioned frozen exclusive routes,parallel dependencies and ordered cross-process plans. IT review is separate from business execution approval. Recover unknown results through original-action lookup rather than blind resubmission. Advancement uses explicit steps or default-off [bounded supervision](SUPERVISION.en.md),without loops/nesting/dynamic dataflow. Default process.definition.read@v1 returns reviewed definition summaries; trusted installed code supplies other submit/lookup/authorization tools. HTTP cannot arbitrarily install scripts;operators may explicitly [install pinned MCP tool contracts](MCP_TOOLS.en.md) while stopped. Unconfigured models remain unavailable without case-inference fallback.

Account changes invalidate old authority/sessions. Restore invalidates all browser sessions while retaining graph action UUIDs. PGlite recovery requires an offline restore with matching source, migrations and dependency lockfile. It does not provide cross-version upgrades, online large-database backups or HA takeover. A separate native encrypted backup/same-code new-database restore command retains CONNECT quarantine until full verification/old-authority fencing,preserves spend/original actions,and prepares a configuration that pauses new requests for operator review. Native PostgreSQL and PGlite recovery use separate commands and are not interchangeable.

This subset uses Apache-2.0 with [third-party terms](THIRD_PARTY_NOTICES.en.md). This source package contains infrastructure and examples. Complete installers and maps are not included.


See [controlled business inference](BUSINESS_INFERENCE.en.md) for explicit business requests,shared budgets,current-source citation checks and remaining history limitations.


Trusted DBA initialization and exact no-replay completion for a new empty dedicated database are separate from read-only adopt;see [native DBA preparation](NATIVE_DBA_PREPARATION.en.md).


The [native product upgrade candidate](NATIVE_UPGRADE.en.md) operates two explicitly supplied complete signed installations;it does not treat this unsigned SDK tree as a signed product.The included release module supports verification;full-product packaging resources are not supplied here.
