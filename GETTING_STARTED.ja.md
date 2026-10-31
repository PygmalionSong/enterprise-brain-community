# 初期設定から結果確認まで：独立ホストのサンプル

[English](GETTING_STARTED.en.md) · [中文](GETTING_STARTED.zh.md) · [ホーム](README.ja.md)

独立したホストとIT・業務アカウントを作成し、サンプルプロセスを登録します。業務側の承認後に実行し、結果を確認します。ホストを再起動しても同じ操作を照会できます。データとアカウントはローカルで生成するため、企業アカウントやモデルAPIキーは不要です。

## 準備

Node24.19.0とpnpm11.25.0を使用し、新しい書き込み可能なソースディレクトリーで[クイックスタート（英語）](QUICKSTART.en.md)の整合性確認、依存関係のインストール、型検査、ビルドを完了してください。以下はPowerShellのコマンドです。

```powershell
$onboardingOutput = Join-Path (Split-Path -Parent (Get-Location).Path) ("eb-onboarding-" + [guid]::NewGuid().ToString())
node examples/enterprise-onboarding/run.mjs --out $onboardingOutput --acknowledge-owned-fixture
if ($LASTEXITCODE -ne 0) { throw "Onboarding failed; inspect the private report and logs" }
Get-Content -LiteralPath (Join-Path $onboardingOutput "report.json") -Raw | ConvertFrom-Json
```

UbuntuではPowerShellを追加せず、Bashで実行できます：

```bash
onboarding_output="$(mktemp -d "${TMPDIR:-/tmp}/eb-onboarding-parent.XXXXXXXX")/run"
node examples/enterprise-onboarding/run.mjs --out "$onboarding_output" --acknowledge-owned-fixture && cat "$onboarding_output/report.json"
```

出力先はソースの外にある未作成の絶対パスを指定します。既存の結果は上書きしません。初期設定入力、生成した認証情報、設定、データベース、ログを含むため、出力ディレクトリー全体を非公開にしてください。最小レポートに認証情報やローカルパスは含まれず、自動送信もありません。ファイルモードの指定だけではWindowsのアクセス権は設定されません。

## 実行内容

1. CLIで空の企業とIT管理者を初期化します。飲料事例のデータやモデルは導入しません。
2. ローカルポートでホストを起動します。専用クライアントが設定済みのプロキシーヘッダーとHTTPSオリジンを付けてHTTPバックエンドに接続します。TLSプロキシーやブラウザーは起動しません。
3. IT管理者が別の業務責任者を作成し、三つのノードからなる定義を登録します。既存の参照ステージ`channel-1`への対応を明示し、自動推定は行いません。
4. 導入済みの`process.definition.read@v1`で計画を作成します。ITによる承認や、有効な業務承認のない実行は拒否されます。
5. 業務責任者が承認・実行します。通常の実行記録はソースの本文を隠し、許可された確認用APIから三つのノードを持つプロセスメタデータを取得します。
6. 別プロセスでホストを再起動し、再ログインして同じ完了済み操作を確認します。最後に自分のホストを停止し、非公開の出力を保持します。

成功時は`status=passed`、`hostStopped=true`、確認済みプロセス1件、操作1件、`resultKind=process_metadata`、`resultNodes=3`、`originalActionRetained=true`になります。結果はプロセス定義であり、在庫、注文、支払の実績ではありません。

失敗時は非ゼロで終了し、レポートとログを残します。原因を修正して新しい出力先で実行してください。他のプロセスを終了したり、既存の導入環境を引き継いだりしません。

## 次の手順

[HTTPサンプルへの接続](FIRST_CONNECTION.ja.md) · [応答消失と復旧](FIRST_TASK.ja.md) · [在庫アダプター](EXTEND_A_SOURCE.ja.md) · [独自ホスト設定（英語）](HOST.en.md)

アカウント作成と承認はサンプルプログラムが実際のAPIで行います。人による承認、ブラウザーログイン、TLS、汎用システム探索、ベンダー接続、本番導入の検証ではありません。独自ツールの導入と権限設定は別途必要です。
