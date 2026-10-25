# Source and first-task CI reproduction

[中文](CI_REPRODUCTION.md) · [First task](FIRST_TASK.en.md)

Source reproduction has two independent acceptance parts. Four windows-source shards retain the fixed partition of the original 69 SDK files; first-task runs the three new checks once. Each part verifies the inventory, installs locked dependencies, checks types and builds. source-gate requires both parts; failures, cancellations and skipped jobs cannot pass.

First-task command:

~~~powershell
node --test --test-reporter=tap tests/first-task.test.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
~~~

Checks reject missing consent and existing/out-of-bounds output, then exercise actual local source commit with response loss, a separate process reopening the original database and original-action lookup. SDK counts and the three new checks are reported separately; reporting-tool unit tests are not counted as product cases.

CI uses GitHub-hosted Windows, Node 24.19.0, pnpm 11.25.0, pinned action commits and read-only contents access. It uses no enterprise credentials, self-hosted runner or raw-log artifact upload. Dependency lifecycle scripts stay disabled; product SQL permissions and timeouts are not relaxed. Owned test output remains on the temporary runner rather than in distribution attachments.

A workflow definition specifies intended checks. Version evidence requires the exact commit's actual run, report inventory hash and completed results. Source CI is not complete private-installation/backup/restore acceptance, independent adoption, real-enterprise integration or live-model quality evaluation.
