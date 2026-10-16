// @vitest-environment jsdom
import { LOOMA_MARKDOWN_FIXTURES, normalizeLoomaHtml } from '@threadlabs/looma/markdown/fixtures';
import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { expect, it } from 'vitest';
import { compileMarkdown } from '../src/content.js';

type Node = DefaultTreeAdapterMap['node'];
const find = (node: Node, match: (node: Node) => boolean): Node | undefined => match(node) ? node
  : [...('content' in node ? [node.content] : []), ...('childNodes' in node ? node.childNodes : [])].map(child => find(child, match)).find(Boolean);
// HTML Next reads `\{` and `\\` in text as literal characters, so a reader sees the text with the escapes removed.
const unescape = (node: Node): void => {
  if ('value' in node && node.nodeName === '#text') node.value = node.value.replace(/\\([\\{])/g, '$1');
  if ('childNodes' in node) node.childNodes.forEach(unescape);
};

/** The page's article, as a reader's browser holds it. */
async function rendered(markdown: string): Promise<string> {
  const { resource } = await compileMarkdown(markdown, { file: '/docs/case.md', pageName: 'page-case' });
  const article = find(parseFragment(resource), node => 'tagName' in node && node.tagName === 'article')!;
  unescape(article);
  return serialize(article as DefaultTreeAdapterMap['parentNode']);
}

for (const fixture of LOOMA_MARKDOWN_FIXTURES) {
  it(`renders the Looma Markdown fixture ${fixture.feature}/${fixture.name}`, async () => {
    expect(normalizeLoomaHtml(await rendered(fixture.markdown))).toBe(normalizeLoomaHtml(fixture.html));
  });
}
