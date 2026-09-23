# Laravel Routes Explorer

English | [日本語](docs/README.ja.md)

A VSCode extension that lists the routes of a Laravel project in the sidebar.
It runs `php artisan route:list --json`, shows the result as a tree, and jumps to the controller method when you click a route.

![Route list filtered by the api middleware, with the controller opened by a click](docs/assets/sample1.png)

![QuickPick for selecting one or more middleware to filter by](docs/assets/sample2.png)

## Features

- Route list in the activity bar under the "Laravel Routes" icon
- Icon color per HTTP method (GET green, POST blue, PUT/PATCH yellow, DELETE red, ANY purple)
- Route name and controller@method on each row, middleware and other details in the tooltip
- Click a route to open the controller file at the target method
  - Invokable controllers open at `__invoke`
  - Closure routes open at the definition line reported by `route:list` on Laravel 12+, or found by searching `routes/` on Laravel 11 (best effort)
- Right-click menu with "Go to Source" (same as click) and "Go to Route Definition" (the `Route::...` line under `routes/`)
- Filter by path (case-insensitive substring of the URI) and by middleware (multiple selections are combined with AND). Both filters combine
- Reload the route list. Files under `routes/` are watched and the list reloads automatically when they change
- Text search over URIs and route names with the tree's built-in find (`Cmd+F`, or `Ctrl+Alt+F` on Windows/Linux)

## Requirements

- VSCode 1.85 or later
- A Laravel 11+ project on PHP 8.2+
- A way to run `php artisan`. If PHP is not on the host (Docker etc.), the command can be replaced, see Settings

## Installation

The extension is not published on the Marketplace. Install it from the `.vsix` file attached to a [GitHub Release](https://github.com/sugumura/laravel-routes-explorer/releases).

```sh
code --install-extension laravel-routes-explorer-0.2.0.vsix
```

Or choose "Install from VSIX..." from the "..." menu in the Extensions view.
When you use VSCode profiles, add `--profile <name>` so the extension goes into the profile you are using.

## Usage

1. Open a Laravel project. The `artisan` file does not have to be at the workspace root; it is detected automatically and the relative path is shown next to the view name when it lives in a subfolder
2. Click the "Laravel Routes" icon in the activity bar
3. The route list appears. A progress bar is shown in the view while loading
4. Click a route to jump to its source. Right-click and choose "Go to Route Definition" to jump to the `Route::get(...)` line instead
5. View title buttons
   - Filter by path: type part of a URI such as `admin` or `users/{user}`. Leave it empty to remove the filter
   - Filter by middleware: pick middleware to narrow the list
   - The current filters are shown above the list together with a clear button that removes both
   - Refresh: run `route:list` again

If `route:list` fails, a notification is shown. Details are in the "Laravel Routes" output channel.

## Settings

| Setting | Default | Description |
|---|---|---|
| `laravelRoutes.command` | `php artisan route:list --json` | Command that produces the route list. Runs through the shell with the project root as cwd |
| `laravelRoutes.projectRoot` | `""` | Folder that contains `artisan`, relative to the workspace folder or absolute. Auto-detected when empty |
| `laravelRoutes.exceptVendor` | `false` | Hide routes defined by vendor packages (`--except-vendor`) |
| `laravelRoutes.watchRoutes` | `true` | Reload automatically when a PHP file under `routes/` changes. A failed reload keeps the previous list and shows no notification |

Settings can be set per workspace in `.vscode/settings.json`. The list reloads automatically when they change.

### Project in a subfolder

Auto-detection looks at the workspace folder root first, then searches the workspace for `artisan` (skipping `vendor` and `node_modules`). Set the path explicitly when there are several projects or the search is slow.

```json
{
  "laravelRoutes.projectRoot": "backend"
}
```

### Running through Docker or Sail

Put the whole command in `laravelRoutes.command`. It runs via `/bin/sh` with the project root as cwd. `${projectRoot}` and `${workspaceFolder}` are expanded.

```json
{
  "laravelRoutes.command": "docker compose exec -T app php artisan route:list --json"
}
```

Laravel Sail:

```json
{
  "laravelRoutes.command": "vendor/bin/sail artisan route:list --json"
}
```

Paths returned by `route:list` inside the container are relative to the project root, so navigation keeps working as long as the source is mounted on the host. Resolving controllers needs `vendor/composer/autoload_psr4.php` to be readable from the host.

## Limitations

- On Laravel 11 the definition line of closure routes is not part of `route:list`, so it is located by searching files. Routes whose URI is assembled with `Route::prefix()` and similar may not be found
- With several Laravel projects, only the first one found is used. Set `laravelRoutes.projectRoot` to choose
- `route:list` boots the Laravel application, so it can fail on a broken `.env` and similar problems
- Automatic reload only watches `routes/`. Routes registered elsewhere, for example by service providers or packages, need the Refresh button

## Development

Node.js 24+ and pnpm are required.

```sh
pnpm install
pnpm run compile   # or pnpm run watch
```

Open this folder in VSCode and press `F5` to launch the Extension Development Host with `sample-app/` opened.

### Sample Laravel project

`sample-app/` is not tracked by git. Create it with the script (composer required):

```sh
./scripts/create-sample-app.sh
```

PHP 8.3+ and composer are required. Use `--php` and `--composer` to point to other executables. Messages follow `LANG` (Japanese or English) and can be fixed with `--lang ja|en`. `--help` lists all options.

The generated `routes/web.php` and `routes/api.php` cover the patterns the extension handles: controller@method, invokable controllers, closures, `Route::view` / `Route::redirect`, resource and API resource routes, prefixed groups, and multiple middleware.

- `src/extension.ts` — entry point, command registration and loading
- `src/artisan.ts` — runs `route:list --json`
- `src/routeParser.ts` — parses and normalizes the JSON
- `src/routeProvider.ts` — TreeDataProvider and filtering
- `src/navigation.ts` — navigation to source and route definitions

## Packaging

```sh
pnpm run package
```

This produces `laravel-routes-explorer-<version>.vsix`. `--no-dependencies` is passed because `vsce` cannot read pnpm's `node_modules` layout. Add a bundler such as esbuild if runtime dependencies are ever added.

## Release

Pushing a tag that starts with `v` triggers [release.yml](.github/workflows/release.yml), which builds the vsix and attaches it to a GitHub Release.

1. Bump `version` in `package.json`, describe the changes in `CHANGELOG.md`, and commit
2. Tag with the same version and push

```sh
git tag v0.2.0
git push origin main v0.2.0
```

The workflow fails when the tag does not match `version` in `package.json`. Tags containing a hyphen such as `v0.1.0-beta.1` are published as pre-releases. Release notes are generated from the commit history.

## License

MIT
