// @vitest-environment jsdom
import { parse } from 'expressmark';
import { renderHtml } from 'expressmark/render';
import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { expect, it } from 'vitest';
import { renderMarkdown } from '../src/content.js';

type Node = DefaultTreeAdapterMap['node'];
// Compare the reader's HTML after HTML Next's literal-text escapes are consumed.
const unescape = (node: Node): void => {
  if ('value' in node && node.nodeName === '#text') node.value = node.value.replace(/\\([\\{])/g, '$1');
  if ('childNodes' in node) node.childNodes.forEach(unescape);
};
const normalize = (html: string) => {
  const fragment = parseFragment(html); unescape(fragment); return serialize(fragment);
};
const cases = [
  ['inline formatting', 'Plain **strong** *emphasis* ~~removed~~ `code {literal}`.'],
  ['standard table cells', '| Name | Value |\n| --- | --- |\n| `a | b` | literal |'],
  ['preferred named tables', '::: table\n\n- Field: `title`\n  Type: string\n\n- Field: `order`\n  Type: number\n\n:::'],
  ['tasks', '- [x] Done\n- [ ] Next'],
  ['references', '[Read it][guide]\n\n[guide]: ./guide.md'],
  ['footnotes', 'Text[^note] and again[^note].\n\n[^note]: Literal {text}.'],
  ['semantic inline nodes', ':chip[Ready]{tone=green} @[Ada]#u1'],
  ['HTML with Markdown inside', '<div>\n\n**Rich content** and `literal`.\n\n</div>'],
  ['standard line blocks', '| First line\n| Second line'],
  ['standard setext reading', 'Plain title\n---'],
] as const;
for (const [name, source] of cases) {
  it(`uses Expressmark standard HTML for ${name}`, async () => {
    const expected = renderHtml(parse(source, { syntax: 'standard' }), { title: false });
    const actual = await renderMarkdown(source, { file: '/docs/case.md' });
    expect(normalize(actual.html)).toBe(normalize(expected));
  });
}
