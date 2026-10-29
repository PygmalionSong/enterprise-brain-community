# Source and first-task CI reproduction

[中文](CI_REPRODUCTION.md) · [First task](FIRST_TASK.en.md)

The workflow has four Windows SDK shards, a first-task job, an operating-case job and an Ubuntu24.04 source job, plus the final source-gate. The SDK list now has71 files, with649 test outcomes. Windows permits exactly three named Linux-only skips; other skips, failures, cancellations or missing jobs fail the gate. Ubuntu requires zero skips. The Linux job also runs the onboarding, case, projection and adapter checks. This locally prepared workflow is not an executed remote result.

First-task command:

~~~powershell
node --test --test-reporter=tap tests/first-task.test.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
~~~

Checks reject missing consent and existing/out-of-bounds output, then exercise actual local source commit with response loss, a separate process reopening the original database and original-action lookup. SDK counts and the three new checks are reported separately; reporting-tool unit tests are not counted as product cases.

CI uses GitHub-hosted Windows and Ubuntu24.04, Node 24.19.0, pnpm 11.25.0, pinned action commits and read-only contents access. It uses no enterprise credentials, self-hosted runner or raw-log artifact upload. Dependency lifecycle scripts stay disabled; product SQL permissions and timeouts are not relaxed. Owned test output remains on the temporary runner rather than in distribution attachments.

A workflow definition specifies intended checks. Version evidence requires the exact commit's actual run, report inventory hash and completed results. Source CI is not complete private-installation/backup/restore acceptance, independent adoption, real-enterprise integration or live-model quality evaluation.
