# 最初のタスク：複数プロセスと再起動後の照合

[English](FIRST_TASK.en.md) · [中文](FIRST_TASK.md) · [ホーム](README.ja.md)

Windows x64、Node24.19.0、pnpm11.25.0で、READMEのソース検証・依存関係の取得・型検査・ビルドを完了してから実行してください。元の技術契約は[英語版](FIRST_TASK.en.md)を参照できます。

新しい非公開の出力ディレクトリをソースの隣に作るPowerShellコマンドです。既存の出力は上書きしません。

```powershell
$taskOutput = Join-Path (Split-Path -Parent (Get-Location).Path) ("eb-first-task-" + [guid]::NewGuid().ToString())
node scripts/first-task.mjs --out $taskOutput --acknowledge-owned-fixture
if ($LASTEXITCODE -ne 0) { throw "First task failed; inspect the private phase logs" }
Get-Content -LiteralPath (Join-Path $taskOutput "report.json") -Raw | ConvertFrom-Json
```

確認フラグは、自ら用意した企業・役割・PGliteデータ・独立した検証用台帳を新しいディレクトリに作成することへの明示的な同意です。実際の企業接続先、パスワード、モデルキーは渡しません。

成功時はstatus=passed、processesRead=2、processesConfirmed=2、crossLinks=1、actions=2、sourceRows=2、receipts=2、submitCalls=2、lookupCalls=2、duplicateSubmissions=0です。responseLossObserved、freshWorkerProcess、originalActionRetained、planHashRetained、idempotentRunReusedはtrueになります。

これは顧客の業務完了、HTTPログイン、実モデルの品質、完全な導入・復旧・更新の検証ではありません。出力には検証用データベース、鍵、チェックポイント、非公開ログが含まれます。最小限のreport.jsonを自分で確認し、任意で共有する場合を除き、出力を公開しないでください。失敗時の証拠は保持し、単に出力を削除して成功だけを報告しないでください。
