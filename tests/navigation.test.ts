import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { NavigationItem } from '@nextwebwg/htmlkit';
import { afterEach, expect, it } from 'vitest';
import { category, configuredSidebar, generatedSidebar, type SidebarNode } from '../src/navigation.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function project(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'markupress-navigation-')); roots.push(root);
  for (const [file, text] of Object.entries(files)) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), text); }
  return root;
}
const item = (path: string, label: string, current = 'false'): NavigationItem => ({ href: `/d/v/current/${path}`, label, current: current as 'page' | 'false', depth: path.split('/').filter(Boolean).length, pageName: `page-${label}` });
/** Labels as a nested outline: a group is [label, open, children]. */
const shape = (nodes: readonly SidebarNode[]): unknown[] => nodes.map(node => node.href ? node.label : [node.label, node.open, shape(node.items)]);

it('groups pages by folder, labels groups from _category, index pages or folder names, and orders them by position', async () => {
  const root = await project({
    'docs/02.components/index.md': '', 'docs/02.components/01.forms/button.md': '', 'docs/02.components/02.layout/stack.md': '',
    'docs/02.components/02.layout/_category_.json': '{ "label": "Layout", "position": 0 }',
    'docs/01.guide/01.start.md': '', 'docs/01.guide/02.more/a.md': '', 'docs/01.guide/02.more/_category.yml': 'label: More\ncollapsed: true\n',
  });
  const items = [item('', 'Home'), item('guide/start/', 'Start'), item('guide/more/a/', 'A'), item('components/', 'Components'),
    item('components/forms/button/', 'Button', 'page'), item('components/layout/stack/', 'Stack')];
  const sources = new Map([['', 'docs/index.md'], ['guide/start/', 'docs/01.guide/01.start.md'], ['guide/more/a/', 'docs/01.guide/02.more/a.md'],
    ['components/', 'docs/02.components/index.md'], ['components/forms/button/', 'docs/02.components/01.forms/button.md'],
    ['components/layout/stack/', 'docs/02.components/02.layout/stack.md']].map(([path, file]) => [`/d/v/current/${path}`, join(root, file!)]));
  expect(shape(generatedSidebar(items, '/d/v/current/', sources))).toEqual([
    'Home',
    ['guide', true, ['Start', ['More', false, ['A']]]],
    // The folder's index page labels its group and comes first; position 0 moves Layout before forms (01.).
    ['Components', true, ['Components', ['Layout', true, ['Stack']], ['forms', true, ['Button']]]],
  ]);
  // A section's sidebar is its folder's pages, and a collapsed group holding the current page stays open.
  expect(shape(generatedSidebar(items.slice(1, 3).map(entry => entry.label === 'A' ? { ...entry, current: 'page' as const } : entry), '/d/v/current/guide/', sources)))
    .toEqual(['Start', ['More', true, ['A']]]);
});

it('lists pages deeper than two group levels flat in the second, indented by depth', () => {
  const items = [item('a/b/c/d/', 'D'), item('a/b/c/e/f/', 'F')];
  const [group] = generatedSidebar(items, '/d/v/current/', new Map());
  expect(group!.items[0]!.items.map(node => [node.label, node.depth])).toEqual([['D', 1], ['F', 2]]);
});

it('resolves a configured sidebar against the version pages, with links and collapsible groups', () => {
  const items = [item('', 'Home'), item('architecture/', 'Architecture', 'page'), item('tokens/', 'Tokens')];
  const href = (path: string) => path.startsWith('/') ? `/d/v/current/${path.slice(1)}` : path;
  const sidebar = configuredSidebar(['/', { label: 'Foundations', collapsed: true, items: ['/architecture/', '/tokens/'] },
    { label: 'Proposal', href: 'https://nextwebwg.org/' }], items, href, '/d/v/current/architecture/');
  expect(shape(sidebar)).toEqual(['Home', ['Foundations', true, ['Architecture', 'Tokens']], 'Proposal']);
  expect(sidebar[1]!.items[0]).toMatchObject({ href: '/d/v/current/architecture/', current: 'page' });
  expect(sidebar[2]).toMatchObject({ href: 'https://nextwebwg.org/', current: 'false' });
  expect(() => configuredSidebar(['/missing/'], items, href, '')).toThrow('sidebar: no page at /missing/.');
});

it('reports mistyped _category fields against the file', async () => {
  const root = await project({ 'docs/_category.yml': 'position: first\n' });
  expect(() => category(join(root, 'docs'))).toThrow(/_category\.yml: position must be a number/);
});
