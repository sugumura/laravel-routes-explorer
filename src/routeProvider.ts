import * as vscode from 'vscode';
import { LaravelRoute } from './routeParser';

const METHOD_COLORS: Record<string, string> = {
  GET: 'charts.green',
  POST: 'charts.blue',
  PUT: 'charts.yellow',
  PATCH: 'charts.yellow',
  DELETE: 'charts.red',
  ANY: 'charts.purple',
};

export class RouteItem extends vscode.TreeItem {
  constructor(public readonly route: LaravelRoute) {
    super(`${route.methods.join('|')} ${route.uri}`, vscode.TreeItemCollapsibleState.None);

    this.description = [route.name, shortAction(route.action)].filter(Boolean).join('  ');
    this.tooltip = buildTooltip(route);
    this.iconPath = new vscode.ThemeIcon(
      'circle-filled',
      new vscode.ThemeColor(METHOD_COLORS[route.methods[0]] ?? 'charts.foreground'),
    );
    this.contextValue = 'route';
    this.command = {
      command: 'laravelRoutes.openSource',
      title: 'Open Route Source',
      arguments: [route],
    };
  }
}

export class RouteTreeProvider implements vscode.TreeDataProvider<RouteItem> {
  private routes: LaravelRoute[] = [];
  /** 絞り込み条件。ミドルウェアの完全な文字列（クラス名:引数）の AND 条件 */
  private filter: string[] = [];
  private readonly changeEmitter = new vscode.EventEmitter<RouteItem | undefined>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  setRoutes(routes: LaravelRoute[]): void {
    this.routes = routes;
    this.changeEmitter.fire(undefined);
  }

  setFilter(middleware: string[]): void {
    this.filter = [...middleware];
    this.changeEmitter.fire(undefined);
  }

  getFilter(): string[] {
    return [...this.filter];
  }

  /** 取得済みルートに登場するミドルウェアを重複なく返す（短縮名順） */
  getAllMiddleware(): string[] {
    const set = new Set<string>();
    for (const route of this.routes) {
      for (const m of route.middleware) {
        set.add(m);
      }
    }
    return [...set].sort((a, b) => shortMiddleware(a).localeCompare(shortMiddleware(b)));
  }

  getVisibleRoutes(): LaravelRoute[] {
    if (this.filter.length === 0) {
      return this.routes;
    }
    return this.routes.filter((r) => this.filter.every((m) => r.middleware.includes(m)));
  }

  getTreeItem(element: RouteItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: RouteItem): RouteItem[] {
    if (element) {
      return [];
    }
    return this.getVisibleRoutes().map((r) => new RouteItem(r));
  }
}

/** "Illuminate\Auth\Middleware\Authenticate:sanctum" → "Authenticate:sanctum" */
export function shortMiddleware(middleware: string): string {
  return middleware.split('\\').pop() ?? middleware;
}

/** "App\Http\Controllers\UserController@index" → "UserController@index" */
function shortAction(action: string): string {
  const [className, method] = action.split('@');
  const shortName = className.split('\\').pop() ?? className;
  return method ? `${shortName}@${method}` : shortName;
}

function buildTooltip(route: LaravelRoute): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${route.methods.join(' | ')}** \`${route.uri}\`\n\n`);
  if (route.domain) {
    md.appendMarkdown(`- domain: \`${route.domain}\`\n`);
  }
  if (route.name) {
    md.appendMarkdown(`- name: \`${route.name}\`\n`);
  }
  md.appendMarkdown(`- action: \`${route.action || '-'}\`\n`);
  if (route.middleware.length > 0) {
    md.appendMarkdown(`\n**middleware**\n\n`);
    for (const m of route.middleware) {
      md.appendMarkdown(`- \`${m}\`\n`);
    }
  }
  return md;
}
