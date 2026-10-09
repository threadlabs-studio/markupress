import { expect, it } from 'vitest';
import { compileMarkdown } from '../src/content.js';

it('compiles owned metadata, stable anchors, literal fences, and native resources', () => {
  const compiled = compileMarkdown(`---
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
  expect(compiled.resource).toContain('&lt;template');
  expect(compiled.resource).not.toContain('<template component="fake-page">');
});

it('preserves authored component expressions and emitted controller module spelling', () => {
  const compiled = compileMarkdown(`<template component="helper-counter" controller="./counter.js"><defs><state name="count" type="number" value="0"></state></defs><output>{$count}</output></template>

<helper-counter></helper-counter>`, { file: '/project/docs/example.md', pageName: 'page-example' });
  expect(compiled.resource).toContain('controller="file:///project/docs/counter.js"');
  // Braces inside a component carrier stay expressions; only Markdown prose escapes them.
  expect(compiled.resource).toContain('<output>{$count}</output>');
  expect(compiled.resource).toContain('<meta name="hk:page" content="page-example">');
});

it('keeps native carrier CSS and text expressions opaque to Markdown', () => {
  const compiled = compileMarkdown('<template component="inline-example"><p>{$count}</p><style>:host { color: teal; }</style></template>\n\n<inline-example></inline-example>', { file: '/project/demo.md', pageName: 'page-example' });
  expect(compiled.resource).toContain('<p>{$count}</p>');
  expect(compiled.resource).toContain(':host { color: teal; }');
});

it('resolves literal assets inside authored carriers while retaining dynamic attribute bindings', () => {
  const compiled = compileMarkdown('<template component="inline-image"><div><img src="./image.svg"><img from:src="$image"></div></template>', {
    file: '/project/demo.md', pageName: 'page-example', resolveLink: href => '/assets/' + href.replace('./', ''),
  });
  expect(compiled.resource).toContain('src="/assets/image.svg"');
  expect(compiled.resource).toContain('from:src="$image"');
});

it('reports duplicate frontmatter keys against the Markdown source', () => {
  expect(() => compileMarkdown('---\ntitle: One\ntitle: Two\n---\n# Page', { file: '/docs/page.md', pageName: 'page-example' })).toThrow(/page\.md.*unique/i);
});

it('derives titles and anchors from visible heading text rather than Markdown link syntax', () => {
  const compiled = compileMarkdown('# Install [**package**](./install.md) &amp; `run()`', { file: '/docs/index.md', pageName: 'page-index' });
  expect(compiled.title).toBe('Install package & run()');
  expect(compiled.resource).toContain('id="install-package-run"');
  expect(compiled.resource).toContain('<title>Install package &amp; run()</title>');
});

it('retains indented component examples as literal Markdown code', () => {
  const compiled = compileMarkdown('    <template component="fake-indented"><p>{count}</p></template>', { file: '/docs/index.md', pageName: 'page-index' });
  expect(compiled.resource).toContain('<pre><code>&lt;template');
  expect(compiled.resource).not.toContain('<template component="fake-indented">');
});
