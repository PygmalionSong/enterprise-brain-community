# Installation validation and voluntary feedback

[中文](INSTALLATION_VALIDATION.md)

This source is an enterprise Agent foundation developer-preview candidate. It excludes the complete business cockpit. Use Node 24; the reproduction tool versions are Node 24.19.0 and pnpm 11.25.0. See [README](README.en.md) for verified scope and limits. Validation is an explicit local action, not installation telemetry. GitHub login or report submission is never required to use the project.

Extract or clone into a fresh directory, then run:

```text
pnpm install --frozen-lockfile --ignore-scripts
node --test tests/installation-report.test.mjs
node scripts/installation-report.mjs --out ABSOLUTE_NEW_PRIVATE_REPORT_JSON --log-dir ABSOLUTE_NEW_PRIVATE_LOG_DIRECTORY
```

Replace both placeholders with new absolute paths whose parent directories already exist. Use Windows absolute paths on Windows. Existing reports/logs are never overwritten. Stop if the locked dependency installation fails: copying another node_modules or changing the lockfile does not prove installation. The report command runs inventory, typecheck, build and the existing SDK tests in order, marking later steps not-run after a failure. It does not install dependencies, initialize enterprise databases, or contact real enterprise systems or models. Tests may create owned temporary databases and local protocol services; these are not real-platform results.

The minimal JSON contains a per-run random ID, source inventory digest, OS/architecture/Node version, check outcomes and complete test counts. It excludes usernames, hostnames, IPs, environment variables, paths, customer identifiers, business data, credentials and raw logs. It makes no network submission. It cannot establish independent-user, clean-host or production-deployment verification; those fields remain false. Dependency-installation outcomes and fresh-directory use are separate contributor statements, not inferred from passing tests.

Inspect the JSON yourself before optionally pasting it into the actual repository's “Installation feedback / 安装反馈” Issue. GitHub Issues are public: your account and submitted text are visible. You can simply choose not to submit. Never paste private logs. Follow the [security policy](SECURITY.en.md) for sensitive issues; do not disclose sensitive details before a private channel is configured.

Failures, not-run attempts, upgrade checks and seven-day follow-ups are all welcome. No praise, Star or employer name is required. Link earlier public feedback for repeat attempts. Maintainers distinguish attempts, same-person retests, independent reproductions and self-reported organizational adoption; reports are not automatically new users. Maintainer CI is not external adoption.

The CI template produces remote evidence only after it runs in an actual repository. It uses a read-only token, pinned actions, hosted runners and no production/model secrets. It avoids pull_request_target and automatic publishing, and uploads no raw logs/customer directories. Hosted Windows build/isolated-test verification does not establish full customer-server installation, DBA recovery/upgrade or Linux acceptance.

CI partitions the existing fixed SDK test-file list into four groups,executing every file exactly once without removing tests.Each file has a180-second process boundary:timeouts terminate only owned test children and record failure.This CI boundary changes no product timeout/authority.Each group reports file coverage,complete counts and source digest;source-gate requires all four successes.Aggregate actual reports for the total rather than trusting a badge or calling maintainer CI external adoption.

Test children isolate inherited host PG* and internal Node runner variables,and use an owned canonical TEMP/TMP namespace under repository.evidence without changing parent/system settings.Product PG-override/noncanonical-private-path refusals and negative cases remain intact.Shard4 records separate PG-only and temp-only qualification probes:the original environment can pass or refuse,but the isolated one must pass.Report only booleans,counts and fixed error codes,never values or paths.These probes are separate from the69-file SDK coverage and adoption metrics.


Hosted Windows source CI has actually run for this repository. See [validation notes](PREVIEW_NOTES.en.md) for the fixed baseline and exact results. The rule that a template requires an actual run does not mean there is no remote evidence. Documentation edits do not imply another full run. Feedback is visible only to authorized accounts while private; historical Issue content also becomes public if the repository is later made public.
