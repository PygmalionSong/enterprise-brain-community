# 利用を始める前に

## 最初に何を試せますか？

[最初のタスク（英語）](https://github.com/PygmalionSong/enterprise-brain-community/blob/v0.1.0-preview.2/FIRST_TASK.en.md)を実行してください。二つのサンプルプロセスを読み取り、実行を承認します。ツールが記録を書き込んだ後に応答を失った場合、元のアクションを照会して結果を確認する動作を試せます。構成したサンプルデータを使うため、企業アカウントやモデル API キーは不要です。

## 自社の業務システムにそのまま接続できますか？

アダプターの開発または設定と、読み取り範囲・業務権限の定義が必要です。現バージョンは初回接続と範囲を限定した読み取りの参照実装です。企業ネットワーク全体の自動探索や、データベースのテーブルから完全な業務プロセスを推定する機能はありません。業務データの読み取りツールは SDK から明示的に組み込む必要があり、既定の HTTP ツール一覧では有効になっていません。接続前に[対象範囲（英語）](https://github.com/PygmalionSong/enterprise-brain-community/blob/v0.1.0-preview.2/PREVIEW_SCOPE.en.md)を確認してください。

## データはどこに保存されますか？

ランタイムは導入環境内にプロセス、権限、計画、実行記録を保存します。ERP、CRM、SRM、WMS などの既存システムが業務記録の正本を保持します。インストール報告の自動送信や、ホスト型モデル・有料サービスの自動有効化は行いません。サーバー、認証情報、運用は導入側が管理します。

## 質問や貢献はどうすればよいですか？

- 実行に失敗した場合は、バージョン、実行環境、再現手順、機密情報を除いたエラー内容を添えて [Issue](https://github.com/PygmalionSong/enterprise-brain-community/issues) を作成してください。
- 接続方法や業務シナリオは [Discussions](https://github.com/PygmalionSong/enterprise-brain-community/discussions) で議論できます。
- コードや文書の改善は Pull Request で提案し、メンテナーがレビューします。

認証情報、顧客記録、機密情報を含むログは投稿しないでください。
