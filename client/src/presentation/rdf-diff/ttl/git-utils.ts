import * as vscode from 'vscode';
import * as path from 'path';

interface GitExtension { getAPI(version: number): GitAPI }
interface GitAPI { getRepository(uri: vscode.Uri): Repository | null }
interface Repository {
  rootUri: vscode.Uri;
  show(ref: string, relPath: string): Promise<string | undefined>;
}

export function getGitAPI(): GitAPI | null {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports;
  return ext?.getAPI(1) ?? null;
}
export function getRepo(api: GitAPI, uri: vscode.Uri) {
  return api.getRepository(uri);
}
export function relPath(repo: { rootUri: vscode.Uri }, file: vscode.Uri) {
  const rel = path.relative(repo.rootUri.fsPath, file.fsPath);
  return rel.split(path.sep).join(path.posix.sep);
}
export async function readAt(api: GitAPI, file: vscode.Uri, ref: string): Promise<string | null> {
  const repo = api.getRepository(file);
  if (!repo) {return null;}
  try { return (await repo.show(ref, relPath(repo, file))) ?? null; } catch { return null; }
}
