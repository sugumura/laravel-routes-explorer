import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { runRouteList } from './artisan';
import { openRoute } from './navigation';
import { LaravelRoute, parseRouteList } from './routeParser';
import { RouteTreeProvider, shortMiddleware } from './routeProvider';

const VIEW_ID = 'laravelRoutes.routes';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Laravel Routes');
  const provider = new RouteTreeProvider();
  const treeView = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: provider });
  let projectRoot: string | undefined;

  context.subscriptions.push(
    output,
    treeView,
    vscode.commands.registerCommand('laravelRoutes.refresh', () => load()),
    vscode.commands.registerCommand('laravelRoutes.showOutput', () => output.show()),
    vscode.commands.registerCommand('laravelRoutes.filter', () => pickFilter()),
    vscode.commands.registerCommand('laravelRoutes.clearFilter', () => applyFilter([])),
    vscode.commands.registerCommand('laravelRoutes.open', async (route: LaravelRoute) => {
      if (!projectRoot) {
        return;
      }
      try {
        await openRoute(route, projectRoot);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        output.appendLine(`ERROR (open): ${message}`);
        void vscode.window.showErrorMessage(`Laravel Routes: ${message}`);
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => load()),
  );

  let loading = false;

  async function load(): Promise<void> {
    if (loading) {
      return;
    }
    loading = true;
    try {
      projectRoot = findLaravelProjectRoot();
      await setContext('hasProject', projectRoot !== undefined);
      await setContext('loadError', false);

      if (!projectRoot) {
        provider.setRoutes([]);
        treeView.badge = undefined;
        treeView.message = undefined;
        output.appendLine('artisan ファイルが見つかりません。');
        return;
      }

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

  /** バッジ・メッセージ・コンテキストキーを現在の状態に合わせる */
  function updateViewState(): void {
    const filter = provider.getFilter();
    const visible = provider.getVisibleRoutes().length;
    treeView.badge = { value: visible, tooltip: `${visible} routes` };
    treeView.message =
      filter.length > 0 ? `フィルター: ${filter.map(shortMiddleware).join(', ')}` : undefined;
    void setContext('filterActive', filter.length > 0);
  }

  void load();
}

export function deactivate(): void {}

/** ワークスペースフォルダ直下に artisan があるフォルダを探す。最初に見つかったものを返す */
function findLaravelProjectRoot(): string | undefined {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const root = folder.uri.fsPath;
    if (fs.existsSync(path.join(root, 'artisan'))) {
      return root;
    }
  }
  return undefined;
}

function setContext(key: string, value: boolean): Thenable<unknown> {
  return vscode.commands.executeCommand('setContext', `laravelRoutes.${key}`, value);
}
