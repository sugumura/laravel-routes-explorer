import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { runRouteList } from './artisan';
import { openRoute } from './navigation';
import { LaravelRoute, parseRouteList } from './routeParser';
import { RouteTreeProvider } from './routeProvider';

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
      treeView.badge = { value: routes.length, tooltip: `${routes.length} routes` };
      treeView.message = undefined;
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
