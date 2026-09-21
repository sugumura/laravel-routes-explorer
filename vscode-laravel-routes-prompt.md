# Laravel Routes Explorer — VSCode 拡張開発プロンプト

## 目的

Laravel プロジェクトのルート一覧をサイドバーに表示する VSCode 拡張を作成してください。
既存の Laravel 公式拡張は補完・リンク機能が中心で、ルート全体を俯瞰できる一覧表示がありません。この拡張はその隙間を埋めるものです。

## 前提

- 開発言語: TypeScript
- VSCode Extension API を使用
- Node.js 20 以上、pnpm を使用
- 私は TypeScript と VSCode Extension API の経験がありません。ファイル構成・ビルド手順・デバッグ方法もすべて説明してください
- 対象の Laravel プロジェクトは PHP 8.2 以上、Laravel 11 以上を想定

## 必須機能

### 1. ルート一覧のサイドバー表示

- アクティビティバーに専用アイコンを追加し、クリックするとサイドバーにルート一覧を表示する
- ルート情報は `php artisan route:list --json` の出力を取得して使う
- 表示項目: HTTP メソッド、URI、ルート名、コントローラ@メソッド、ミドルウェア
- UI は TreeView（`TreeDataProvider`）で実装する。Webview は使わない
- 一覧はフラット表示。label に「メソッド URI」、description にルート名とコントローラ@メソッド、tooltip にミドルウェア一覧を出す
- 行アイコンの色を HTTP メソッドごとに変える（GET=緑、POST=青、PUT/PATCH=黄、DELETE=赤、その他=グレー）。`ThemeColor` の `charts.*` を使いテーマに追従させる
- `method` は `GET|HEAD` のように結合されているので、GET があれば HEAD は隠す。全メソッドを持つルートは `ANY` と表示する
- ワークスペースフォルダ直下に `artisan` ファイルがない場合は `viewsWelcome` で「Laravel プロジェクトが見つかりません」と表示する

### 2. コントローラへのジャンプ

- ルートをクリックすると、該当するコントローラファイルを開き、対象メソッドの行にカーソルを移動する
- コントローラのクラス名からファイルパスを解決する（`App\Http\Controllers\UserController` → `app/Http/Controllers/UserController.php`）
- メソッド名でファイル内を検索し、`public function メソッド名(` の行に移動する
- Invokable コントローラ（`@メソッド` がない action）は `__invoke` に移動する
- クロージャルートは `route:list --json` に定義位置が含まれないため、`routes/` 配下の PHP ファイルから URI またはルート名を検索して移動する（ベストエフォート。見つからなければ通知を出す）
- コントローラファイルが見つからない場合はエラー通知を出す

### 3. ミドルウェアによるフィルタリング

- ビュータイトルにフィルターボタンを置き、クリックで QuickPick（複数選択可）を開く。候補は取得済みルートから抽出したミドルウェア名
- `route:list --json` の `middleware` は解決済みのクラス名（例: `Illuminate\Auth\Middleware\Authenticate:sanctum`）で出力される。候補にはクラスの短縮名を表示し、一致判定は完全一致で行う
- 複数ミドルウェアの AND 条件で絞り込めるようにする
- フィルター中はビュータイトルにクリアボタンを表示する（`when` 句でコンテキストキーを見る）
- フィルター中は `TreeView.message` に「フィルター: Authenticate, EnsureEmailIsVerified」のように現在の条件を表示する

## 追加機能（あれば嬉しい）

- URI やルート名でのテキスト検索（TreeView 標準の Cmd+F 検索で足りるなら不要）
- `routes/*.php` の変更を監視して自動で再読み込みする

## 技術的な要件

- `php artisan route:list --json` の実行は `child_process.execFile` を使い、`artisan` のあるフォルダを cwd にする。`maxBuffer` を大きめにし、timeout を設定する
- PHP のパスは設定 `laravelRoutes.phpPath` で変更できるようにする（デフォルト: `php`）。Docker 等で PHP がホストにない場合はラッパースクリプトを指定する運用とする
- 設定 `laravelRoutes.exceptVendor` で `--except-vendor` を付けられるようにする（デフォルト: false）
- 標準出力に JSON 以外が混ざることがあるので、先頭の `[` から末尾の `]` までを切り出して解析する。ルートが 0 件のときは JSON が出ないので空配列として扱う
- artisan の実行に失敗した場合はエラー内容を出力パネル「Laravel Routes」に表示し、通知から出力パネルを開けるようにする
- 実行中は TreeView にプログレスを表示する
- 再読み込みボタン（`route:list` の再実行）はステップ 1 から含める
- TreeView は標準で仮想化されているため、ページング等は不要
- コードは可能な限りシンプルに保ち、過剰な抽象化は避ける

## 成果物

以下をすべて作成してください。

1. `package.json`（拡張のマニフェスト、contributes の定義を含む）
2. `src/extension.ts`（エントリーポイント）
3. `src/artisan.ts`（`route:list --json` の実行）
4. `src/routeParser.ts`（`route:list --json` の解析）
5. `src/routeProvider.ts`（TreeDataProvider の実装）
6. `src/navigation.ts`（コントローラへのジャンプ処理）
7. `tsconfig.json`、`.vscodeignore`、`.gitignore`
8. `.vscode/launch.json`、`.vscode/tasks.json`（F5 デバッグ用）
9. `resources/icon.svg`（アクティビティバー用アイコン）
10. `README.md`（インストール方法・使い方・設定項目）
11. デバッグ手順（F5 で拡張開発ホストを起動する方法）
12. `.vsix` ファイルのパッケージ方法（`@vscode/vsce` を使用。pnpm のため `--no-dependencies` を付ける）

## 進め方

一度にすべてを作らず、以下の順番で段階的に進めてください。各ステップが動作することを確認してから次に進みます。

1. まず「ルート一覧をサイドバーに表示する」だけの最小構成を作る
2. 動作確認後、コントローラへのジャンプを追加する
3. 動作確認後、ミドルウェアフィルターを追加する
4. 最後に README と パッケージ手順をまとめる

各ステップの最後に「このステップで確認すべきこと」を箇条書きで示してください。
