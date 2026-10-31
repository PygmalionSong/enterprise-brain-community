# Quick start: read an enterprise process reference

[中文](QUICKSTART.md) · [Home](README.en.md)

Run the included MCP stdio reader against reference process resources and inspect its report. This route does not access a live enterprise, call a model, register or execute workflows, or launch the business cockpit.

## 1. Prepare the source

Declared reproduction environments: Windows x64 and Ubuntu24.04 x64, Node 24.19.0, pnpm 11.25.0. The supported Node range is 24.x; other versions are outside this declaration. Registry access is required. Extract into a new writable directory without ancestor node_modules, and open a terminal in the directory containing package.json.

~~~text
node --version
pnpm --version
node scripts/verify-repository.mjs
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm build
~~~

Continue only after each command succeeds. On an inventory mismatch, obtain intact source rather than bypassing verification. If installation fails, do not copy dependencies or change the lockfile to claim success. Inventory hashes detect file changes; they do not authenticate a publisher.

## 2. Create a private report

Run this PowerShell from the source directory. It creates a new randomized output directory beside the source; existing files are not overwritten. This report contains reference definitions. Future reports of this kind from real enterprises must remain outside the repository.

~~~powershell
$reportDirectory = Join-Path (Split-Path -Parent (Get-Location).Path) ("eb-reference-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $reportDirectory -ErrorAction Stop | Out-Null
$reportFile = Join-Path $reportDirectory "processes.json"
node scripts/read-processes.mjs --reference-blueprint --out $reportFile
if ($LASTEXITCODE -ne 0) { throw "Process reading failed" }
Get-Content -LiteralPath $reportFile -Raw | ConvertFrom-Json | Select-Object origin, authority, runtimeRegistered, coverage
~~~

Successful reader output:

~~~json
{"processes":15,"modeledStages":60,"sourceReadStages":60,"mappedStages":0,"runtimeRegistered":false}
~~~

The report should identify origin=constructed_reference_blueprint, authority=source_definitions_only and coverage.executableStages=0. It demonstrates reading a reference skeleton. Zero mapped/executable stages is expected; 60 read stages does not mean 60 systems are connected. Use a new output directory for another run.

On Ubuntu, the report can be created in Bash:

```bash
report_directory="$(mktemp -d "${TMPDIR:-/tmp}/eb-reference.XXXXXXXX")"
node scripts/read-processes.mjs --reference-blueprint --out "$report_directory/processes.json" && cat "$report_directory/processes.json"
```


## 3. Continue by goal

| Goal | Entry point |
|---|---|
| Understand task coordination | [Architecture and source locations](ARCHITECTURE_OVERVIEW.en.md) |
| Create enterprise accounts and a local host | [HOST](HOST.en.md): private initialization JSON, canonical HTTPS origin and trusted proxy; no default password |
| Integrate process resources or tools | [Original SDK contract](SDK_CONTRACT.en.md), [tool contracts](TOOL_CONTRACTS.en.md), [MCP tools](MCP_TOOLS.en.md) |
| Configure models and business analysis | [Models](MODELS.en.md), [analysis authority](ANALYSIS_POLICY.en.md), [controlled inference](BUSINESS_INFERENCE.en.md) |
| Reproduce tests or report an installation problem | [Installation validation](INSTALLATION_VALIDATION.en.md) |

The included start-portable.ps1 is a retained template for the complete product, not a launcher for a signed portable product from this archive. The reference report does not establish native PostgreSQL service, live-model or production integration acceptance. See the full [preview scope](PREVIEW_SCOPE.en.md).


After reference reading, run the [first controlled task](FIRST_TASK.en.md) for actual graph execution, response loss and a fresh worker restart.
