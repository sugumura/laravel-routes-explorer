import { exec } from 'node:child_process';
import * as vscode from 'vscode';

const DEFAULT_COMMAND = 'php artisan route:list --json';
const MAX_BUFFER = 64 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

/**
 * 設定 laravelRoutes.command のコマンドをシェル経由で実行し、標準出力を返す。
 * Docker や Sail など任意のコマンドを指定できるよう、引数分解はシェルに任せる。
 * 失敗したら詳細を出力チャンネルに書き、Error を投げる。
 */
export function runRouteList(projectRoot: string, output: vscode.OutputChannel): Promise<string> {
  const command = buildCommand(projectRoot);

  output.appendLine(`[${new Date().toLocaleTimeString()}] $ ${command}`);
  output.appendLine(`  cwd: ${projectRoot}`);

  return new Promise((resolve, reject) => {
    exec(
      command,
      { cwd: projectRoot, maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS, env: process.env },
      (error, stdout, stderr) => {
        if (stderr.trim() !== '') {
          output.appendLine(stderr.trimEnd());
        }
        if (error) {
          if (stdout.trim() !== '') {
            output.appendLine(stdout.trimEnd());
          }
          output.appendLine(`  exit: ${error.message.split('\n')[0]}`);
          if (error.code === 127) {
            reject(new Error(`コマンドが見つかりません。設定 laravelRoutes.command を確認してください: ${command}`));
            return;
          }
          if (error.killed) {
            reject(new Error(`route:list がタイムアウトしました (${TIMEOUT_MS / 1000} 秒)`));
            return;
          }
          reject(new Error(`route:list の実行に失敗しました (exit code ${error.code ?? '?'})`));
          return;
        }
        output.appendLine(`  ok (${stdout.length} bytes)`);
        resolve(stdout);
      },
    );
  });
}

/** 設定からコマンド文字列を組み立てる。${projectRoot} と ${workspaceFolder} を展開する */
export function buildCommand(projectRoot: string): string {
  const scope = vscode.Uri.file(projectRoot);
  const config = vscode.workspace.getConfiguration('laravelRoutes', scope);
  let command = (config.get<string>('command') ?? '').trim() || DEFAULT_COMMAND;
  if (config.get<boolean>('exceptVendor', false)) {
    command += ' --except-vendor';
  }
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(scope)?.uri.fsPath ?? projectRoot;
  return command
    .replace(/\$\{projectRoot\}/g, projectRoot)
    .replace(/\$\{workspaceFolder\}/g, workspaceFolder);
}
