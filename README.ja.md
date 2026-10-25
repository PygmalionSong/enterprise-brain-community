# Enterprise Brain

**企業が自社業務Agentチームを構築するための技術基盤。**

[English](README.md) · [中文](README.zh.md) · [日本語](README.ja.md)

## 業務の選択肢を比べ、実行結果を照合する。

地域の需要が増えたとき、追加生産、倉庫移送、委託生産を選べます。資金、納期、品質条件を同時に満たす必要があります。Enterprise Brainは業務文脈、責任者の承認、ソースの証跡をつなぎます。

## ここから始める

- [三言語の業務事例](https://pygmalionsong.github.io/enterprise-brain-community/?lang=ja)
- [永続化されたバックエンドをローカル実行](RUN_OPERATING_CASE.ja.md)
- [技術アーキテクチャー / English](ARCHITECTURE_OVERVIEW.en.md)
- [小さなソース接続を拡張](EXTEND_A_SOURCE.ja.md)
- [対応範囲 / English](PREVIEW_SCOPE.en.md)

ブラウザー事例は構成したローカル状態です。ローカルバックエンドは別の参照実装で、構成ソースと決定的な方針を使います。実企業・実モデルの成果ではありません。

![Enterprise operating blueprint](showcase/media/01-processes.png)

## ソースの証跡を確認

15領域の全体像を保ちます。実行検証は生産80万、移送60万、委託20万ケースの供給経路です。承認、受理、入荷、支払、販売は別々に確認します。支払・販売は未確認です。

維持管理者のHTTP復旧試験では、3件の確定後に応答がタイムアウトしました。元の操作を照会し、再起動後も識別情報を保持して、重複送信なしで160万ケースの入荷を確認しました。

[ソースの証跡を確認](BACKEND_EVIDENCE.ja.md)

## インストールと実行

Windows x64 · Node24.19.0 · pnpm11.25.0。依存関係の取得にはレジストリーへの接続が必要です。失敗したコマンドで停止してください。

```powershell
node scripts/verify-repository.mjs
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm build
node scripts/start-reference.mjs --acknowledge-owned-fixture
```

別プロセスによる復旧経路は [制御された初回タスク / English](FIRST_TASK.en.md)。 実際のGraphToolインターフェースを使う拡張は [在庫アダプター実験](EXTEND_A_SOURCE.ja.md)。

## このプレビューの範囲

基盤モジュール、永続化された参照画面、独立ブラウザー事例を含みます。MCP/BPMN/ODataの明示的な部分集合を使い、管理者がツールを導入します。モデルは交換可能ですが提案は権限ではありません。署名付き一括導入や本番認定ではありません。Linux、独立顧客ホスト、実モデル品質は未確認です。

## 議論と貢献

業務・連携の相談はDiscussions、再現可能な不具合や任意の導入報告はIssuesへ。Forkからレビュー付きPRを提案できます。公開アクセスは公式書込権限を与えません。キー、データベース、顧客の生ログを公開しないでください。

[Discussions](https://github.com/PygmalionSong/enterprise-brain-community/discussions) · [Issues](https://github.com/PygmalionSong/enterprise-brain-community/issues) · [Contact / 联系 / 連絡](CONTACT.ja.md) · [Security](SECURITY.en.md) · [Contribute](CONTRIBUTING.en.md)

## ライセンスと自社運用

Apache-2.0。LICENSE、NOTICE、第三者表記を保持してください。自社で展開、変更、運用できます。有料プランや本番SLAは設けていません。

[LICENSE](LICENSE) · [NOTICE](NOTICE) · [Third-party notices](THIRD_PARTY_NOTICES.en.md)

[PygmalionSongが維持管理します。十年以上の経営コンサルティングとデジタル変革の経験が背景です。](STORY.ja.md)
