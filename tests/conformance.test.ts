// @vitest-environment jsdom
import { LOOMA_MARKDOWN_FIXTURES, normalizeLoomaHtml } from '@threadlabs/looma/markdown/fixtures';
import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { expect, it } from 'vitest';
import { renderMarkdown } from '../src/content.js';

type Node = DefaultTreeAdapterMap['node'];
// HTML Next reads `\{` and `\\` in text as literal characters, so a reader sees the text with the escapes removed.
const unescape = (node: Node): void => {
  if ('value' in node && node.nodeName === '#text') node.value = node.value.replace(/\\([\\{])/g, '$1');
  if ('childNodes' in node) node.childNodes.forEach(unescape);
};

/** The Looma Markdown layer's HTML, as a reader's browser holds it. Markupress's front matter schema is its own layer. */
async function rendered(markdown: string): Promise<string> {
  const fragment = parseFragment((await renderMarkdown(markdown, { file: '/docs/case.md' })).html);
  unescape(fragment);
  return serialize(fragment);
}

for (const fixture of LOOMA_MARKDOWN_FIXTURES) {
  it(`renders the Looma Markdown fixture ${fixture.feature}/${fixture.name}`, async () => {
    expect(normalizeLoomaHtml(await rendered(fixture.markdown))).toBe(normalizeLoomaHtml(fixture.html));
  });
}
