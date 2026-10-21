import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { defineConfig, loadConfig } from '../src/config.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function project(files: Readonly<Record<string, string>>) {
  const root = await mkdtemp(join(tmpdir(), 'markupress-config-')); roots.push(root);
  for (const [file, text] of Object.entries(files)) await writeFile(join(root, file), text);
  return root;
}

it('loads markupress.config.ts with its own TypeScript imports, or markupress.config.json, or nothing', async () => {
  const typed = await project({ 'package.json': '{"type":"module"}', 'title.ts': 'export const title: string = "Typed";',
    'markupress.config.ts': 'import { title } from "./title.js";\nconst base: string = "/docs/";\nexport default { title, base };' });
  expect(await loadConfig(typed)).toEqual({ title: 'Typed', base: '/docs/' });
  expect(await loadConfig(await project({ 'markupress.config.json': '{"title":"Plain"}' }))).toEqual({ title: 'Plain' });
  expect(await loadConfig(await project({}))).toEqual({});
  expect(defineConfig({ title: 'Same' })).toEqual({ title: 'Same' });
}, 30_000);

it('rejects two config files and a config that is no object', async () => {
  await expect(loadConfig(await project({ 'markupress.config.json': '{}', 'markupress.config.js': 'export default {};' })))
    .rejects.toThrow('Choose one of markupress.config.ts, markupress.config.js, markupress.config.json');
  await expect(loadConfig(await project({ 'markupress.config.json': '[]' }))).rejects.toThrow('the configuration is an object of Markupress options');
}, 30_000);
