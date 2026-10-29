# Validation environments and known limits

[中文](PREVIEW_NOTES.md) · [CI workflow](CI_REPRODUCTION.en.md)

## Preview.2 release checks

Eight jobs passed on source commit8345c0d74965ddd831fdcfc554772a1d53ce05c5: Linux source, four Windows source groups, first task, operating case and source gate. [View the run](https://github.com/PygmalionSong/enterprise-brain-community/actions/runs/40836879257). This run does not validate later commits or other deployment environments.

The exact local source inventory produced762 Windows checks:759 passed and3 Linux-only checks skipped. Ubuntu passed762 checks. Overlapping specialized checks are not added into a new total. Local validation reused locked dependency caches; it was not an independent user's clean-host installation.

## Environments

Windows x64 / Ubuntu24.04 x64, Node24.19.0 and locked dependencies. Native Ubuntu operations additionally require a systemd255 user manager, cgroupv2, a non-root account and PostgreSQL17.11; see [Linux operations](LINUX_RUNTIME.en.md). This does not establish compatibility with every Linux distribution or Windows configuration.

## Not established

Independent enterprise production operation, production certificates and identity integration, arbitrary vendor compatibility, production capacity/high availability, live-model quality or customer ROI. The source preview excludes complete signed industry bundles and maps. The browser case and local backend maintain separate states; constructed payment or sales screens are not backend business facts.

## Reproduction and reporting

Run the [first task](FIRST_TASK.en.md) or [local operating case](RUN_OPERATING_CASE.en.md). REPOSITORY_MANIFEST.json validates distribution files; SOURCE_MANIFEST.json records the SDK subset. Hashes are not publisher signatures or production certification. Users can review and voluntarily share installation reports; no automatic upload or telemetry is enabled.
