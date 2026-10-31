# Run an isolated enterprise host from start to result

[中文](GETTING_STARTED.zh.md) · [日本語](GETTING_STARTED.ja.md) · [Home](README.md)

This example initializes a separate host, creates IT and business accounts, imports a sample process, obtains business approval and reads its execution result. It restarts the host and checks the original action again. All accounts and data are generated locally; no company account or model key is needed.

## Prepare

Use Node24.19.0 and pnpm11.25.0 in a new writable source directory. Follow the [quick start](QUICKSTART.en.md) to verify the inventory, install locked dependencies, typecheck and build. This example needs the built enterprise operations module. The command below uses PowerShell.

```powershell
$onboardingOutput = Join-Path (Split-Path -Parent (Get-Location).Path) ("eb-onboarding-" + [guid]::NewGuid().ToString())
node examples/enterprise-onboarding/run.mjs --out $onboardingOutput --acknowledge-owned-fixture
if ($LASTEXITCODE -ne 0) { throw "Onboarding failed; inspect the private report and logs" }
Get-Content -LiteralPath (Join-Path $onboardingOutput "report.json") -Raw | ConvertFrom-Json
```

On Ubuntu, use Bash instead of installing PowerShell:

```bash
onboarding_output="$(mktemp -d "${TMPDIR:-/tmp}/eb-onboarding-parent.XXXXXXXX")/run"
node examples/enterprise-onboarding/run.mjs --out "$onboarding_output" --acknowledge-owned-fixture && cat "$onboarding_output/report.json"
```

The output must be a new absolute directory outside the source. The program creates it without replacing existing results. It contains private initialization input, generated account credentials, configuration, database and host logs. Keep the whole directory private. The minimal report omits credentials and local paths; nothing is uploaded. File modes do not provision Windows access controls.

## Follow the steps

1. CLI initialization creates an empty enterprise and its IT identity administrator. No beverage data or model is installed.
2. The host starts on a local port. An owned client supplies the configured trusted-proxy header and canonical HTTPS origin to its loopback HTTP backend. This does **not** launch a TLS proxy or browser session.
3. The IT administrator creates a separate business owner and imports the three-node sample definition. The example explicitly maps its task to the existing reference stage `channel-1`; it does not infer a business mapping.
4. IT compiles a plan using the installed `process.definition.read@v1` tool. IT approval and execution without a valid business approval are refused.
5. The business owner approves and executes. The regular run view redacts the source payload; the authorized observation endpoint returns process metadata with three nodes.
6. The host stops and starts in another process. A fresh login queries the same completed action. The program then stops its own host and retains all private output.

A successful report has `status=passed`, `hostStopped=true`, one confirmed process, one action, `resultKind=process_metadata`, `resultNodes=3` and `originalActionRetained=true`. These are process-definition results, not stock, orders or payments.

If a step fails, the command exits nonzero and retains the report/logs. Correct the problem and use a new output directory; do not erase source records to make recovery look successful. The program never kills an unrelated process or takes over an existing installation.

## Choose the next route

| Goal | Guide |
|---|---|
| Inspect metadata from an owned HTTP sample and controlled business reads | [First connection](FIRST_CONNECTION.en.md) |
| Observe response loss and recovery across two processes | [First task](FIRST_TASK.en.md) |
| Adapt a read-only inventory tool | [Source adapter](EXTEND_A_SOURCE.en.md) |
| Configure your own enterprise host and trusted TLS proxy | [Host configuration](HOST.en.md) |

The account creation and approvals here are performed by the sample program through real APIs. This is not human approval, browser login acceptance, automatic system discovery, a vendor connector or production deployment. Your own tools still require explicit trusted installation and authorization.
