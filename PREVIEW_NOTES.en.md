# Verification and reproduction boundaries

[中文](PREVIEW_NOTES.md) · [First task](FIRST_TASK.en.md) · [CI](CI_REPRODUCTION.en.md) · [Linux operations](LINUX_RUNTIME.en.md)

This map-free developer source preview includes infrastructure, a persisted reference application, the cross-system supply case and a small inventory adapter. Models are replaceable; authority and original-action receipts belong to the foundation. The browser experience runs separately from the local application. The source excludes complete signed industry bundles, maps and installed dependencies.

The local environments are Windows x64 and Ubuntu24.04.5 x64, Node24.19.0 and locked dependencies. Native Ubuntu additionally requires a systemd255 user manager, cgroupv2, a non-root account and PostgreSQL17.11. This does not declare all Linux distributions or Windows hosts compatible. Dependency caches were reused; this is not independent clean-machine installation.

The same code and test list produced649 Windows outcomes:646 passed and three precisely named Linux-only skips. Ubuntu passed649 with zero skips. Skips are not executed passes. First-task3, backend7, projection10, adapter6 and reporting/CI-tool23 are separate groups with overlaps; do not add them. Three-language onboarding and previously approved media are retained.

Actual local PostgreSQL17.11/TLS checks passed11 Windows and13 Ubuntu checks. They cover non-owner runtime roles,28 migrations, an owned source commit with response loss and original receipt lookup, encrypted backup, cancellation/crash handling, failed-restore quarantine, new-database restore, revoked old sessions/approvals and parked startup. Each side retains one original action/receipt with zero duplicate submission and no live-model calls. Ubuntu additionally verifies owned-worker cleanup after abrupt primary death. These are maintainer-owned databases, not customer data.

Source checks are not signed complete-package upgrade results; upgrades require two explicitly supplied trusted complete signed installations. Legacy PGlite signed migration/rehearsal remains Windows-only. Independent customer hosts, production certificates, live-model quality, all vendor versions, production capacity/HA and business ROI remain unverified and unpromised.

The updated workflow requires four Windows shards, first-task, business-case and Ubuntu jobs. Inspect the exact future commit's actual Actions result: local results cannot stand in for unexecuted remote CI. The old preview.1 hosted Windows641 matrix is historical, not this version's score. An earlier business-analysis15/18 failure and subsequent18/18 reruns remain recorded with unresolved cause. Safe diagnostics do not claim to fix that historical cause.

REPOSITORY_MANIFEST.json checks the whole distribution; SOURCE_MANIFEST.json checks its SDK subset. Final documentation is bound byte-for-byte to tested code. Hashes establish consistency, not publisher signatures or production certification. Retain LICENSE, NOTICE and third-party terms; see [asset scope](ASSET_SCOPE.en.md).

Installation reports are generated and reviewed explicitly by users, without automatic upload or telemetry. Format2 retains complete pass/fail/skip counts and known platform skip reasons; format1 remains a valid historical format. Maintainer CI, local qualification and attachment downloads are not external adoption; the total installation population is unknown. Voluntary reports use Issues, sensitive issues follow the [security policy](SECURITY.en.md). Do not upload private logs or credentials.
