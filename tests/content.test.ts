import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { expect, it } from 'vitest';
import { compileMarkdown } from '../src/content.js';

/** Text as a reader sees it, through template contents and highlighting spans. */
const text = (node: DefaultTreeAdapterMap['node']): string => 'value' in node ? node.value
  : ['content' in node ? [node.content] : [], 'childNodes' in node ? node.childNodes : []].flat().map(text).join('');

it('compiles owned metadata, stable anchors, literal fences, and native resources', async () => {
  const compiled = await compileMarkdown(`---
title: Products
description: Manage products.
sidebarLabel: Catalog
---
# Products

Text {notAnExpression}.

\`\`\`html
<link rel="component" href="absent.html">
<template component="fake-page"><p $value="bad">{bad}</p></template>
\`\`\`

<link rel="component" href="./counter.html">

<demo-counter></demo-counter>

## Products
`, { file: '/project/docs/01.products.md', pageName: 'page-products' });
  expect(compiled.title).toBe('Products');
  expect(compiled.label).toBe('Catalog');
  expect(compiled.resource).toContain('<title>Products</title>');
  expect(compiled.resource).toContain('<meta name="description" content="Manage products.">');
  expect(compiled.resource.indexOf('<title>')).toBeGreaterThan(compiled.resource.indexOf('<template component="page-products">'));
  expect(compiled.resource).toContain('id="products-1"');
  expect(compiled.resource).toContain('href="file:///project/docs/counter.html"');
  expect(compiled.resource).toContain('<demo-counter>');
  expect(compiled.resource).toContain('\\{notAnExpression}');
  expect(text(parseFragment(compiled.resource))).toContain('<template component="fake-page"><p $value="bad">\\{bad}</p></template>');
  expect(compiled.resource).not.toContain('<template component="fake-page">');
});

it('preserves authored component expressions and emitted controller module spelling', async () => {
  const compiled = await compileMarkdown(`<template component="helper-counter" controller="./counter.js"><defs><state name="count" type="number" value="0"></state></defs><output>{$count}</output></template>

<helper-counter></helper-counter>`, { file: '/project/docs/example.md', pageName: 'page-example' });
  expect(compiled.resource).toContain('controller="file:///project/docs/counter.js"');
  // Braces inside a component carrier stay expressions; only Markdown prose escapes them.
  expect(compiled.resource).toContain('<output>{$count}</output>');
  expect(compiled.resource).toContain('<meta name="hk:page" content="page-example">');
});

it('keeps native carrier CSS and text expressions opaque to Markdown', async () => {
  const compiled = await compileMarkdown('<template component="inline-example"><p>{$count}</p><style>:host { color: teal; }</style></template>\n\n<inline-example></inline-example>', { file: '/project/demo.md', pageName: 'page-example' });
  expect(compiled.resource).toContain('<p>{$count}</p>');
  expect(compiled.resource).toContain(':host { color: teal; }');
});

it('resolves literal assets inside authored carriers while retaining dynamic attribute bindings', async () => {
  const compiled = await compileMarkdown('<template component="inline-image"><div><img src="./image.svg"><img from:src="$image"></div></template>', {
    file: '/project/demo.md', pageName: 'page-example', resolveLink: href => '/assets/' + href.replace('./', ''),
  });
  expect(compiled.resource).toContain('src="/assets/image.svg"');
  expect(compiled.resource).toContain('from:src="$image"');
});

it('reports duplicate frontmatter keys against the Markdown source', async () => {
  await expect(compileMarkdown('---\ntitle: One\ntitle: Two\n---\n# Page', { file: '/docs/page.md', pageName: 'page-example' })).rejects.toThrow(/page\.md.*unique/i);
});

it('derives titles and anchors from visible heading text rather than Markdown link syntax', async () => {
  const compiled = await compileMarkdown('# Install [**package**](./install.md) &amp; `run()`', { file: '/docs/index.md', pageName: 'page-index' });
  expect(compiled.title).toBe('Install package & run()');
  expect(compiled.resource).toContain('id="install-package-run"');
  expect(compiled.resource).toContain('<title>Install package &amp; run()</title>');
});

it('retains indented component examples as literal Markdown code', async () => {
  const compiled = await compileMarkdown('    <template component="fake-indented"><p>{count}</p></template>', { file: '/docs/index.md', pageName: 'page-index' });
  expect(compiled.resource).toContain('<pre><code>&lt;template');
  expect(compiled.resource).not.toContain('<template component="fake-indented">');
});

it('takes a heading id from a trailing {#id} marker and still suffixes duplicates', async () => {
  const compiled = await compileMarkdown('# Getting started {#start}\n\n## Install {#setup}\n\n## Configure {#setup}\n\n## Escaped \\{#kept}', { file: '/docs/index.md', pageName: 'page-index' });
  expect(compiled.title).toBe('Getting started');
  expect(compiled.resource).toContain('<h1 id="start"><a href="#start">Getting started</a></h1>');
  expect(compiled.resource).toContain('<h2 id="setup"><a href="#setup">Install</a></h2>');
  expect(compiled.resource).toContain('<h2 id="setup-1"><a href="#setup-1">Configure</a></h2>');
  expect(compiled.resource).toContain('<h2 id="escaped-kept"><a href="#escaped-kept">Escaped \\{#kept}</a></h2>');
});

const page = (source: string) => compileMarkdown(source, { file: '/docs/index.md', pageName: 'page-index' }).then(compiled => compiled.resource);
const callout = '<link rel="component" href="@threadlabs/looma/components/ui-callout/ui-callout.html">';
const tabs = '<link rel="component" href="@threadlabs/looma/components/ui-tabs/ui-tabs.html">';

it('renders callout containers as Looma callouts with every shared tone and a literal heading', async () => {
  const resource = await page('::: note\nA\n:::\n\n::: TIP Use **this**\nB\n:::\n\n::: info\n:::\n\n::: important\n:::\n\n::: warning Breaking {x} "y"\nC {z}\n:::\n\n::: danger\n:::\n\n::: Caution\n:::');
  expect(resource).toContain('<ui-callout tone="note">\n<p>A</p>\n</ui-callout>');
  expect(resource).toContain('<ui-callout tone="tip" heading="Use **this**">\n<p>B</p>\n</ui-callout>');
  expect(resource).toContain('<ui-callout tone="warning" heading="Breaking {x} &quot;y&quot;">\n<p>C \\{z}</p>\n</ui-callout>');
  expect([...resource.matchAll(/<ui-callout tone="([^"]+)"/g)].map(match => match[1])).toEqual(['note', 'tip', 'info', 'important', 'warning', 'danger', 'danger']);
  // The page links the callout component once, and only the components its blocks use.
  expect(resource.split(callout)).toHaveLength(2);
  expect(resource.indexOf(callout)).toBeLessThan(resource.indexOf('<template component="page-index">'));
  expect(resource).not.toContain(tabs);
  expect(await page('# Plain')).not.toContain('<link rel="component"');
});

it('renders GitHub alerts as untitled callouts, with CAUTION as danger', async () => {
  const resource = await page('> [!NOTE]\n> Alerts **work**\n\n> [!caution]\n> Careful\n\n> [!WARNING]  \n> One\n> Two\n\n> [!NOTE] on one line\n\n> [!OTHER]\n> Quote');
  expect(resource).toContain('<ui-callout tone="note">\n<p>Alerts <strong>work</strong></p>\n</ui-callout>');
  expect(resource).toContain('<ui-callout tone="danger">\n<p>Careful</p>\n</ui-callout>');
  expect(resource).toContain('<ui-callout tone="warning">\n<p>One\nTwo</p>\n</ui-callout>');
  expect(resource).toContain('<blockquote>\n<p>[!NOTE] on one line</p>\n</blockquote>');
  expect(resource).toContain('<blockquote>\n<p>[!OTHER]\nQuote</p>\n</blockquote>');
  expect(resource).toContain(callout);
});

it('renders details containers as native details, open on request, nesting with longer markers', async () => {
  const resource = await page(':::: details\nOuter **text**\n\n::: tip\nInner {literal}\n:::\n::::\n\n::: details Show <b>{more}</b> {open}\nShown\n:::\n\n::: unknown\nStays text\n:::\n\n::: 1bad\nStays text\n:::');
  expect(resource).toContain('<details><summary>Details</summary>\n<p>Outer <strong>text</strong></p>\n<ui-callout tone="tip">\n<p>Inner \\{literal}</p>\n</ui-callout>\n</details>');
  expect(resource).toContain('<details open=""><summary>Show &lt;b&gt;\\{more}&lt;/b&gt;</summary>\n<p>Shown</p>\n</details>');
  expect(resource).toContain('<p>::: unknown\nStays text\n:::</p>');
  expect(resource).toContain('<p>::: 1bad\nStays text\n:::</p>');
});

it('renders tabs and code groups as grouped Looma tabs with labelled panels', async () => {
  const resource = await page('::: tabs\n== Examples\nSee **this**\n\n== API {x}\n> == quoted\n:::\n\n::: tabs package-manager\n== pnpm\nA\n:::\n\n::: code-group\n```sh title="pnpm"\npnpm add x\n```\n\n```sh title="npm"\nnpm install x\n```\n:::\n\n::: code-group\n== Shell\n```sh title="install.sh"\nnpm install x\n```\n:::');
  expect(resource).toContain('<ui-tabs group="tabs">\n<section aria-label="Examples">\n<p>See <strong>this</strong></p>\n</section>\n<section aria-label="API {x}">\n<blockquote>\n<p>== quoted</p>\n</blockquote>\n</section>\n</ui-tabs>');
  expect(resource).toContain('<ui-tabs group="package-manager">\n<section aria-label="pnpm">\n<p>A</p>\n</section>\n</ui-tabs>');
  // A fence title labels its code group panel instead of captioning the code; under an "== Label" it stays a caption.
  expect(resource).toMatch(/<ui-tabs class="code-group" group="code-group">\n<section aria-label="pnpm">\n<pre class="shiki[^"]*"[^>]*><code class="language-sh">.*?<\/pre>\n<\/section>\n<section aria-label="npm">\n<pre/s);
  expect(resource).toMatch(/<section aria-label="Shell">\n<figure class="code"><figcaption>install\.sh<\/figcaption><pre/);
  expect(resource).not.toContain('<figcaption>pnpm');
  expect(resource).toContain(tabs);
  expect(resource).not.toContain(callout);
  await expect(page('::: tabs\nIntro\n== One\n:::')).rejects.toThrow(/index\.md: tabs content starts with an "== Label" line/);
  await expect(page('::: code-group\nIntro\n\n```sh\nx\n```\n:::')).rejects.toThrow(/index\.md: a code group holds fences/);
  // Outside tabs, "== text" is a paragraph.
  expect(await page('== Not a tab')).toContain('<p>== Not a tab</p>');
});

it('highlights fenced code at build time, with an optional title and literal braces', async () => {
  const compiled = await compileMarkdown('```ts title="app/pages/index.ts"\nconst count = 1;\n```\n\n```html\n<output>{$count}</output>\n```', { file: '/docs/index.md', pageName: 'page-index' });
  expect(compiled.resource).toMatch(/<figure class="code"><figcaption>app\/pages\/index\.ts<\/figcaption><pre class="shiki [^"]*"[^>]*><code class="language-ts">/);
  expect(compiled.resource.match(/<figure/g)).toHaveLength(1);
  // Both themes' colors are on each token; light-dark() picks one from the page's color-scheme.
  expect(compiled.resource).toMatch(/<span style="color:light-dark\(#[0-9A-Fa-f]+, #[0-9A-Fa-f]+\);--shiki-light:#[0-9A-Fa-f]+;--shiki-dark:#[0-9A-Fa-f]+">const<\/span>/);
  const html = /<pre[^>]*><code class="language-html">.*?<\/code><\/pre>/s.exec(compiled.resource)![0];
  expect(html).not.toMatch(/(?<!\\)\{/);
  expect(text(parseFragment(html))).toBe('<output>\\{$count}</output>');
});

it('leaves languages Shiki does not know as escaped plain text', async () => {
  const compiled = await compileMarkdown('```not-a-language\n<b>{x}</b>\n```', { file: '/docs/index.md', pageName: 'page-index' });
  expect(compiled.resource).toContain('<pre><code class="language-not-a-language">&lt;b&gt;\\{x}&lt;/b&gt;</code></pre>');
});

const headingIds = async (source: string) => [...(await compileMarkdown(source, { file: '/docs/index.md', pageName: 'page-index' })).resource.matchAll(/<h\d id="([^"]*)"/g)].map(match => match[1]);

it('skips custom heading ids when suffixing a generated duplicate', async () => {
  expect(await headingIds('## X {#a-1}\n\n## A\n\n## A')).toEqual(['a-1', 'a', 'a-2']);
});

it('keeps a custom heading id and suffixes the earlier generated id instead', async () => {
  expect(await headingIds('## Foo\n\n## Bar {#foo}')).toEqual(['foo-1', 'foo']);
});

it('never repeats a suffixed heading id that another heading generates', async () => {
  expect(await headingIds('## Dup\n\n## Dup\n\n## Dup 1')).toEqual(['dup', 'dup-1', 'dup-1-1']);
});

it('does not close a container on a marker line inside fenced code', async () => {
  const compiled = await compileMarkdown('::: note\n```\n:::\n```\n\n~~~~\n:::\n~~~~\nAfter the fences.\n:::', { file: '/docs/index.md', pageName: 'page-index' });
  expect(compiled.resource).toContain('<ui-callout tone="note">\n<pre><code>:::</code></pre>\n<pre><code>:::</code></pre>\n<p>After the fences.</p>\n</ui-callout>');
});

it('gives a fence with only a title no language class', async () => {
  const compiled = await compileMarkdown('```title="notes.txt"\nplain\n```', { file: '/docs/index.md', pageName: 'page-index' });
  expect(compiled.resource).toContain('<figure class="code"><figcaption>notes.txt</figcaption><pre><code>plain</code></pre></figure>');
});

it('imports given stylesheets into the page component itself', async () => {
  const compiled = await compileMarkdown('# Styled', { file: '/docs/index.md', pageName: 'page-index', styles: ['/theme/prose.css'] });
  expect(compiled.resource).toMatch(/<template component="page-index">.*<style>@import "file:\/\/\/theme\/prose\.css";<\/style><\/template>/s);
  expect((await compileMarkdown('# Plain', { file: '/docs/index.md', pageName: 'page-index' })).resource).not.toContain('<style>');
});
