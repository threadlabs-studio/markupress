import { linkDependencies } from './fixture.js';
import { mkdtemp, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { buildSite, siteOptions } from '../src/site.js';
import { createApplication } from '@nextwebwg/htmlkit';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function write(root: string, file: string, text: string) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), text); }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'markupress-content-')); roots.push(root);
  await write(root, 'package.json', '{"type":"module"}');
  await write(root, 'docs/01.index.md', '# Welcome\n\n[Install](./01.guide/02.install.md)');
  await write(root, 'docs/01.guide/02.install.md', '---\ntitle: Installation\n---\n# Install\n\n![Mark](../mark.svg)');
  await write(root, 'docs/mark.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  return root;
}

it('routes Markdown pages through HTMLKit with version-local links and served assets', async () => {
  const root = await fixture(); await linkDependencies(root);
  const application = await createApplication(siteOptions({ root, base: '/manual/' }));
  try {
    expect(application.routes.map(route => route.pattern)).toEqual(expect.arrayContaining(['/v/current/', '/v/current/guide/install/', '/', '/guide/install/']));
    expect((await application.render('/manual/')).html).toContain('href="/manual/v/current/guide/install/"');
    expect((await application.render('/manual/v/current/guide/install/')).html).toMatch(/src="\/manual\/_htmlkit\/files\/[0-9a-f]{16}-mark\.svg"/);
    expect([...application.files.values()]).toEqual([await realpath(join(root, 'docs/mark.svg'))]);
  } finally { await application.close(); }
  // Markdown compiles in memory; nothing is written beside the content.
  await expect(stat(join(root, '.markupress'))).rejects.toThrow();
}, 30_000);

it('reports URL and logical identity collisions against both Markdown sources', async () => {
  const root = await fixture();
  await write(root, 'docs/02.index.md', '# Other');
  await expect(createApplication(siteOptions({ root }))).rejects.toThrow(/01\.index\.md.*02\.index\.md/s);
});

it('rejects missing local document links with the original source location', async () => {
  const root = await fixture();
  await write(root, 'docs/broken.md', '# Broken\n\n[Missing](missing.md)');
  await expect(createApplication(siteOptions({ root }))).rejects.toThrow(/broken\.md.*missing\.md/s);
});

it('builds a static site using the installed HTMLKit package and native navigation', async () => {
  const root = await fixture();
  // The disposable consumer resolves package resources from the installed dependency tree.
  await linkDependencies(root);
  await write(root, 'docs/01.guide/03.hidden.md', '---\nsidebarHidden: true\n---\n# Hidden document');
  const result = await buildSite({ root, base: '/manual/' });
  const page = await readFile(join(result.outDir, 'guide/install/index.html'), 'utf8');
  expect(page).toContain('<title>Installation</title>');
  expect(page).toContain('href="/manual/v/current/guide/install/"');
  expect(page).toContain('data-component="hk-nav"');
  expect(page).not.toContain('Hidden document');
  expect(await readFile(join(result.outDir, 'guide/hidden/index.html'), 'utf8')).toContain('Hidden document');
  expect((await readdir(join(result.outDir, '_htmlkit/files'))).some(name => name.endsWith('-mark.svg'))).toBe(true);
}, 30_000);

it('reports native carrier build errors against the original Markdown file', async () => {
  const root = await fixture(); await linkDependencies(root);
  await write(root, 'docs/broken.md', '<template component="broken-example"><p>First</p><p>Second</p></template>\n\n<broken-example></broken-example>');
  await expect(buildSite({ root })).rejects.toThrow(new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/docs/broken\\.md'));
}, 30_000);

it('switches an aliased URL using the document identity and marks its canonical navigation entry', async () => {
  const root = await fixture(); await linkDependencies(root);
  await write(root, 'docs/01.guide/02.install.md', '---\nid: install\naliases: [/start/]\n---\n# Install');
  const application = await createApplication(siteOptions({ root, versions: [{ id: 'current', directory: 'docs' }, { id: 'v1', directory: 'docs' }] }));
  try {
    const html = (await application.render('/v/current/start/')).html;
    expect(html).toContain('href="/v/v1/guide/install/"');
    expect(html).toContain('href="/v/current/guide/install/" aria-current="page"');
  } finally { await application.close(); }
});
