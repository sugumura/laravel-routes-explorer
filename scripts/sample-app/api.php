<?php

use App\Http\Controllers\Api\PostController;
use Illuminate\Support\Facades\Route;

Route::apiResource('posts', PostController::class);
Route::post('/posts/{post}/publish', [PostController::class, 'publish'])->middleware('throttle:10,1')->name('posts.publish');
