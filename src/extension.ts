import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { runRouteList } from './artisan';
import { openRouteDefinition, openRouteSource } from './navigation';
import { LaravelRoute, parseRouteList } from './routeParser';
import { RouteItem, RouteTreeProvider, shortMiddleware } from './routeProvider';

const VIEW_ID = 'laravelRoutes.routes';
/** ファイル保存の連打をまとめるための待ち時間 */
const WATCH_DEBOUNCE_MS = 1500;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Laravel Routes');
  const provider = new RouteTreeProvider();
  const treeView = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: provider });
  let projectRoot: string | undefined;
  let watcher: vscode.FileSystemWatcher | undefined;
  let watchTimer: NodeJS.Timeout | undefined;

  context.subscriptions.push(
    output,
    treeView,
    vscode.commands.registerCommand('laravelRoutes.refresh', () => load()),
    vscode.commands.registerCommand('laravelRoutes.showOutput', () => output.show()),
    vscode.commands.registerCommand('laravelRoutes.filter', () => pickFilter()),
    vscode.commands.registerCommand('laravelRoutes.filterPath', () => inputPathFilter()),
    vscode.commands.registerCommand('laravelRoutes.clearFilter', () => {
      provider.setFilter([]);
      provider.setPathFilter('');
      updateViewState();
    }),
    vscode.commands.registerCommand('laravelRoutes.openSource', (arg: RouteItem | LaravelRoute) =>
      navigate(arg, openRouteSource),
    ),
    vscode.commands.registerCommand('laravelRoutes.openDefinition', (arg: RouteItem | LaravelRoute) =>
      navigate(arg, openRouteDefinition),
    ),
    vscode.workspace.onDidChangeWorkspaceFolders(() => load()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('laravelRoutes')) {
        void load();
      }
    }),
    { dispose: () => stopWatching() },
  );

  let loading = false;
  let reloadRequested = false;

  /**
   * ルート一覧を読み込む。
   * silent: ファイル監視からの自動再読み込み用。失敗しても前回の一覧を残し、通知を出さない
   *（編集途中の構文エラーで route:list が失敗するのは普通のことなので）
   */
  async function load(options: { silent?: boolean } = {}): Promise<void> {
    if (loading) {
      // 実行中に来た要求は取りこぼさず、終わってからもう一度読む
      reloadRequested = true;
      return;
    }
    loading = true;
    try {
      projectRoot = await findLaravelProjectRoot(output);
      await setContext('hasProject', projectRoot !== undefined);
      await setContext('loadError', false);
      treeView.description = projectRoot ? describeProjectRoot(projectRoot) : undefined;
      startWatching(projectRoot);

      if (!projectRoot) {
        provider.setRoutes([]);
        treeView.badge = undefined;
        treeView.message = undefined;
        output.appendLine('artisan ファイルが見つかりません。設定 laravelRoutes.projectRoot で指定できます。');
        return;
      }
      output.appendLine(`project: ${projectRoot}`);

      const root = projectRoot;
      const routes = await vscode.window.withProgress(
        { location: { viewId: VIEW_ID } },
        async () => parseRouteList(await runRouteList(root, output)),
      );

      provider.setRoutes(routes);
      updateViewState();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      output.appendLine(`ERROR: ${message}`);
      if (options.silent) {
        treeView.message = '自動再読み込みに失敗しました。出力パネルを確認してください（前回の一覧を表示中）';
        return;
      }
      provider.setRoutes([]);
      treeView.badge = undefined;
      await setContext('loadError', true);
      void vscode.window.showErrorMessage(`Laravel Routes: ${message}`, '出力を開く').then((choice) => {
        if (choice) {
          output.show();
        }
      });
    } finally {
      loading = false;
      if (reloadRequested) {
        reloadRequested = false;
        void load(options);
      }
    }
  }

  /** routes/ 配下の PHP ファイルを監視し、変更があれば少し待ってから自動で再読み込みする */
  function startWatching(root: string | undefined): void {
    stopWatching();
    if (!root) {
      return;
    }
    const enabled = vscode.workspace
      .getConfiguration('laravelRoutes', vscode.Uri.file(root))
      .get<boolean>('watchRoutes', true);
    if (!enabled) {
      return;
    }

    watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, 'routes/**/*.php'));
    const schedule = (uri: vscode.Uri) => {
      output.appendLine(`changed: ${path.relative(root, uri.fsPath)}`);
      if (watchTimer) {
        clearTimeout(watchTimer);
      }
      watchTimer = setTimeout(() => {
        watchTimer = undefined;
        void load({ silent: true });
      }, WATCH_DEBOUNCE_MS);
    };
    watcher.onDidChange(schedule);
    watcher.onDidCreate(schedule);
    watcher.onDidDelete(schedule);
  }

  function stopWatching(): void {
    if (watchTimer) {
      clearTimeout(watchTimer);
      watchTimer = undefined;
    }
    watcher?.dispose();
    watcher = undefined;
  }

  /** クリック（LaravelRoute）と右クリックメニュー（RouteItem）の両方から呼ばれる */
  async function navigate(
    arg: RouteItem | LaravelRoute,
    open: (route: LaravelRoute, projectRoot: string) => Promise<void>,
  ): Promise<void> {
    if (!projectRoot) {
      return;
    }
    const route = arg instanceof RouteItem ? arg.route : arg;
    try {
      await open(route, projectRoot);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      output.appendLine(`ERROR (navigate): ${message}`);
      void vscode.window.showErrorMessage(`Laravel Routes: ${message}`);
    }
  }

  async function pickFilter(): Promise<void> {
    const all = provider.getAllMiddleware();
    if (all.length === 0) {
      void vscode.window.showInformationMessage('Laravel Routes: 絞り込めるミドルウェアがありません');
      return;
    }
    const current = new Set(provider.getFilter());
    const items = all.map((m) => ({
      label: shortMiddleware(m),
      description: m,
      picked: current.has(m),
      middleware: m,
    }));
    const picked = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'ミドルウェアを選択（複数選択で AND 条件）',
      matchOnDescription: true,
    });
    if (picked) {
      applyFilter(picked.map((p) => p.middleware));
    }
  }

  function applyFilter(middleware: string[]): void {
    provider.setFilter(middleware);
    updateViewState();
  }

  async function inputPathFilter(): Promise<void> {
    const text = await vscode.window.showInputBox({
      value: provider.getPathFilter(),
      prompt: 'URI に含まれる文字列で絞り込みます。空にすると解除',
      placeHolder: '例: admin, users/{user}, api/',
    });
    if (text === undefined) {
      return;
    }
    provider.setPathFilter(text);
    updateViewState();
  }

  /** バッジ・メッセージ・コンテキストキーを現在の状態に合わせる */
  function updateViewState(): void {
    const filter = provider.getFilter();
    const pathFilter = provider.getPathFilter();
    const visible = provider.getVisibleRoutes().length;
    treeView.badge = { value: visible, tooltip: `${visible} routes` };

    const parts: string[] = [];
    if (pathFilter !== '') {
      parts.push(`パス "${pathFilter}"`);
    }
    if (filter.length > 0) {
      parts.push(`ミドルウェア ${filter.map(shortMiddleware).join(', ')}`);
    }
    treeView.message = parts.length > 0 ? `フィルター: ${parts.join(' / ')}` : undefined;
    void setContext('filterActive', provider.hasActiveFilter());
  }

  void load();
}

export function deactivate(): void {}

/**
 * Laravel プロジェクトのルートを探す。優先順位:
 * 1. 設定 laravelRoutes.projectRoot（ワークスペースフォルダからの相対パスまたは絶対パス）
 * 2. ワークスペースフォルダ直下の artisan
 * 3. ワークスペース内を探索して最初に見つかった artisan（vendor, node_modules は除く）
 */
async function findLaravelProjectRoot(output: vscode.OutputChannel): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];

  for (const folder of folders) {
    const configured = vscode.workspace
      .getConfiguration('laravelRoutes', folder.uri)
      .get<string>('projectRoot', '')
      .trim();
    if (configured === '') {
      continue;
    }
    const root = path.resolve(folder.uri.fsPath, configured);
    if (hasArtisan(root)) {
      return root;
    }
    output.appendLine(`laravelRoutes.projectRoot に artisan がありません: ${root}`);
    void vscode.window.showWarningMessage(`Laravel Routes: 設定 laravelRoutes.projectRoot に artisan がありません: ${configured}`);
  }

  for (const folder of folders) {
    if (hasArtisan(folder.uri.fsPath)) {
      return folder.uri.fsPath;
    }
  }

  const found = await vscode.workspace.findFiles('**/artisan', '**/{vendor,node_modules,storage,.git}/**', 1);
  if (found.length > 0) {
    return path.dirname(found[0].fsPath);
  }
  return undefined;
}

function hasArtisan(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'artisan'));
}

/** ワークスペースフォルダ直下でなければ、ビューの説明に相対パスを出す */
function describeProjectRoot(projectRoot: string): string | undefined {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(projectRoot));
  if (!folder || folder.uri.fsPath === projectRoot) {
    return undefined;
  }
  return path.relative(folder.uri.fsPath, projectRoot);
}

function setContext(key: string, value: boolean): Thenable<unknown> {
  return vscode.commands.executeCommand('setContext', `laravelRoutes.${key}`, value);
}
