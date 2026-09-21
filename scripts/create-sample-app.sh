#!/bin/sh
# 動作確認用の Laravel プロジェクトを sample-app/ に作成する（git 管理外）
set -eu
cd "$(dirname "$0")/.."

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
