# 現実予測を開発中にしている期間の公開

`shared/config.js` の `predictionsEnabled: false` を UI / API 共通の公開状態として使用する。

- GitHub の通常 CI は検証のみ。push だけでは本番 Worker は更新されない。
- 停止期間の本番反映は `npm run deploy:paused` を実行する。
- このコマンドは予測受付が無効であることを検証し、既存の全チェック・ビルドを通してから本番 Worker を公開する。
- 停止中の XLSX から予測カタログを再生成しない。既存カタログ、D1、利用者の記録は保持する。DB マイグレーションや削除は行わない。
- 再開時は通常の `npm run deploy` に戻し、`predictions:check` を含む公開データの整合確認を行う。`deploy:paused` は受付が有効ならエラーで停止する。
- 公開後は `/project_sixth/#prediction` の開発中表示と受付フォームがないこと、通常メニューが表示されることを確認する。
