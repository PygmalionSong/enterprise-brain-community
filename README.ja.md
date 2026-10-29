# Enterprise Brain

**企業向け Agent のセルフホスト基盤**

[English](README.md) · [中文](README.zh.md) · [日本語](README.ja.md)

企業の Agent チームに、プロセスの文脈、権限管理、タスク実行、結果確認の基盤を提供します。ERP、CRM、SRM、WMS などの既存システムが業務記録の正本を保持します。

## 一つのシステム横断タスクから始める

二つのサンプルプロセスを確認し、計画を承認して実行します。ツールの書き込み後に応答が失われた場合は、元のアクションを照会して結果を確認します。サンプルデータを使うため、企業アカウントやモデル API キーは不要です。

[最初のタスクを実行（英語）](FIRST_TASK.en.md)

![Beverage business processes](showcase/media/01-processes.png)

## 目的に合わせて選ぶ

- [飲料事例を体験](https://pygmalionsong.github.io/enterprise-brain-community/?lang=ja)
- [供給事例をローカル実行](RUN_OPERATING_CASE.ja.md)
- [アーキテクチャー（英語）](ARCHITECTURE_OVERVIEW.en.md)
- [接続先を拡張](EXTEND_A_SOURCE.ja.md)
- [業務システムへの接続](FIRST_CONNECTION.ja.md)
- [よくある質問](FAQ.ja.md)

## インストールと実行

Node24.19.0 · pnpm11.25.0

```sh
node scripts/verify-repository.mjs
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm build
node scripts/start-reference.mjs --acknowledge-owned-fixture
```

## 現在の対象範囲

開発者向けソースプレビューです。Windows x64 と Ubuntu24.04 x64 でソース検証を実施しています。独立した顧客環境、本番の処理能力、実モデルの品質、顧客の業務成果は未検証です。飲料事例は構成したシステムと決定的なポリシーを使い、ブラウザー体験とローカルバックエンドは別々に動作します。

ツールには明示的な導入と権限設定が必要です。ネットワーク全体の探索や、テーブルからの完全な業務フロー推定には対応していません。業務データの読み取りツールは既定の HTTP ツール一覧に登録されていません。本番向けワンクリックインストーラーは提供していません。

[Scope / English](PREVIEW_SCOPE.en.md) · [CI / validation](PREVIEW_NOTES.en.md)

## 議論と貢献

再現可能な不具合は、バージョン、環境、機密情報を除いた再現例とともに Issues へ報告してください。接続方法や業務シナリオは Discussions、コードや文書の改善は Pull Request を利用してください。認証情報、データベース、顧客記録は投稿しないでください。

[Discussions](https://github.com/PygmalionSong/enterprise-brain-community/discussions) · [Issues](https://github.com/PygmalionSong/enterprise-brain-community/issues) · [Contact](CONTACT.ja.md) · [Security](SECURITY.en.md)

## ライセンス

ソースとサンプルは Apache-2.0 です。再配布時には適用される著作権、ライセンス、NOTICE の表記を保持してください。

[LICENSE](LICENSE) · [NOTICE](NOTICE) · [Third-party notices](THIRD_PARTY_NOTICES.en.md) · [Attribution](ATTRIBUTION.ja.md)

PygmalionSong · [Project background](STORY.ja.md)
