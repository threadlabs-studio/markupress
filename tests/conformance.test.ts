import { expect, it } from 'vitest';
import { compileMarkdown } from '../src/content.js';

// Expressive Markdown (https://nextwebwg.org/expressive-markdown/language): each construct, as Markupress renders it.
// Markdown text and code stay literal for HTML Next, so `{` renders as `\{`.
const fixtures: readonly (readonly [name: string, markdown: string, html: readonly string[]])[] = [
  ['paragraphs and inline formatting', 'Text with *emphasis*, **strong**, `code {x}` and ~~gone~~.', ['<p>Text with <em>emphasis</em>, <strong>strong</strong>, <code>code \\{x}</code> and <s>gone</s>.</p>']],
  ['autolinks', 'See https://example.com.', ['<a href="https://example.com">https://example.com</a>']],
  ['link references', 'See [the guide][g].\n\n[g]: https://example.com/guide "Guide"', ['<a href="https://example.com/guide" title="Guide">the guide</a>']],
  ['headings with anchors and authored IDs', '## Setup\n\n## Install {#install}', ['<h2 id="setup"><a href="#setup">Setup</a></h2>', '<h2 id="install"><a href="#install">Install</a></h2>']],
  ['tables with column alignment', '| a | b |\n| :- | -: |\n| 1 | 2 |', ['<th style="text-align:start">a</th>', '<td style="text-align:end">2</td>']],
  ['lists separated by blank lines', '- one\n- two\n\n1. first\n\n2. second', ['<ul><li>one</li><li>two</li></ul>', '<ol><li>first</li></ol><ol start="2"><li>second</li></ol>']],
  ['task lists', '- [x] Done\n- [ ] Next', ['<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" disabled="" checked=""> Done</label></li>']],
  ['footnotes', 'Text[^n].\n\n[^n]: The note.', ['<sup><a href="#fn:n" id="fnref:n" data-footnote-ref="">1</a></sup>', '<section data-footnotes="" aria-label="Footnotes">']],
  ['line blocks', '| One line\n| Another', ['<div data-type="line-block" style="white-space:pre-line">One line<br>Another</div>']],
  ['callouts with bracketed and unbracketed titles', '::: tip [Use this]\nA\n:::\n\n::: warning Before you upgrade\nB\n:::', ['<ui-callout tone="tip" heading="Use this"><p>A</p></ui-callout>', '<ui-callout tone="warning" heading="Before you upgrade"><p>B</p></ui-callout>']],
  ['GitHub alerts', '> [!IMPORTANT]\n> Read this.', ['<ui-callout tone="important"><p>Read this.</p></ui-callout>']],
  ['nested containers', ':::: note [Outer]\n::: danger [Inner]\nCheck.\n:::\n::::', ['<ui-callout tone="note" heading="Outer"><ui-callout tone="danger" heading="Inner"><p>Check.</p></ui-callout></ui-callout>']],
  ['details', '::: details [More] {open}\nHidden\n:::', ['<details open=""><summary>More</summary><p>Hidden</p></details>']],
  ['figures', '::: figure [The *pipeline*]\n![Pipeline](./p.svg)\n:::', ['<figure><p><img src="./p.svg" alt="Pipeline"></p><figcaption>The <em>pipeline</em></figcaption></figure>']],
  ['layout', '::: layout {align=center}\nCentered\n:::', ['<div data-align="center" data-type="layout"']],
  ['tabs with a shared group', ':::: tabs {group=pm}\n::: tab [npm]\nA\n:::\n\n::: tab [pnpm]\nB\n:::\n::::', ['<ui-tabs group="pm"><section aria-label="npm"><p>A</p></section><section aria-label="pnpm"><p>B</p></section></ui-tabs>']],
  ['tables of contents', '::: toc [On this page] {depth=2}\n:::\n\n## One', ['<nav data-type="toc" data-format="plain" aria-label="On this page"><strong>On this page</strong><ul><li data-depth="2"><a href="#one">One</a></li></ul></nav>']],
  ['chips and mentions', ':chip[Ready]{tone=green} by @[Ada]#u1', ['<span data-tone="green" data-type="chip">Ready</span>', '<span data-type="mention" data-ref="u1">Ada</span>']],
  ['code captions, highlights and line numbers', '```ts {title="a.ts" highlight=1 show-line-numbers}\nconst a = {b};\n```', ['<figcaption>a.ts</figcaption>', 'line-numbers', '<span class="line highlighted">']],
  ['images with attributes', '![Logo](./logo.svg){width=40 placement=center}', ['<img width="40" data-placement="center" src="./logo.svg" alt="Logo">']],
  ['raw HTML blocks', '<div class="note">\n\n**Markdown** inside.\n\n</div>', ['<div class="note"><p><strong>Markdown</strong> inside.</p></div>']],
];

for (const [name, markdown, html] of fixtures) {
  it(`renders Expressive Markdown ${name}`, async () => {
    const { resource } = await compileMarkdown(markdown, { file: '/docs/page.md', pageName: 'page-fixture' });
    for (const fragment of html) expect(resource).toContain(fragment);
  });
}
