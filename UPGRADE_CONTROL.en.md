# Upgrade control core contracts

[中文](UPGRADE_CONTROL.md)

Programmatic APIs live in src/enterprise/upgrade-control.ts and upgrade-inventory.ts. Journal/offline-inventory cores may ship in the map-free SDK. Signed-installation preparation/commit CLIs belong to the complete product;renaming the SDK does not make it a signed product installation.

initialUpgradeControl/createUpgradeControl bind identities;read/inspect only validate/read;change/update require current-version CAS. Bind enterprise/deployment UUIDs,configuration/full-plan SHA,old/new installation-manifest SHAs and independently trusted publisher fingerprint. Stages:created,quiesced,backed_up,rehearsed,candidate_ready,committed_parked,active. Persist pending operationId/intent SHA before external work and evidence SHA after completion. No skipped/backward steps,changed bindings or reused operation IDs.

Pointer and committed_parked change in one atomic file update before opening admission. Pre-commit failure retains current;post-commit failure retains candidate for forward handling. Pending means needs_inspection without replay;abandoned claims are never stolen. Bounded events/strict fields/file limits,canonical private paths,synced temporary files and same-directory rename. Busy claims/version conflicts refuse;age is not authority. No browser endpoint,model/source call or business approval grant.

captureUpgradeDatabase reads PGlite files only while this process owns the backup maintenance claim and the instance is stopped. Exact bytes,relative paths and empty directories participate in the aggregate SHA. Output contains aggregate SHA/counts/bytes/deployment identity without contents or path listings. Recheck claim/absence of instance afterward. Bounds:5000 files,5000 directories,total128MiB;not online/large-database backup. Both inventories must match this preparation before cutover. Normal active restarts cannot force old snapshots over new transactions.

UnderClaim start/backup/traffic variants check this process's claim and purpose;normal entrypoints still obtain their own claim. Trusted program/OS authority remains necessary. Hashes/stage assertions do not independently prove effects or establish signed authorization,OS locks,power-loss recovery or distributed HA. Native enterprise hosting remains blocked. Local tests,real child interruption,signed-installation lifecycle and complete regression are separate evidence.
