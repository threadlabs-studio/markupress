import { linkDependencies } from './fixture.js';
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { buildSite, prepareSite } from '../src/site.js';
import { createApplication } from '@nextwebwg/htmlkit';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function write(root: string, file: string, text: string) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), text); }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'markupress-content-')); roots.push(root);
  await write(root, 'package.json', '{"type":"module"}');
  await write(root, 'docs/01-index.md', '# Welcome\n\n[Install](./01-guide/02-install.md)');
  await write(root, 'docs/01-guide/02-install.md', '---\ntitle: Installation\n---\n# Install\n\n![Mark](../mark.svg)');
  await write(root, 'docs/mark.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  return root;
}

it('prepares ordered in-memory HTMLKit routes, original-source assets, and version-local document links', async () => {
  const root = await fixture();
  const prepared = await prepareSite({ root, base: '/manual/' });
  const generated = await prepared.application.generate!();
  // Each Markdown file is its own page component; nothing is written beside the content.
  expect(generated.files?.get(join(root, 'docs/01-index.md'))).toContain('href="/manual/v/current/guide/install/"');
  expect(generated.files?.get(join(root, 'docs/01-guide/02-install.md'))).toContain('/manual/_markupress/assets/');
  expect([...generated.publicFiles!.values()]).toEqual([join(root, 'docs/mark.svg')]);
  expect(prepared.documents.map(doc => doc.id).sort()).toEqual(['guide/install', 'index']);
  expect(generated.routes?.map(route => route.pattern)).toContain('/guide/install/');
  expect(generated.routes?.find(route => route.pattern === '/v/current/guide/install/')?.order).toEqual([null, null, '01', '02']);
  await expect(stat(join(root, '.markupress'))).rejects.toThrow();
});

it('reports URL and logical identity collisions against both Markdown sources', async () => {
  const root = await fixture();
  await write(root, 'docs/02-index.md', '# Other');
  await expect(prepareSite({ root })).rejects.toThrow(/01-index\.md.*02-index\.md/s);
});

it('rejects missing local document links with the original source location', async () => {
  const root = await fixture();
  await write(root, 'docs/broken.md', '# Broken\n\n[Missing](missing.md)');
  await expect(prepareSite({ root })).rejects.toThrow(/broken\.md.*missing\.md/s);
});

it('builds a static site using the installed HTMLKit package and native navigation', async () => {
  const root = await fixture();
  // The disposable consumer resolves package resources from the installed dependency tree.
  await linkDependencies(root);
  await write(root, 'docs/01-guide/03-hidden.md', '---\nsidebarHidden: true\n---\n# Hidden document');
  const result = await buildSite({ root, base: '/manual/' });
  const page = await readFile(join(result.outDir, 'guide/install/index.html'), 'utf8');
  expect(page).toContain('<title>Installation</title>');
  expect(page).toContain('href="/manual/v/current/guide/install/"');
  expect(page).toContain('data-component="htmlkit-navigation"');
  expect(page).not.toContain('Hidden document');
  expect(await readFile(join(result.outDir, 'guide/hidden/index.html'), 'utf8')).toContain('Hidden document');
  expect((await readdir(join(result.outDir, '_markupress/assets'))).some(name => name.endsWith('-mark.svg'))).toBe(true);
}, 30_000);

it('reports native carrier build errors against the original Markdown file', async () => {
  const root = await fixture(); await linkDependencies(root);
  await write(root, 'docs/broken.md', '<template component="broken-example"><p>First</p><p>Second</p></template>\n\n<broken-example></broken-example>');
  await expect(buildSite({ root })).rejects.toThrow(new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/docs/broken\\.md'));
}, 30_000);

it('switches an aliased URL using the document identity and marks its canonical navigation entry', async () => {
  const root = await fixture(); await linkDependencies(root);
  await write(root, 'docs/01-guide/02-install.md', '---\nid: install\naliases: [/start/]\n---\n# Install');
  const prepared = await prepareSite({ root, versions: [{ id: 'current', directory: 'docs' }, { id: 'v1', directory: 'docs' }] });
  const application = await createApplication(prepared.application);
  try {
    const html = (await application.render('/v/current/start/')).html;
    expect(html).toContain('href="/v/v1/guide/install/"');
    expect(html).toContain('href="/v/current/guide/install/" aria-current="page"');
  } finally { await application.close(); }
});
