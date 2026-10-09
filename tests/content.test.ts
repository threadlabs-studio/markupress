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

it('wraps ::: containers in classed elements, nesting with longer markers', async () => {
  const compiled = await compileMarkdown(':::: details\nOuter **text**\n\n::: warning\nInner {literal}\n:::\n::::\n\n::: 1bad\nStays text\n:::', { file: '/docs/index.md', pageName: 'page-index' });
  expect(compiled.resource).toContain('<div class="details">\n<p>Outer <strong>text</strong></p>\n<div class="warning">\n<p>Inner \\{literal}</p>\n</div>\n</div>');
  expect(compiled.resource).toContain('<p>::: 1bad\nStays text\n:::</p>');
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
