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
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('laravelRoutes')) {
        void load();
      }
    }),
  );

  let loading = false;

  async function load(): Promise<void> {
    if (loading) {
      return;
    }
    loading = true;
    try {
      projectRoot = await findLaravelProjectRoot(output);
      await setContext('hasProject', projectRoot !== undefined);
      await setContext('loadError', false);
      treeView.description = projectRoot ? describeProjectRoot(projectRoot) : undefined;

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
