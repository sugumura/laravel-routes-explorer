import { execFile } from 'node:child_process';
import * as vscode from 'vscode';

const MAX_BUFFER = 64 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

/**
 * `php artisan route:list --json` を実行し、標準出力を返す。
 * 失敗したら詳細を出力チャンネルに書き、Error を投げる。
 */
export function runRouteList(projectRoot: string, output: vscode.OutputChannel): Promise<string> {
  const config = vscode.workspace.getConfiguration('laravelRoutes');
  const phpPath = config.get<string>('phpPath', 'php').trim() || 'php';
  const args = ['artisan', 'route:list', '--json'];
  if (config.get<boolean>('exceptVendor', false)) {
    args.push('--except-vendor');
  }

  output.appendLine(`[${new Date().toLocaleTimeString()}] $ ${phpPath} ${args.join(' ')}`);
  output.appendLine(`  cwd: ${projectRoot}`);

  return new Promise((resolve, reject) => {
    execFile(
      phpPath,
      args,
      { cwd: projectRoot, maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS, env: process.env },
      (error, stdout, stderr) => {
        if (stderr.trim() !== '') {
          output.appendLine(stderr.trimEnd());
        }
        if (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (stdout.trim() !== '') {
            output.appendLine(stdout.trimEnd());
          }
          if (code === 'ENOENT') {
            reject(new Error(`PHP が見つかりません: "${phpPath}"。設定 laravelRoutes.phpPath を確認してください。`));
            return;
          }
          output.appendLine(`  exit: ${error.message}`);
          reject(new Error(`route:list の実行に失敗しました (${error.message.split('\n')[0]})`));
          return;
        }
        output.appendLine(`  ok (${stdout.length} bytes)`);
        resolve(stdout);
      },
    );
  });
}
