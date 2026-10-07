import { mkdir, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Disposable projects resolve the same public package resources as installed consumers. */
export async function linkDependencies(root: string): Promise<void> {
  const paths = [
    ['@nextwebwg/htmlkit', dirname(fileURLToPath(import.meta.resolve('@nextwebwg/htmlkit'))).replace(/[/\\]dist$/, '')],
    ['@threadlabs/looma', dirname(fileURLToPath(import.meta.resolve('@threadlabs/looma/tokens.css')))],
    ['markupress', fileURLToPath(new URL('..', import.meta.url))],
  ] as const;
  for (const [name, source] of paths) {
    const target = join(root, 'node_modules', name); await mkdir(dirname(target), { recursive: true });
    await symlink(source, target, process.platform === 'win32' ? 'junction' : 'dir');
  }
}
