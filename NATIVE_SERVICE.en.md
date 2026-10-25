# Native foreground and private operations

[中文](NATIVE_SERVICE.md) · [Adoption](NATIVE_DEPLOYMENT.en.md) · [Programmatic host](NATIVE_HOST.en.md) · [Session ownership](NATIVE_OWNERSHIP.en.md)

`scripts/enterprise-native.mjs` accepts explicit native format2 configuration only. The customer's DBA prepares a dedicated PG17 enterprise database,runtime privileges and an effective identity administrator first;see adoption for private input/exact descriptor SHA. The adopt/start/control operations below never migrate,grant,create accounts,scan networks or seed demo data,and never falls back to DATABASE_URL/PGlite.

After building,run from the installation with bundled Node or declared Node24. Uppercase names below are absolute private file paths,not passwords in arguments:

```sh
node scripts/enterprise-native.mjs adopt --config ABSOLUTE_NEW_PRIVATE_CONFIG_JSON --input ABSOLUTE_PRIVATE_ADOPTION_JSON
node scripts/enterprise-native.mjs start --config ABSOLUTE_PRIVATE_CONFIG_JSON
node scripts/enterprise-native.mjs status --config ABSOLUTE_PRIVATE_CONFIG_JSON
node scripts/enterprise-native.mjs traffic-status --config ABSOLUTE_PRIVATE_CONFIG_JSON
node scripts/enterprise-native.mjs activate --config ABSOLUTE_PRIVATE_CONFIG_JSON --input ABSOLUTE_PRIVATE_TRAFFIC_JSON
node scripts/enterprise-native.mjs park --config ABSOLUTE_PRIVATE_CONFIG_JSON --input ABSOLUTE_PRIVATE_TRAFFIC_JSON
node scripts/enterprise-native.mjs stop --config ABSOLUTE_PRIVATE_CONFIG_JSON
```

Fresh adoption is parked0. Strict traffic input is `{"expectedVersion":0,"waitMs":1000}`;use the current traffic-status version,which increments on changes and rejects stale requests. Offline parking is allowed;activation needs the ready original instance and unchanged descriptor SHA. Start remains foreground;customer operations manage supervision/trusted HTTPS proxy/certificates. Backend binds127.0.0.1. Signals use the same drain/close without killing foreign PIDs. Fresh startup rotates the local control token;the private proxy reads its separate token and never sends it to browsers.

Status/stop/park do not require the current descriptor to exist. Full private configuration hash,instance UUID,process and health identity must match. Strict bounded native-profile/ownership/traffic health prevents sending control tokens to wrong profiles/instances. Lost database ownership returns unavailable/schema unavailable promptly without SQL or falsely reporting an old schema current. Normal close stops pump/admission,waits the original5-second actual-handler budget,then closes HTTP/ownership/pool and removes its exact instance lock. Disconnected callers remain counted. Persisted restart intent is unchanged;failures retain inspectable state,never steal by age or auto-delete stale locks. [Exact local lock recovery](NATIVE_MAINTENANCE.en.md) is available after explicit inspection and confirmation.

Graphs,identity,CSRF and business approval share the original core. Background supervision defaults off and needs explicit approval/delegation/current code,tools and actor authority. Startup loads only explicitly registered,current-identity local models under acquired database ownership,then rechecks prerequisites/workload privileges/ownership. Absence never falls back to mock;startup makes no model call. Native [daily model/tool CLI](NATIVE_AGENT_CONFIGURATION.en.md) reuses existing contracts while stopped under actual ownership. Tool policy uses a versioned sidecar without changing deployment configuration. Do not use old PGlite configure-model commands on native configurations.

Planning original-owner metadata is prefetched in a tenant read transaction only after the parent FOR SHARE lock;that separate transaction takes no principal lock and writes no data;actual transactions retain current authority/original action/budget gates without direct planning_candidate grants to runtime logins. Normal service/database restarts preserve original actions,results and reservations;retries of original keys make no extra calls. Owned protocol fixtures do not establish model semantics or business efficiency.

Separate[native encrypted backup/new-database restore](NATIVE_BACKUP_RESTORE.en.md)retains original foreground ownership,quarantines target CONNECT,verifies contents/fences old authority and unknown spend in one transaction,and only prepares parked0 configuration. Only that explicit DBA restore grants the fixed target runtime CONNECT. DBA setup,native cross-version upgrades and HA remain unfinished. Old file backups/recovery/managed upgrades retain their declared PGlite scope. Owned Windows/PG17.11/TLS does not qualify clean hosts,Linux or production certificates. Candidates remain unpublished and map clearance incomplete;the beverage cockpit remains separate from this enterprise entry.


Fingerprint compatibility:when a verified legacy installation predates the native service module,its original CLI inventory/hash remains exact. Roots containing the native service module must include enterprise-native.mjs,and changing or deleting it changes/refuses the fingerprint. This does not accept missing modern entry files or arbitrary unsigned generations.

After an abnormal exit, use [exact local lock inspection/recovery](NATIVE_MAINTENANCE.en.md); it does not take over the database.
