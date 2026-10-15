import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { NavigationItem, NavigationNode } from '@nextwebwg/htmlkit';
import { afterEach, expect, it } from 'vitest';
import { category, categoryFrontMatter, configuredSidebar, generatedSidebar, type SidebarNode } from '../src/navigation.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function project(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'markupress-navigation-')); roots.push(root);
  for (const [file, text] of Object.entries(files)) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), text); }
  return root;
}
const item = (path: string, label: string, current = 'false'): NavigationItem => ({ href: `/d/v/current/${path}`, label, current: current as 'page' | 'false', depth: path.split('/').filter(Boolean).length, pageName: `page-${label}` });
const node = (label: string, children: NavigationNode[] = [], fields: Partial<NavigationNode> = {}): NavigationNode =>
  ({ label, current: 'false', open: children.some(child => child.open), depth: 0, order: null, children, ...fields });
/** Labels as a nested outline: a folder or group is [label, open, children]. */
const shape = (nodes: readonly SidebarNode[]): unknown[] => nodes.map(entry => entry.children.length > 0 ? [entry.label, entry.open, shape(entry.children)] : entry.label);

it('keeps folders open unless their index page collapses them, and always opens one holding the current page', () => {
  const tree = [node('Home', [], { href: '/home/' }),
    node('Forms', [node('Button', [], { href: '/forms/button/' })], { href: '/forms/' }),
    node('Layout', [node('Stack', [], { href: '/layout/stack/' })], { href: '/layout/' }),
    node('More', [node('Deep', [node('Page', [], { href: '/more/deep/page/', current: 'page', open: true })])], { href: '/more/' })];
  const collapsed = (href: string) => href === '/layout/' || href === '/more/';
  // Folders nest as deep as the tree does: <hk-nav> renders each level.
  expect(shape(generatedSidebar(tree, collapsed))).toEqual(['Home', ['Forms', true, ['Button']], ['Layout', false, ['Stack']], ['More', true, [['Deep', true, ['Page']]]]]);
  // A folder without an index page has no href, and stays open.
  expect(generatedSidebar([node('loose', [node('A', [], { href: '/loose/a/' })])], () => true)[0]!.open).toBe(true);
});

it('resolves a configured sidebar against the version pages, with links and collapsible groups', () => {
  const items = [item('', 'Home'), item('architecture/', 'Architecture', 'page'), item('tokens/', 'Tokens')];
  const href = (path: string) => path.startsWith('/') ? `/d/v/current/${path.slice(1)}` : path;
  const sidebar = configuredSidebar(['/', { label: 'Foundations', collapsed: true, items: ['/architecture/', '/tokens/'] },
    { label: 'Closed', collapsed: true, items: ['/tokens/'] }, { label: 'Proposal', href: 'https://nextwebwg.org/' }], items, href, '/d/v/current/architecture/');
  expect(shape(sidebar)).toEqual(['Home', ['Foundations', true, ['Architecture', 'Tokens']], ['Closed', false, ['Tokens']], 'Proposal']);
  expect(sidebar[1]!.children[0]).toMatchObject({ href: '/d/v/current/architecture/', current: 'page', depth: 1 });
  expect(sidebar[1]).not.toHaveProperty('href');
  expect(sidebar[3]).toMatchObject({ href: 'https://nextwebwg.org/', current: 'false' });
  expect(() => configuredSidebar(['/missing/'], items, href, '')).toThrow('sidebar: no page at /missing/.');
});

it('gives a folder\'s _category label and position to its index page, and needs that index page', async () => {
  const root = await project({
    'docs/index.md': '', 'docs/_category.yml': 'label: Root\n',
    'docs/01.forms/index.md': '', 'docs/01.forms/button.md': '', 'docs/01.forms/_category_.json': '{ "label": "Forms", "position": 3, "collapsible": false }',
    'docs/02.loose/a.md': '', 'docs/02.loose/_category_.yml': 'label: Loose\n',
    'docs/03.nested/04.inner/b.md': '', 'docs/03.nested/_category.yml': 'collapsed: true\n',
  });
  const top = join(root, 'docs');
  expect(categoryFrontMatter(join(top, '01.forms/index.md'), top)).toEqual({ sidebarLabel: 'Forms', sidebarPosition: 3 });
  // Other pages, and the version home, take none.
  expect(categoryFrontMatter(join(top, '01.forms/button.md'), top)).toBeUndefined();
  expect(categoryFrontMatter(join(top, 'index.md'), top)).toBeUndefined();
  expect(() => categoryFrontMatter(join(top, '02.loose/a.md'), top)).toThrow(/02\.loose\/_category_\.yml: .*add an index\.md to .*02\.loose\./);
  expect(() => categoryFrontMatter(join(top, '03.nested/04.inner/b.md'), top)).toThrow(/03\.nested\/_category\.yml/);
});

it('reports mistyped _category fields against the file', async () => {
  const root = await project({ 'docs/_category.yml': 'position: first\n', 'docs/a/_category.yml': 'position: 2.5\n' });
  expect(() => category(join(root, 'docs'))).toThrow(/_category\.yml: position must be a number/);
  expect(() => category(join(root, 'docs/a'))).toThrow(/_category\.yml: position must be a whole number/);
});
