# ソースを一つ拡張する：小さな在庫読み取りツール

[English](EXTEND_A_SOURCE.en.md) · [中文](EXTEND_A_SOURCE.md) · [Architecture / English](ARCHITECTURE_OVERVIEW.en.md)

依存関係のインストール、型検査、ビルド後に実行します。基盤の実際のGraphToolインターフェースとカタログを使う読み取りツールの実験です。承認から実行までの全経路は別の[FIRST_TASK](FIRST_TASK.en.md)を参照してください。

```powershell
$adapterOutput = Join-Path (Split-Path -Parent (Get-Location).Path) ("eb-adapter-" + [guid]::NewGuid().ToString())
node examples/minimal-adapter/run.mjs --out $adapterOutput --acknowledge-owned-fixture
if ($LASTEXITCODE -ne 0) { throw "Adapter example failed" }
Get-Content -LiteralPath (Join-Path $adapterOutput "report.json") -Raw
```

出力先は新しい非公開の兄弟ディレクトリーです。実システムの端点、アカウント、モデルキーは不要です。在庫とSQLiteは構成した参照データです。データベースを公開しないでください。

[inventory-tool.ts](examples/minimal-adapter/inventory-tool.ts)で引数・結果・権限を検査します。[owned-inventory.mjs](examples/minimal-adapter/owned-inventory.mjs)が交換対象のソース境界です。[run.mjs](examples/minimal-adapter/run.mjs)は2400ケースを観測後、参照在庫を1700に変更し、ソースを再度開きます。元の操作の照会は同じ証跡と2400を返し、新しい操作は1700を観測します。

二つの観測、元の証跡維持、別企業の拒否、引数競合の拒否を確認します。fullGraphApprovalExercised=falseを明記します。存在しない操作の照会は観測を作りません。

最初は構成ソースのSKU/数量とrunnerの引数・期待値を一緒に変更し、新しい出力先を使ってください。その後InventorySourceのcapture/originalを許可された読み取りAPIに交換します。モデル引数に任意端点を渡さず、操作IDと引数の結び付け、元の観測を保持します。意味を変更した場合はツール/ソース版を更新し計画を再確認します。inventory-fixture-v1は実験用です。

実書き込みには業務承認、ソースの冪等性/照会、現在の権限と結果定義が別途必要です。実験の認証を本番にコピーしないでください。試験通過は本番認定ではありません。`node --test tests/minimal-adapter.test.mjs`で境界を検査できます。追加依存関係、自動送信、テレメトリーはありません。
