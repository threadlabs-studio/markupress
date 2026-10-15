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

it('maps front matter onto HTMLKit page metadata and head, and keeps the rest as page data', async () => {
  const compiled = await compileMarkdown(`---
title: Guide
layout: wide
toc: [2, 4]
editLink: https://example.com/edit/guide.md
head:
  meta: { keywords: "docs, html" }
  og: { image: https://example.com/social.png, image:width: 1200 }
  canonical: https://example.com/guide/
---
# Guide

## Install

### Options

#### Flags

##### Deep
`, { file: '/docs/guide.md', pageName: 'page-guide' });
  expect(compiled.resource).toContain('<meta name="hk:layout" content="wide">');
  expect(compiled.resource).toContain('<meta name="keywords" content="docs, html">');
  expect(compiled.resource).toContain('<meta property="og:image" content="https://example.com/social.png"><meta property="og:image:width" content="1200">');
  expect(compiled.resource).toContain('<link rel="canonical" href="https://example.com/guide/">');
  expect(compiled.outline).toEqual([{ id: 'install', href: '#install', label: 'Install', depth: 2 },
    { id: 'options', href: '#options', label: 'Options', depth: 3 }, { id: 'flags', href: '#flags', label: 'Flags', depth: 4 }]);
  expect(compiled.frontmatter.editLink).toBe('https://example.com/edit/guide.md');
  const plain = await compileMarkdown('---\nlayout: false\ntoc: false\neditLink: false\n---\n# Plain\n\n## Section', { file: '/docs/plain.md', pageName: 'page-plain' });
  expect(plain.resource).toContain('<meta name="hk:layout" content="none">');
  expect(plain.outline).toEqual([]);
  expect((await compileMarkdown('# Default\n\n## Two\n\n### Three\n\n#### Four', { file: '/docs/default.md', pageName: 'page-default' })).outline.map(item => item.depth)).toEqual([2, 3]);
});

it('rejects unknown and mistyped front matter fields with the Markdown file', async () => {
  const page = (yaml: string) => compileMarkdown(`---\n${yaml}\n---\n# Page`, { file: '/docs/01.page.md', pageName: 'page-example' });
  await expect(page('sidebar_label: Start')).rejects.toThrow(/01\.page\.md: unknown front matter field sidebar_label\. Fields are title, .*sidebarLabel/);
  await expect(page('sidebarHidden: yes please')).rejects.toThrow('/docs/01.page.md: front matter sidebarHidden must be a boolean.');
  await expect(page('toc: [3, 2]')).rejects.toThrow('front matter toc must be false or a heading range such as [2, 3].');
  await expect(page('toc: true')).rejects.toThrow('front matter toc must be');
  await expect(page('head: { script: x }')).rejects.toThrow('front matter head must be a mapping of meta, og and canonical.');
  await expect(page('head: { og: { image: [a, b] } }')).rejects.toThrow('front matter head must be');
  await expect(page('editLink: true')).rejects.toThrow('front matter editLink must be a URL or false.');
  await expect(page('layout: ""')).rejects.toThrow('front matter layout must be an HTMLKit layout name or false.');
  await expect(page('aliases: /start/')).rejects.toThrow('front matter aliases must be a list of route paths.');
  await expect(page('sidebarPosition: 1.5')).rejects.toThrow('/docs/01.page.md: front matter sidebarPosition must be a whole number.');
});

it('orders a page with sidebarPosition, and takes default front matter that its own fields override', async () => {
  const ordered = await compileMarkdown('---\nsidebarPosition: 3\n---\n# Page', { file: '/docs/page.md', pageName: 'page-ordered' });
  expect(ordered.resource).toContain('<meta name="hk:order" content="3">');
  const index = await compileMarkdown('---\nsidebarPosition: 1\n---\n# Forms', { file: '/docs/forms/index.md', pageName: 'page-forms', frontmatter: { sidebarLabel: 'Form controls', sidebarPosition: 4 } });
  expect(index.resource).toContain('<meta name="hk:label" content="Form controls"><meta name="hk:order" content="1">');
  expect(index.frontmatter).toEqual({ sidebarLabel: 'Form controls', sidebarPosition: 1 });
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
  expect(resource).toMatch(/<ui-tabs class="code-group" group="code-group">\n<section aria-label="pnpm">\n<figure class="code"><div class="code-actions"[^>]*>.*?<\/div><pre class="shiki[^"]*"[^>]*><code class="language-sh">.*?<\/figure>\n<\/section>\n<section aria-label="npm">\n<figure class="code"><div/s);
  expect(resource).toMatch(/<section aria-label="Shell">\n<figure class="code"><figcaption>install\.sh<\/figcaption><div class="code-actions"/);
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
  expect(compiled.resource).toMatch(/<figure class="code"><figcaption>app\/pages\/index\.ts<\/figcaption><div class="code-actions"[^>]*>.*?<\/div><pre class="shiki [^"]*"[^>]*><code class="language-ts">/);
  expect(compiled.resource.match(/<figcaption/g)).toHaveLength(1);
  // Both themes' colors are on each token; light-dark() picks one from the page's color-scheme.
  expect(compiled.resource).toMatch(/<span style="color:light-dark\(#[0-9A-Fa-f]+, #[0-9A-Fa-f]+\);--shiki-light:#[0-9A-Fa-f]+;--shiki-dark:#[0-9A-Fa-f]+">const<\/span>/);
  const html = /<pre[^>]*><code class="language-html">.*?<\/code><\/pre>/s.exec(compiled.resource)![0];
  expect(html).not.toMatch(/(?<!\\)\{/);
  expect(text(parseFragment(html))).toBe('<output>\\{$count}</output>');
});

it('leaves languages Shiki does not know as escaped plain text', async () => {
  const compiled = await compileMarkdown('```not-a-language\n<b>{x}</b>\n```', { file: '/docs/index.md', pageName: 'page-index' });
  expect(compiled.resource).toContain('<pre><code class="language-not-a-language">&lt;b&gt;\\{x}&lt;/b&gt;</code></pre></figure>');
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
  expect(compiled.resource.replaceAll(/<div class="code-actions".*?<\/div>/g, '')).toContain('<ui-callout tone="note">\n<figure class="code"><pre><code>:::</code></pre></figure>\n<figure class="code"><pre><code>:::</code></pre></figure>\n<p>After the fences.</p>\n</ui-callout>');
});

it('gives a fence with only a title no language class', async () => {
  const compiled = await compileMarkdown('```title="notes.txt"\nplain\n```', { file: '/docs/index.md', pageName: 'page-index' });
  expect(compiled.resource).toContain('<figure class="code"><figcaption>notes.txt</figcaption><div class="code-actions" hidden="" aria-live="polite"><button type="button" data-code-action="wrap" aria-pressed="false">Wrap</button><button type="button" data-code-action="copy">Copy</button></div><pre><code>plain</code></pre></figure>');
});

it('imports given stylesheets into the page component itself', async () => {
  const compiled = await compileMarkdown('# Styled', { file: '/docs/index.md', pageName: 'page-index', styles: ['/theme/prose.css'] });
  expect(compiled.resource).toMatch(/<template component="page-index">.*<style>@import "file:\/\/\/theme\/prose\.css";<\/style><\/template>/s);
  expect((await compileMarkdown('# Plain', { file: '/docs/index.md', pageName: 'page-index' })).resource).not.toContain('<style>');
});

const lines = (resource: string) => [...resource.matchAll(/<span class="line( highlighted)?">(.*?)<\/span>(?=\n|<\/code>)/g)]
  .map(match => `${match[1] ? '+' : ' '}${text(parseFragment(match[2]!))}`);

it('highlights lines from fence meta and [!code highlight] comments at build time', async () => {
  expect(lines(await page('```ts {1,3-4}\nconst a = 1;\nconst b = 2;\nconst c = 3;\nconst d = {x};\nconst e = 5;\n```'))).toEqual([
    '+const a = 1;', ' const b = 2;', '+const c = 3;', '+const d = \\{x};', ' const e = 5;']);
  expect(lines(await page('```ts{2}\nconst a = 1;\nconst b = 2; // [!code highlight]\n// [!code highlight:2]\nconst c = 3;\nconst d = 4;\nconst e = 5;\n```'))).toEqual([
    ' const a = 1;', '+const b = 2;', '+const c = 3;', '+const d = 4;', ' const e = 5;']);
  expect(lines(await page('```sh\nnpm install # [!code highlight]\nnpm test\n```\n\n```html\n<p>One</p> <!-- [!code highlight] -->\n```'))).toEqual(['+npm install', ' npm test', '+<p>One</p>']);
  // Plain text takes line features without a grammar; an unknown language stays escaped text.
  expect(lines(await page('```text {2}\nfirst\nsecond\n```'))).toEqual([' first', '+second']);
  expect(await page('```not-a-language {1}\nraw // [!code highlight]\n```')).toContain('<pre><code class="language-not-a-language">raw // [!code highlight]</code></pre>');
});

it('numbers lines from fence meta or the lineNumbers default', async () => {
  const numbered = (source: string, lineNumbers?: boolean) => compileMarkdown(source, { file: '/docs/index.md', pageName: 'page-index', ...(lineNumbers === undefined ? {} : { lineNumbers }) })
    .then(compiled => [...compiled.resource.matchAll(/<pre class="([^"]*)"/g)].map(match => match[1]!.split(' ').includes('line-numbers')));
  const fences = '```ts\na\n```\n\n```ts :line-numbers\nb\n```\n\n```ts:no-line-numbers title="c.ts"\nc\n```';
  expect(await numbered(fences)).toEqual([false, true, false]);
  expect(await numbered(fences, true)).toEqual([true, true, false]);
});

it('gives each code block hidden copy and wrap buttons, and a page with code its code controller', async () => {
  const resource = await page('# Code\n\n```js\nlet a = 1;\n```');
  expect(resource).toContain('<template component="page-index" controller="markupress/controllers/code.js">');
  expect(resource).toMatch(/<figure class="code"><div class="code-actions" hidden="" aria-live="polite"><button type="button" data-code-action="wrap" aria-pressed="false">Wrap<\/button><button type="button" data-code-action="copy">Copy<\/button><\/div><pre class="shiki/);
  expect(await page('# Prose only\n\n`inline` code')).not.toContain('controller=');
});
