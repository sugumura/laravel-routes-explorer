#!/bin/sh
# 動作確認用の Laravel プロジェクトを sample-app/ に作成する（git 管理外）
set -eu
cd "$(dirname "$0")/.."

# 最新の laravel/laravel が要求する PHP の最低バージョン（Laravel 13 時点）
PHP_MIN_MAJOR=8
PHP_MIN_MINOR=3

if ! command -v composer >/dev/null 2>&1; then
  echo "composer が見つかりません。https://getcomposer.org/ からインストールしてください。" >&2
  exit 1
fi

if ! command -v php >/dev/null 2>&1; then
  echo "php が見つかりません。PHP ${PHP_MIN_MAJOR}.${PHP_MIN_MINOR} 以上をインストールしてください。" >&2
  exit 1
fi

PHP_VERSION=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')
PHP_MAJOR=${PHP_VERSION%%.*}
PHP_MINOR=${PHP_VERSION#*.}
if [ "$PHP_MAJOR" -lt "$PHP_MIN_MAJOR" ] || { [ "$PHP_MAJOR" -eq "$PHP_MIN_MAJOR" ] && [ "$PHP_MINOR" -lt "$PHP_MIN_MINOR" ]; }; then
  echo "PHP ${PHP_MIN_MAJOR}.${PHP_MIN_MINOR} 以上が必要です（現在: $(php -r 'echo PHP_VERSION;')）。" >&2
  exit 1
fi

echo "composer: $(composer --version --no-ansi 2>/dev/null | head -1)"
echo "php: $(php -r 'echo PHP_VERSION;')"

if [ -d sample-app ]; then
  echo "sample-app/ は既に存在します。作り直す場合は削除してから実行してください。" >&2
  exit 1
fi

composer create-project laravel/laravel sample-app --no-interaction
cd sample-app

php artisan make:controller UserController --resource
php artisan make:controller ProfileController --invokable
php artisan make:controller Admin/DashboardController
php artisan make:controller Api/PostController --api

cp ../scripts/sample-app/web.php routes/web.php
cp ../scripts/sample-app/api.php routes/api.php
sed -i.bak "s#web: __DIR__.'/../routes/web.php',#&\n        api: __DIR__.'/../routes/api.php',#" bootstrap/app.php && rm bootstrap/app.php.bak

# 追加ルートが参照するメソッドを生やす
for spec in "app/Http/Controllers/Admin/DashboardController.php index" "app/Http/Controllers/Api/PostController.php publish"; do
  set -- $spec
  perl -0pi -e "s/\}\s*\z/\n    public function $2()\n    {\n        \/\/\n    }\n}\n/" "$1"
done

php artisan route:list
