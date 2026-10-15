import type { NavigationItem, NavigationNode } from '@nextwebwg/htmlkit';
import { expect, it } from 'vitest';
import { configuredSidebar, generatedSidebar, type SidebarNode } from '../src/navigation.js';

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
