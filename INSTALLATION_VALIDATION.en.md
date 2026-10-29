# Check your installation

[中文](INSTALLATION_VALIDATION.md) · [Support scope](PREVIEW_SCOPE.en.md)

After installing dependencies, run local checks for the source inventory, types, build and SDK tests. Results are written to a local JSON file and are not uploaded automatically. You do not need to submit a report to use the project.

## Generate a report

Extract or clone the source into a fresh directory. With Node 24.19.0 and pnpm 11.25.0, run:

```text
pnpm install --frozen-lockfile --ignore-scripts
node --test tests/installation-report.test.mjs
node scripts/installation-report.mjs --out ABSOLUTE_NEW_PRIVATE_REPORT_JSON --log-dir ABSOLUTE_NEW_PRIVATE_LOG_DIRECTORY
```

Replace both placeholders with new absolute paths whose parent directories already exist. Use Windows paths on Windows. Continue only after each command succeeds; keep reports and logs if a step fails.

The report command does not install dependencies or contact enterprise systems or models. Tests may create temporary databases and local services to check code behavior. Passing them does not establish production deployment.

## What is in the report?

The format is `enterprise-brain.installation-report/2`. It includes a per-run ID, source inventory digest, OS, architecture, Node version, step results and test counts. Skips are recorded separately. The named Linux-only skips allowed on Windows are not passed executions. After a failure, later steps are marked not-run.

The report excludes usernames, hostnames, IPs, environment variables, paths, customer data, credentials and raw logs. Detailed logs in the output directory are for local troubleshooting; inspect any file before sharing it.

## How can I share feedback?

Choose the installation feedback template in [Issues](https://github.com/PygmalionSong/enterprise-brain-community/issues). Include your version, environment, steps and observed result. You may attach the minimal report after reviewing it. Issues are public; no employer name or private log is needed. Sharing is optional.

Successful and failed attempts are both useful. Link earlier Issues when retesting the same problem. Download requests, maintainer CI and developer installation attempts are recorded separately.

## How is CI different?

Repository CI runs source checks on Windows and Ubuntu. Windows SDK tests use four groups; Linux runs separately. Other jobs check the first task, supply case and combined result. See [validation notes](PREVIEW_NOTES.en.md) for exact commits and results, and the [workflow](.github/workflows/source-ci.yml) for implementation. CI is not an independent customer deployment.

For security problems, follow the [security policy](SECURITY.en.md).
