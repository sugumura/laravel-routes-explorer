# Changelog

## 0.0.2

- 開発・ビルド環境を Node.js 24 以上に統一
- リリースワークフローの action を Node 24 対応版に更新
- 動作確認用プロジェクト作成スクリプトを日英対応にし、`--php` / `--composer` オプションを追加

## 0.0.1

- 初回リリース
- ルート一覧のサイドバー表示
- コントローラ / ルート定義へのジャンプ
- ミドルウェアによる絞り込み
- `laravelRoutes.command` で `route:list` のコマンドを差し替え可能（Docker / Sail 対応）
- `laravelRoutes.projectRoot` でサブフォルダのプロジェクトを指定可能。未設定なら自動検出
