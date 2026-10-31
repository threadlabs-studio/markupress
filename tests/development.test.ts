import { linkDependencies } from './fixture.js';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
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
    await expect.poll(async () => (await fetch(server.url)).text(), { timeout: 5000 }).toContain('Changed');
    await rm(join(root, 'docs/old.md'));
    await expect.poll(async () => (await fetch(server.url + 'old/')).status, { timeout: 5000 }).toBe(404);
    // The runtime renders from Markdown in memory; no generated application is written.
    await expect(stat(join(root, '.markupress'))).rejects.toThrow();
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
}, 15000);

it('refreshes translation metadata after identity swaps, failed discoveries, additions and removals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'markupress-dev-locales-'));
  const page = (id: string, title: string) => `---\nid: ${id}\n---\n# ${title}`;
  const put = (locale: string, name: string, text: string) => writeFile(join(root, 'docs', locale, name + '.md'), text);
  for (const locale of ['en', 'fr']) {
    await mkdir(join(root, 'docs', locale), { recursive: true });
    await put(locale, 'index', '# Home');
    await put(locale, 'a', page('first', locale + ' first'));
    await put(locale, 'b', page('second', locale + ' second'));
  }
  await writeFile(join(root, 'package.json'), '{"type":"module"}'); await linkDependencies(root);
  const server = await devSite({ root, port: 0, base: '/manual/', origin: 'https://docs.example', locales: { en: { label: 'English' }, fr: { label: 'Français' } } });
  const frenchAlternate = async () => {
    const response = await fetch(server.url + 'a/');
    if (!response.ok) return `HTTP ${response.status}`;
    return /<link rel="alternate" hreflang="fr" href="([^"]*)"/.exec(await response.text())?.[1];
  };
  try {
    expect(await frenchAlternate()).toBe('https://docs.example/manual/fr/a/');
    await Promise.all([put('fr', 'a', page('second', 'Français second')), put('fr', 'b', page('first', 'Français first'))]);
    await expect.poll(frenchAlternate, { timeout: 5000 }).toBe('https://docs.example/manual/fr/b/');
    await put('fr', 'b', '---\nid: {}\n---\n# Invalid');
    await expect.poll(async () => (await fetch(server.url + 'a/')).status, { timeout: 5000 }).toBe(500);
    await put('fr', 'b', page('first', 'Recovered'));
    await expect.poll(frenchAlternate, { timeout: 5000 }).toBe('https://docs.example/manual/fr/b/');
    await rm(join(root, 'docs/fr/b.md'));
    await expect.poll(frenchAlternate, { timeout: 5000 }).toBeUndefined();
    await put('fr', 'renamed', page('first', 'Added translation'));
    await expect.poll(frenchAlternate, { timeout: 5000 }).toBe('https://docs.example/manual/fr/renamed/');
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
}, 30_000);
