# Changelog

## 0.1.0

- 右クリックメニューに「Go to Source」と「Go to Route Definition」を追加
- パス（URI の部分一致）による絞り込みを追加。ミドルウェアの絞り込みと組み合わせ可能
- `routes/` 配下の変更を監視して自動で再読み込み（`laravelRoutes.watchRoutes` で無効化可能）
- README を英語化し、日本語版を docs/ に移動。スクリーンショットを追加
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
