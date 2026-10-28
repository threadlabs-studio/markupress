import { expect, it } from 'vitest';
import { createSearch } from '../src/search.js';

const entries = [
  { href: '/install/', page: 'Installation', heading: 'Installation', text: 'Set up the package.' },
  { href: '/notes/', page: 'Notes', heading: 'Release notes', text: 'Installation was documented here.' },
  { href: '/cafe/', page: 'Café', heading: 'Café', text: 'Cafe\u0301 and résumé.' },
  { href: '/zh/', page: '安装指南', heading: '安装指南', text: '如何安装软件和配置项目。' },
];

it('finds prefixes, typos and folded accents while ranking titles ahead of body matches', () => {
  const search = createSearch(entries);
  expect(search('instalation')[0]?.href).toBe('/install/');
  expect(search('inst')[0]?.href).toBe('/install/');
  expect(search('installation')[0]?.href).toBe('/install/');
  expect(search('cafe')[0]?.heading).toBe('Café');
  expect(search('resume')[0]?.excerpt).toContain('résumé');
});

it('requires every query term and handles empty and punctuation-only input', () => {
  const search = createSearch(entries);
  expect(search('installation package').map(item => item.href)).toEqual(['/install/']);
  expect(search('installation absent')).toEqual([]);
  expect(search('')).toEqual([]);
  expect(search('?!')).toEqual([]);
});

it('segments CJK content and preserves source text in snippets', () => {
  expect(createSearch(entries, {}, 'zh')('软件')[0]?.excerpt).toContain('如何安装软件');
  const text = '😀 '.repeat(80) + 'Cafe\u0301 résumé ' + 'tail '.repeat(80);
  const result = createSearch([{ ...entries[2]!, text }])('resume')[0]!;
  expect(result.excerpt).toContain('Cafe\u0301 résumé');
  expect(result.excerpt).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
});

it('applies matching and result-count options', () => {
  expect(createSearch(entries, { fuzzy: false })('instalation')).toEqual([]);
  expect(createSearch(entries, { prefix: false, fuzzy: false })('inst')).toEqual([]);
  expect(createSearch(entries, { limit: 1 })('installation')).toHaveLength(1);
});
