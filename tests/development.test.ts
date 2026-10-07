import { linkDependencies } from './fixture.js';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { devSite } from '../src/site.js';

it('rebuilds edited and removed Markdown pages through the development server', async () => {
  const root = await mkdtemp(join(tmpdir(), 'markupress-dev-'));
  await mkdir(join(root, 'docs')); await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await writeFile(join(root, 'docs/index.md'), '# Original');
  await writeFile(join(root, 'docs/old.md'), '# Removed');
  await linkDependencies(root);
  const server = await devSite({ root, port: 0 });
  try {
    expect(await (await fetch(server.url)).text()).toContain('Original');
    await writeFile(join(root, 'docs/index.md'), '# Changed');
    await expect.poll(async () => readFile(join(root, '.markupress/app/pages/v/current/index.html'), 'utf8'), { timeout: 5000 }).toContain('Changed');
    await expect.poll(async () => (await fetch(server.url)).text(), { timeout: 5000 }).toContain('Changed');
    await rm(join(root, 'docs/old.md'));
    await expect.poll(async () => (await fetch(server.url + 'old/')).status, { timeout: 5000 }).toBe(404);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
}, 15000);
