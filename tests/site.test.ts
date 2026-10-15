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

it('renders shared blocks with the Looma components the page links', async () => {
  const root = await fixture(); await linkDependencies(root);
  await write(root, 'docs/blocks.md', '# Blocks\n\n::: warning Breaking {x}\nBack up {first}.\n:::\n\n> [!TIP]\n> Alerts too.\n\n::: details More\nHidden\n:::\n\n::: code-group\n```sh title="pnpm"\npnpm add x\n```\n\n```sh title="npm"\nnpm install x\n```\n:::');
  const application = await createApplication(siteOptions({ root }));
  try {
    const html = (await application.render('/blocks/')).html.replace(/<!--[^>]*-->|<\?[^>]*\?>/g, '');
    expect(html).toMatch(/<div role="note" data-component="ui-callout"[^>]* data-tone="warning"[^>]*>.*?<strong class="heading">Breaking \{x\}<\/strong><p data-slotted="">Back up \{first\}\.<\/p>/s);
    expect(html).toMatch(/data-component="ui-callout"[^>]* data-tone="tip"[^>]*>.*?<p data-slotted="">Alerts too\.<\/p>/s);
    expect(html).toContain('<details><summary>More</summary>');
    // Without JavaScript every panel shows; Tabs adds its tab list and hides the others when it connects.
    expect(html).toMatch(/data-component="ui-tabs"[^>]* data-group="code-group".*<section aria-label="pnpm" data-slotted="">.*<section aria-label="npm" data-slotted="">/s);
  } finally { await application.close(); }
}, 30_000);

it('passes the lineNumbers default through to Markdown pages', async () => {
  const root = await fixture(); await linkDependencies(root);
  await write(root, 'docs/code.md', '# Code\n\n```ts\nconst a = 1;\n```\n\n```ts :no-line-numbers\nconst b = 2;\n```');
  const application = await createApplication(siteOptions({ root, lineNumbers: true }));
  try {
    expect([...(await application.render('/code/')).html.matchAll(/<pre class="([^"]*)"/g)].map(match => match[1]!.includes('line-numbers'))).toEqual([true, false]);
  } finally { await application.close(); }
}, 30_000);

it('renders front matter head metadata, a named HTMLKit layout, and no layout', async () => {
  const root = await fixture(); await linkDependencies(root);
  await write(root, 'docs/seo.md', '---\ndescription: Search engines.\nhead:\n  og: { title: SEO }\n  canonical: https://example.com/seo/\n---\n# SEO');
  await write(root, 'docs/bare.md', '---\nlayout: false\n---\n# Bare');
  await write(root, 'docs/wide.md', '---\nlayout: wide\n---\n# Wide');
  await write(root, 'app/layouts/wide.html', '<template component="wide-layout"><div class="wide"><slot name="page"></slot></div></template>');
  const application = await createApplication(siteOptions({ root }));
  try {
    const seo = await application.render('/seo/');
    const head = /<head>.*<\/head>/s.exec(seo.html)![0];
    for (const element of ['<meta name="description" content="Search engines.">', '<meta property="og:title" content="SEO">', '<link rel="canonical" href="https://example.com/seo/">']) expect(head).toContain(element);
    const bare = (await application.render('/bare/')).html;
    expect(bare).toContain('Bare');
    expect(bare).not.toContain('data-component="markupress-shell"');
    const wide = (await application.render('/wide/')).html;
    expect(wide).toContain('class="wide"');
    expect(wide).not.toContain('data-component="markupress-shell"');
  } finally { await application.close(); }
}, 30_000);

it('replaces the shell with a site layout that receives the loader data it declares', async () => {
  const root = await fixture(); await linkDependencies(root);
  await write(root, 'docs/01.guide/02.install.md', '---\ntitle: Installation\neditLink: https://example.com/edit/install.md\n---\n# Install\n\n## Requirements\n\n### Node');
  await write(root, 'theme/layout.html', `<template component="site-layout"><defs>
<prop name="navigation" type="list(object({ href: string, label: string, current: string, ... }))" required>Links</prop>
<prop name="crumbs" type="list(object({ href: string, label: string, ... }))" required>Trail</prop>
<prop name="previous" type="object({ href: string, label: string, ... })" nullable>Before</prop>
<prop name="outline" type="list(object({ href: string, label: string, depth: number, ... }))" required>Headings</prop>
<prop name="page" type="object({ title: string, editLink?: string, ... })" required>Front matter</prop></defs>
<div class="layout"><header class="site">{$page.title}</header><nav><a $each="item of $navigation" from:href="$item.href">{$item.label}</a></nav>
<ol class="crumbs"><li $each="crumb of $crumbs">{$crumb.label}</li></ol>
<ul class="outline"><li $each="heading of $outline" from:data-depth="$heading.depth"><a from:href="$heading.href">{$heading.label}</a></li></ul>
<a class="edit" from:href="$page.editLink">Edit</a><a class="previous" $if="$previous" from:href="$previous.href">{$previous.label}</a>
<main><slot name="page"></slot></main></div></template>`);
  // A folder layout nests inside the site layout, and its loader reads all of Markupress's data.
  await write(root, 'docs/01.guide/_layout.html', '<template component="guide-layout"><defs><prop name="section" type="string" required>Section</prop></defs><section class="guide" from:data-pages="$section"><slot name="page"></slot></section></template>');
  await write(root, 'docs/01.guide/_layout.server.js', 'export function load({ parent }) { return { props: { section: String(parent.markupress.navigation.length) } }; }');
  const application = await createApplication(siteOptions({ root, layout: 'theme/layout.html' }));
  try {
    const html = (await application.render('/guide/install/')).html.replace(/<!--[^>]*-->/g, '');
    expect(html).not.toContain('data-component="markupress-shell"');
    expect(html).toContain('<header class="site">Installation</header>');
    expect(html).toContain('href="/v/current/guide/install/"');
    expect(html).toMatch(/<ol class="crumbs">.*Welcome.*Installation.*<\/ol>/s);
    expect(html).toMatch(/<li data-depth="2"><a href="#requirements">Requirements<\/a><\/li><li data-depth="3"><a href="#node">Node<\/a><\/li>/);
    expect(html).toContain('<a class="edit" href="https://example.com/edit/install.md">Edit</a>');
    expect(html).toMatch(/<a class="previous" href="\/v\/current\/">Welcome<\/a>/);
    expect(html).toMatch(/<section class="guide"[^>]* data-pages="2"[^>]*>.*Install/s);
  } finally { await application.close(); }
}, 30_000);
