#!/bin/sh
# 動作確認用の Laravel プロジェクトを sample-app/ に作成する（git 管理外）
# Creates a Laravel project in sample-app/ for manual testing (not tracked by git)
#
# Usage: scripts/create-sample-app.sh [--php PATH] [--composer PATH] [--lang ja|en] [--help]
set -eu
cd "$(dirname "$0")/.."

# 最新の laravel/laravel が要求する PHP の最低バージョン（Laravel 13 時点）
# Minimum PHP version required by the latest laravel/laravel (as of Laravel 13)
PHP_MIN_MAJOR=8
PHP_MIN_MINOR=3
PHP_MIN="${PHP_MIN_MAJOR}.${PHP_MIN_MINOR}"

PHP_BIN=${PHP_BIN:-php}
COMPOSER_BIN=${COMPOSER_BIN:-composer}
UI_LANG=""
SHOW_HELP=0

# --- メッセージ / messages ---------------------------------------------------

detect_lang() {
  case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in
    ja*) echo ja ;;
    *) echo en ;;
  esac
}

# msg <key> [args...]  — 選択中の言語でメッセージを出力する / prints a message in the selected language
msg() {
  key=$1
  shift
  if [ "$UI_LANG" = ja ]; then
    case $key in
      composer_missing)  printf 'composer が見つかりません: %s\nhttps://getcomposer.org/ からインストールするか、--composer でパスを指定してください。\n' "$1" ;;
      php_missing)       printf 'php が見つかりません: %s\nPHP %s 以上をインストールするか、--php でパスを指定してください。\n' "$1" "$2" ;;
      php_too_old)       printf 'PHP %s 以上が必要です（現在: %s、%s）。\n--php で別の PHP を指定してください。\n' "$1" "$2" "$3" ;;
      exists)            printf 'sample-app/ は既に存在します。作り直す場合は削除してから実行してください。\n' ;;
      unknown_option)    printf '不明なオプションです: %s\n' "$1" ;;
      missing_value)     printf 'オプション %s には値が必要です。\n' "$1" ;;
      hint)              printf 'ヒント: --php と --composer で実行ファイルを指定できます。オプション一覧は --help を参照してください。\n' ;;
      using)             printf 'composer: %s\nphp: %s (%s)\n' "$1" "$2" "$3" ;;
      done)              printf '\nsample-app/ を作成しました。VSCode で F5 を押すと拡張開発ホストがこのフォルダを開きます。\n' ;;
    esac
  else
    case $key in
      composer_missing)  printf 'composer not found: %s\nInstall it from https://getcomposer.org/ or pass its path with --composer.\n' "$1" ;;
      php_missing)       printf 'php not found: %s\nInstall PHP %s or later, or pass its path with --php.\n' "$1" "$2" ;;
      php_too_old)       printf 'PHP %s or later is required (found %s at %s).\nPass a different PHP with --php.\n' "$1" "$2" "$3" ;;
      exists)            printf 'sample-app/ already exists. Delete it first to recreate.\n' ;;
      unknown_option)    printf 'Unknown option: %s\n' "$1" ;;
      missing_value)     printf 'Option %s requires a value.\n' "$1" ;;
      hint)              printf 'Hint: use --php and --composer to point to the executables. Run with --help to see all options.\n' ;;
      using)             printf 'composer: %s\nphp: %s (%s)\n' "$1" "$2" "$3" ;;
      done)              printf '\nCreated sample-app/. Press F5 in VSCode to open it in the Extension Development Host.\n' ;;
    esac
  fi
}

usage() {
  if [ "$UI_LANG" = ja ]; then
    cat <<USAGE
使い方: scripts/create-sample-app.sh [オプション]

動作確認用の Laravel プロジェクトを sample-app/ に作成します（git 管理外）。

オプション:
  -p, --php PATH        使用する PHP 実行ファイル（既定: php、環境変数 PHP_BIN でも指定可）
  -c, --composer PATH   使用する composer（既定: composer、環境変数 COMPOSER_BIN でも指定可）
  -l, --lang ja|en      メッセージの言語（既定: LANG から判定）
  -h, --help            このヘルプを表示

必要環境: PHP ${PHP_MIN} 以上、composer
USAGE
  else
    cat <<USAGE
Usage: scripts/create-sample-app.sh [options]

Creates a Laravel project in sample-app/ for manual testing (not tracked by git).

Options:
  -p, --php PATH        PHP executable to use (default: php, or env PHP_BIN)
  -c, --composer PATH   composer to use (default: composer, or env COMPOSER_BIN)
  -l, --lang ja|en      Message language (default: detected from LANG)
  -h, --help            Show this help

Requirements: PHP ${PHP_MIN} or later, composer
USAGE
  fi
}

# エラーを表示して終了。第 1 引数が 1 ならオプションの案内を添える
# Print an error and exit. Appends the options hint when the first argument is 1
die() {
  with_hint=$1
  shift
  msg "$@" >&2
  if [ "$with_hint" = 1 ]; then
    msg hint >&2
  fi
  exit 1
}

# --- オプション解析 / option parsing -----------------------------------------

need_value() {
  if [ -z "${2:-}" ]; then
    UI_LANG=${UI_LANG:-$(detect_lang)}
    die 1 missing_value "$1"
  fi
}

while [ $# -gt 0 ]; do
  case $1 in
    -p|--php)       need_value "$1" "${2:-}"; PHP_BIN=$2; shift 2 ;;
    --php=*)        PHP_BIN=${1#*=}; shift ;;
    -c|--composer)  need_value "$1" "${2:-}"; COMPOSER_BIN=$2; shift 2 ;;
    --composer=*)   COMPOSER_BIN=${1#*=}; shift ;;
    -l|--lang)      need_value "$1" "${2:-}"; UI_LANG=$2; shift 2 ;;
    --lang=*)       UI_LANG=${1#*=}; shift ;;
    -h|--help)      SHOW_HELP=1; shift ;;
    *)              UI_LANG=${UI_LANG:-$(detect_lang)}; die 1 unknown_option "$1" ;;
  esac
done

case $UI_LANG in
  ja|en) ;;
  *) UI_LANG=$(detect_lang) ;;
esac

if [ "$SHOW_HELP" = 1 ]; then
  usage
  exit 0
fi

# --- 環境チェック / environment checks ---------------------------------------

COMPOSER_PATH=$(command -v "$COMPOSER_BIN" 2>/dev/null || true)
if [ -z "$COMPOSER_PATH" ]; then
  die 1 composer_missing "$COMPOSER_BIN"
fi

PHP_PATH=$(command -v "$PHP_BIN" 2>/dev/null || true)
if [ -z "$PHP_PATH" ]; then
  die 1 php_missing "$PHP_BIN" "$PHP_MIN"
fi

PHP_VERSION=$("$PHP_PATH" -r 'echo PHP_VERSION;')
PHP_MAJOR=$("$PHP_PATH" -r 'echo PHP_MAJOR_VERSION;')
PHP_MINOR=$("$PHP_PATH" -r 'echo PHP_MINOR_VERSION;')
if [ "$PHP_MAJOR" -lt "$PHP_MIN_MAJOR" ] || { [ "$PHP_MAJOR" -eq "$PHP_MIN_MAJOR" ] && [ "$PHP_MINOR" -lt "$PHP_MIN_MINOR" ]; }; then
  die 1 php_too_old "$PHP_MIN" "$PHP_VERSION" "$PHP_PATH"
fi

msg using "$COMPOSER_PATH" "$PHP_VERSION" "$PHP_PATH"

if [ -d sample-app ]; then
  die 0 exists
fi

# composer が PHP スクリプト（phar）なら指定した PHP で実行し、post-install の @php も同じ PHP を使わせる
# If composer is a PHP script (phar), run it with the selected PHP so its @php scripts use the same one
run_composer() {
  if head -c 64 "$COMPOSER_PATH" 2>/dev/null | grep -q php; then
    "$PHP_PATH" "$COMPOSER_PATH" "$@"
  else
    "$COMPOSER_PATH" "$@"
  fi
}

# --- 作成 / create -----------------------------------------------------------

run_composer create-project laravel/laravel sample-app --no-interaction
cd sample-app

"$PHP_PATH" artisan make:controller UserController --resource
"$PHP_PATH" artisan make:controller ProfileController --invokable
"$PHP_PATH" artisan make:controller Admin/DashboardController
"$PHP_PATH" artisan make:controller Api/PostController --api

cp ../scripts/sample-app/web.php routes/web.php
cp ../scripts/sample-app/api.php routes/api.php
sed -i.bak "s#web: __DIR__.'/../routes/web.php',#&\n        api: __DIR__.'/../routes/api.php',#" bootstrap/app.php && rm bootstrap/app.php.bak

# 追加ルートが参照するメソッドを生やす / add the methods referenced by the extra routes
for spec in "app/Http/Controllers/Admin/DashboardController.php index" "app/Http/Controllers/Api/PostController.php publish"; do
  set -- $spec
  perl -0pi -e "s/\}\s*\z/\n    public function $2()\n    {\n        \/\/\n    }\n}\n/" "$1"
done

"$PHP_PATH" artisan route:list
msg done
