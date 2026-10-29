# 最初のタスク：プロセスをまたぐ実行と復旧

[English](FIRST_TASK.en.md) · [中文](FIRST_TASK.md) · [ホーム](README.ja.md)

二つのプロセスを読み取り、業務承認を得て計画を実行し、結果を確認する例です。保存後、応答前にツールを意図的に終了させ、再起動後に同じ操作を再送せず結果を照会する動作を試します。ローカルのテストデータを使うため、企業アカウントやモデル API キーは不要です。

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
