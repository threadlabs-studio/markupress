import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { compileMarkdown } from '../src/content.js';
import { convertMarkdown, convertSite } from '../src/convert.js';

it('converts == Label tab panels into tab containers, and a group name into {group=…}', () => {
  expect(convertMarkdown('::: tabs\n== Examples\nSee **this**\n\n== API\nThe reference.\n:::')).toBe('::: tab [Examples]\nSee **this**\n:::\n\n::: tab [API]\nThe reference.\n:::');
  expect(convertMarkdown('::: tabs pm\n== npm\nnpm i\n\n== pnpm\npnpm add\n:::')).toBe(':::: tabs {group=pm}\n::: tab [npm]\nnpm i\n:::\n\n::: tab [pnpm]\npnpm add\n:::\n::::');
  // Containers inside panels keep fewer colons than their tab.
  expect(convertMarkdown(':::: tabs\n== One\n::: tip\nInside\n:::\n::::')).toBe(':::: tab [One]\n::: tip\nInside\n:::\n::::');
  // A code group's panels become tabs inside it.
  expect(convertMarkdown('::: code-group\n== Shell\n```sh title="install.sh"\nnpm install x\n```\n:::')).toBe(':::: code-group\n::: tab [Shell]\n```sh title="install.sh"\nnpm install x\n```\n:::\n::::');
  // A code group of fences, and a named tabs group with no panels, read as written.
  expect(convertMarkdown('::: code-group\n```sh title="pnpm"\npnpm add x\n```\n:::')).toBe('::: code-group\n```sh title="pnpm"\npnpm add x\n```\n:::');
  expect(convertMarkdown('::: tabs pm\nText\n:::')).toBe(':::: tabs {group=pm}\nText\n::::');
});

it('converts :mention[…]{id=…} into @[…]#…, leaving code and converted Markdown as written', () => {
  expect(convertMarkdown('By :mention[Ada Lovelace]{id=u1} and :mention[Grace]{id="u-2"}.')).toBe('By @[Ada Lovelace]#u1 and @[Grace]#u-2.');
  const code = '```md\n::: tabs\n== A\n:::\n:mention[Ada]{id=u1}\n```\n\nInline `:mention[Ada]{id=u1}` stays.';
  expect(convertMarkdown(code)).toBe(code);
  const converted = convertMarkdown('::: tabs pm\n== npm\nA\n:::\n\nBy :mention[Ada]{id=u1}.');
  expect(convertMarkdown(converted)).toBe(converted);
});

it('converts the Markdown in every version\'s content once, and lists the files it changed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'markupress-convert-'));
  try {
    await mkdir(join(root, 'docs'), { recursive: true }); await mkdir(join(root, 'versions/v1/docs'), { recursive: true });
    await writeFile(join(root, 'docs/index.md'), 'By :mention[Ada]{id=u1}.');
    await writeFile(join(root, 'docs/plain.md'), '# Plain');
    await writeFile(join(root, 'versions/v1/docs/index.md'), '::: tabs\n== A\nOne\n:::');
    expect((await convertSite(root, ['docs', 'versions'])).sort()).toEqual(['docs/index.md', 'versions/v1/docs/index.md']);
    expect(await readFile(join(root, 'docs/index.md'), 'utf8')).toBe('By @[Ada]#u1.');
    expect(await convertSite(root, ['docs', 'versions'])).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('renders converted tabs, code groups and mentions as 0.7 rendered them', async () => {
  const { resource } = await compileMarkdown(convertMarkdown('::: tabs pm\n== npm\nA\n\n== pnpm\nB\n:::\n\n::: code-group\n== Shell\n```sh\nx\n```\n:::\n\nBy :mention[Ada]{id=u1}.'), { file: '/docs/page.md', pageName: 'page-converted' });
  expect(resource).toContain('<ui-tabs group="pm"><section aria-label="npm"><p>A</p></section><section aria-label="pnpm"><p>B</p></section></ui-tabs>');
  expect(resource).toMatch(/<ui-tabs class="code-group" group="code-group"><section aria-label="Shell"><figure class="code">/);
  expect(resource).toContain('<span data-type="mention" data-ref="u1">Ada</span>');
});
