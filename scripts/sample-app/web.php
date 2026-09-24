<?php

use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

// クロージャルート（Laravel 12.55 以降は path で定義行に飛べる）
Route::get('/', function () {
    return view('welcome');
})->name('home');

// Invokable コントローラ（__invoke に飛ぶ）
Route::get('/profile', ProfileController::class)->middleware('auth')->name('profile');

// Route::view / Route::redirect（vendor のコントローラになる）
Route::view('/about', 'welcome')->name('about');
Route::redirect('/old-home', '/');

// リソースルート（7 本まとめて生成される）
Route::resource('users', UserController::class)->middleware(['auth', 'verified']);

// prefix + name + middleware グループ
Route::middleware(['auth', 'verified', 'throttle:60,1'])
    ->prefix('admin')
    ->name('admin.')
    ->group(function () {
        Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');
        Route::get('/stats', fn () => ['users' => 0])->name('stats');
        Route::any('/anything', fn () => 'any')->name('anything');
        Route::match(['put', 'patch'], '/settings', fn () => 'saved')->name('settings');
    });

// ミドルウェア無し、パラメータ付き
Route::delete('/comments/{comment}', fn (int $comment) => response()->noContent())->name('comments.destroy');
