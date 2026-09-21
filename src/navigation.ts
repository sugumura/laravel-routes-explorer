import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { LaravelRoute } from './routeParser';

/**
 * ルートに対応するソース位置を開く。
 * - "Class@method" → クラスのファイルを開き、メソッド定義行へ
 * - "Class"（Invokable）→ __invoke へ
 * - "Closure" → route:list の path（Laravel 12 以降）があればその位置へ。
 *   なければ routes/ 配下からルート名または URI を検索して定義行へ（ベストエフォート）
 */
export async function openRoute(route: LaravelRoute, projectRoot: string): Promise<void> {
  if (route.path) {
    const file = path.resolve(projectRoot, route.path.file);
    if (fs.existsSync(file)) {
      const document = await vscode.workspace.openTextDocument(file);
      const line = Math.max(0, route.path.line - 1);
      await showAt(document, new vscode.Position(line, document.lineAt(line).firstNonWhitespaceCharacterIndex));
      return;
    }
  }

  if (route.action === '' || route.action === 'Closure') {
    await openClosureRoute(route, projectRoot);
    return;
  }

  const [className, method = '__invoke'] = route.action.split('@');
  const file = resolveClassFile(className, projectRoot);
  if (!file) {
    void vscode.window.showErrorMessage(`Laravel Routes: コントローラファイルが見つかりません: ${className}`);
    return;
  }

  const document = await vscode.workspace.openTextDocument(file);
  const pattern = new RegExp(`function\\s+${escapeRegExp(method)}\\s*\\(`);
  const position = findPosition(document.getText(), pattern);
  await showAt(document, position);
  if (!position) {
    void vscode.window.showWarningMessage(
      `Laravel Routes: メソッド ${method} が ${path.basename(file)} に見つかりません`,
    );
  }
}

// --- クラス → ファイル解決 -------------------------------------------------

interface Psr4Entry {
  prefix: string;
  dirs: string[];
}

/** 完全修飾クラス名から PHP ファイルの絶対パスを返す。見つからなければ undefined */
export function resolveClassFile(className: string, projectRoot: string): string | undefined {
  const fqcn = className.replace(/^\\+/, '');
  const entries = loadPsr4Map(projectRoot);

  for (const entry of entries) {
    if (!fqcn.startsWith(entry.prefix)) {
      continue;
    }
    const relative = fqcn.slice(entry.prefix.length).replace(/\\/g, '/') + '.php';
    for (const dir of entry.dirs) {
      const candidate = path.join(dir, relative);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

/**
 * vendor/composer/autoload_psr4.php を読んで PSR-4 マップを得る。
 * ファイルがなければ Laravel 標準の App\ → app/ だけを返す。
 * プレフィックスが長いものを優先するよう並べ替える。
 */
function loadPsr4Map(projectRoot: string): Psr4Entry[] {
  const fallback: Psr4Entry[] = [{ prefix: 'App\\', dirs: [path.join(projectRoot, 'app')] }];
  const mapFile = path.join(projectRoot, 'vendor', 'composer', 'autoload_psr4.php');

  let source: string;
  try {
    source = fs.readFileSync(mapFile, 'utf8');
  } catch {
    return fallback;
  }

  const entries: Psr4Entry[] = [];
  // 例: 'App\\' => array($baseDir . '/app'),
  const entryPattern = /'((?:[^'\\]|\\.)*)'\s*=>\s*array\(([^)]*)\)/g;
  const dirPattern = /\$(vendorDir|baseDir)\s*\.\s*'([^']*)'/g;

  for (const match of source.matchAll(entryPattern)) {
    const prefix = match[1].replace(/\\\\/g, '\\');
    const dirs: string[] = [];
    for (const dirMatch of match[2].matchAll(dirPattern)) {
      const base = dirMatch[1] === 'vendorDir' ? path.join(projectRoot, 'vendor') : projectRoot;
      dirs.push(path.join(base, dirMatch[2]));
    }
    if (dirs.length > 0) {
      entries.push({ prefix, dirs });
    }
  }

  if (entries.length === 0) {
    return fallback;
  }
  return entries.sort((a, b) => b.prefix.length - a.prefix.length);
}

// --- クロージャルート -------------------------------------------------------

async function openClosureRoute(route: LaravelRoute, projectRoot: string): Promise<void> {
  const files = await vscode.workspace.findFiles(new vscode.RelativePattern(projectRoot, 'routes/**/*.php'));
  const sortedFiles = files.map((f) => f.fsPath).sort();

  for (const pattern of closurePatterns(route)) {
    for (const file of sortedFiles) {
      const text = await fs.promises.readFile(file, 'utf8');
      const position = findPosition(text, pattern);
      if (position) {
        const document = await vscode.workspace.openTextDocument(file);
        await showAt(document, position);
        return;
      }
    }
  }

  void vscode.window.showErrorMessage(`Laravel Routes: ルート定義が見つかりません: ${route.uri}`);
}

/** 検索パターンを確度の高い順に返す */
function closurePatterns(route: LaravelRoute): RegExp[] {
  const patterns: RegExp[] = [];
  const quoted = (s: string) => `['"]${escapeRegExp(s)}['"]`;

  if (route.name) {
    patterns.push(new RegExp(`name\\(\\s*${quoted(route.name)}`));
    const lastSegment = route.name.split('.').pop();
    if (lastSegment && lastSegment !== route.name) {
      patterns.push(new RegExp(`name\\(\\s*${quoted(lastSegment)}`));
    }
  }

  const uri = route.uri.replace(/^\//, '');
  if (uri === '') {
    patterns.push(new RegExp(quoted('/')));
  } else {
    patterns.push(new RegExp(`['"]/?${escapeRegExp(uri)}['"]`));
    const lastSegment = uri.split('/').pop();
    if (lastSegment && lastSegment !== uri) {
      patterns.push(new RegExp(`['"]/?${escapeRegExp(lastSegment)}['"]`));
    }
  }
  return patterns;
}

// --- 共通 -------------------------------------------------------------------

function findPosition(text: string, pattern: RegExp): vscode.Position | undefined {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const column = lines[i].search(pattern);
    if (column !== -1) {
      return new vscode.Position(i, column);
    }
  }
  return undefined;
}

async function showAt(document: vscode.TextDocument, position: vscode.Position | undefined): Promise<void> {
  const target = position ?? new vscode.Position(0, 0);
  await vscode.window.showTextDocument(document, {
    selection: new vscode.Range(target, target),
    preview: true,
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
