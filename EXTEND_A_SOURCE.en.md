# Extend one source: a small inventory tool

[中文](EXTEND_A_SOURCE.md) · [日本語](EXTEND_A_SOURCE.ja.md) · [Architecture](ARCHITECTURE_OVERVIEW.en.md)

Start here after installing dependencies and passing types/build. This lab implements the foundation's actual GraphTool contract and catalog. It is a read-only tool-contract example, not the complete approval/runtime path; use [FIRST_TASK](FIRST_TASK.en.md) for that path.

```powershell
$adapterOutput = Join-Path (Split-Path -Parent (Get-Location).Path) ("eb-adapter-" + [guid]::NewGuid().ToString())
node examples/minimal-adapter/run.mjs --out $adapterOutput --acknowledge-owned-fixture
if ($LASTEXITCODE -ne 0) { throw "Adapter example failed" }
Get-Content -LiteralPath (Join-Path $adapterOutput "report.json") -Raw
```

The output is a new private sibling directory. No endpoint, account, model key or network target is accepted. Keep its SQLite database private. It contains constructed stock, not inventory from a business.

## What to inspect

1. [inventory-tool.ts](examples/minimal-adapter/inventory-tool.ts) validates arguments and source data, calls the supplied authorizer and implements submit/lookup. It uses GraphTool and graphResultSchema from the existing core.
2. [owned-inventory.mjs](examples/minimal-adapter/owned-inventory.mjs) is the replaceable source boundary. Its authorize function only recognizes the lab's constructed actor; production must use the enterprise's current authority, not copy fixture identities.
3. [run.mjs](examples/minimal-adapter/run.mjs) registers the tool in GraphToolCatalog, captures 2400 cases, changes the constructed source to 1700, reopens it and queries the original action. That lookup still returns 2400 and the same receipt. A new action observes 1700.

The result reports two snapshots, original receipt retained, cross-enterprise refusal and conflicting-argument refusal. It explicitly marks fullGraphApprovalExercised=false. Missing lookup creates no snapshot. Current inventory and a past observation are different facts.

## Your first change

Change the constructed SKU/quantity in the owned source and matching runner arguments/expectations together; use a fresh output. Then replace capture/original behind the same InventorySource interface with your authorized read API. Do not add arbitrary endpoints to model arguments. Preserve reference-to-argument binding and original observations; bump tool/source contract versions when semantics change and re-review existing plans. This lab's inventory-fixture-v1 revision is for its owned fixture, not a universal source version policy.

Real writes additionally need explicit business approval, source-supported idempotency/lookup, authorization/revocation and outcome semantics. Tool metadata cannot install code or grant access. Read [tool contracts](TOOL_CONTRACTS.en.md) and [MCP installation](MCP_TOOLS.en.md) before integrating. A passing lab is not a certified production connector.

Run the boundary checks: `node --test tests/minimal-adapter.test.mjs`. No automatic upload, telemetry or dependency is added.
