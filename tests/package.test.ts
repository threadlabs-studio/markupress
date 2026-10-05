import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), 'package-consumer-'));
const useCommandShell = process.platform === 'win32';

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

describe('published package contract', () => {
  it('installs from its tarball and exposes the declared import', () => {
    const packed = execFileSync(
      'corepack',
      ['pnpm', 'pack', '--pack-destination', workspace],
      { cwd: root, encoding: 'utf8', shell: useCommandShell },
    )
      .trim()
      .split('\n')
      .at(-1);
    expect(packed).toBeDefined();
    const tarball = isAbsolute(packed!) ? packed! : join(workspace, packed!);
    writeFileSync(
      join(workspace, 'package.json'),
      JSON.stringify({ name: 'package-consumer', private: true, type: 'module' }),
    );
    execFileSync(
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball],
      { cwd: workspace, shell: useCommandShell },
    );
    const installed = JSON.parse(
      readFileSync(join(workspace, 'node_modules', 'markupress', 'package.json'), 'utf8'),
    );
    expect(installed.exports).toBeDefined();
    expect(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          "import('markupress').then(() => process.stdout.write('ok'))",
        ],
        { cwd: workspace, encoding: 'utf8' },
      ),
    ).toBe('ok');
  });
});
