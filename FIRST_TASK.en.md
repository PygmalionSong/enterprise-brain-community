# First controlled task: cross-process execution and restart reconciliation

[中文](FIRST_TASK.md) · [Quick start](QUICKSTART.en.md)

Reuse the existing ProcessRegistry, GraphService and trusted MCP tool contracts for two owned constructed check processes. This demonstrates real database persistence, separate business approval, source-committed response loss, original-action lookup and separate-process restart. No model or real enterprise is accessed and no ERP ledger is replaced.

## Run

Declared environment: Windows x64, Node 24.19.0, pnpm 11.25.0. In new source, follow quick start to install locked dependencies and pass inventory/types/build. Output must be a new absolute directory outside the source with an existing parent. The command creates it without overwriting older results.

```powershell
$taskOutput = Join-Path (Split-Path -Parent (Get-Location).Path) ("eb-first-task-" + [guid]::NewGuid().ToString())
node scripts/first-task.mjs --out $taskOutput --acknowledge-owned-fixture
if ($LASTEXITCODE -ne 0) { throw "First task failed; inspect the private phase logs" }
Get-Content -LiteralPath (Join-Path $taskOutput "report.json") -Raw | ConvertFrom-Json
```

`--acknowledge-owned-fixture` explicitly permits an owned enterprise, constructed roles, PGlite state and a separate SQLite source ledger inside the new private directory. There are no real endpoint/account/password/model-key arguments and no existing workbench is started.

## What happens

1. Actually read two allowed MCP stdio process definitions, confirm their revisions/mappings and register a cross-process relationship.
2. IT compiles a frozen two-action plan. IT approval and starting without valid approval are refused without source actions.
3. A constructed business owner approves; a constructed operator starts. A trusted tool commits the first action to an independent ledger, then deliberately exits without a response. The core correctly records unknown.
4. The first worker closes the enterprise database and exits. The parent starts a fresh worker that reopens the same database and verifies original plan/run/action identities.
5. Look up the original action rather than resubmitting. Reusing the creation key returns the original run. The second process also reconciles its original action; both actions complete.

A successful report has status=passed and these checks:

| Field | Expected |
|---|---|
| processesRead / processesConfirmed | 2 / 2 |
| crossLinks | 1 |
| actions / receipts / sourceRows | 2 / 2 / 2 |
| submitCalls / lookupCalls | 2 / 2, once per action |
| duplicateSubmissions | 0 |
| responseLossObserved / freshWorkerProcess | true / true |
| originalActionRetained / planHashRetained / idempotentRunReused | all true |

Source completion means only the owned constructed check was committed, not real orders, procurement, inventory or payment. Resource reading and graph tools use separate MCP subprocesses. SQLite represents the external fixture ledger, not another product storage architecture.

## Results and failures

`report.json` is a reviewable minimal report: one-time runId, distribution inventory hash, platform/Node and check outcomes. No usernames, hostnames, IPs, paths, credentials, business text or automatic upload. Real-enterprise, live-model, clean-host and HTTP-login acceptance fields remain false.

The output also contains a checkpoint, constructed enterprise database, source ledger, code-bound installation declaration and two private.log files. Keep them private, outside Issues and distribution archives. Roles are created directly through trusted fixture setup; this does not validate browser login/session or production identity configuration.

Failure returns nonzero and preserves a failed report and actual phase logs; later phases do not run. Existing directories, missing acknowledgement, relative/source-contained output are refused before work. Do not delete source actions and rerun to claim recovery. Fix prerequisites, use a new output and retain the failure evidence.

This is not full installation, encrypted restore, native PostgreSQL upgrade, real-vendor integration or model-quality acceptance. See [scope](PREVIEW_SCOPE.en.md) and [voluntary feedback](INSTALLATION_VALIDATION.en.md).
