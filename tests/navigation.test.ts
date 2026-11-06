import type { NavigationNode } from '@threadlabs/markupkit';
import { expect, it } from 'vitest';
import { generatedSidebar, type SidebarNode } from '../src/navigation.js';

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
  expect(shape(generatedSidebar(tree, collapsed))).toEqual(['Home', ['Forms', true, ['Button']], ['Layout', false, ['Stack']], ['More', true, [['Deep', true, ['Page']]]]]);
  // A folder without an index page has no href, and stays open.
  expect(generatedSidebar([node('loose', [node('A', [], { href: '/loose/a/' })])], () => true)[0]!.open).toBe(true);
});

it('section navigation links every category and lists only pages in the current category', () => {
  const tree = [
    node('Layout', [node('Stack', [], { href: '/stack/', current: 'page', open: true }),
      node('Nested', [node('Grid', [], { href: '/grid/' })])]),
    node('Forms', [node('Button', [], { href: '/button/' })], { href: '/forms/' }),
    node('Empty'),
    node('Guide', [], { href: '/guide/' }),
  ];
  const sidebar = generatedSidebar(tree, () => false, 'sections');
  expect(sidebar.map(({ label, href, current }) => ({ label, href, current }))).toEqual([
    { label: 'Layout', href: '/stack/', current: 'location' },
    { label: 'Forms', href: '/forms/', current: 'false' },
    { label: 'Guide', href: '/guide/', current: 'false' },
  ]);
  expect(sidebar[0]!.children.map(({ label, href, current, children }) => ({ label, href, current, children }))).toEqual([
    { label: 'Stack', href: '/stack/', current: 'page', children: [] },
    { label: 'Grid', href: '/grid/', current: 'false', children: [] },
  ]);
  expect(sidebar[1]!.children).toEqual([]);
  expect(tree[1]!.children).toHaveLength(1);
  const overview = generatedSidebar([node('Forms', [...tree[1]!.children], { href: '/forms/', current: 'page', open: true })], () => true, 'sections');
  expect(overview[0]!.href).toBe('/forms/');
  expect(overview[0]!.current).toBe('page');
  expect(overview[0]!.children[0]!.label).toBe('Button');
});

it('uses a marked group overview as the category destination without repeating it among its pages', () => {
  const overview = node('Browse components', [], { href: '/forms/', current: 'page', open: true });
  const tree = [node('Forms', [node('Button', [], { href: '/button/' }), overview])];
  const sidebar = generatedSidebar(tree, () => false, 'sections', new Set(['/forms/']));
  expect(sidebar[0]!.href).toBe('/forms/');
  expect(sidebar[0]!.current).toBe('page');
  expect(sidebar[0]!.children.map(child => child.label)).toEqual(['Button']);
  const treeMode = generatedSidebar(tree, () => false, 'tree', new Set(['/forms/']));
  expect(treeMode[0]!.href).toBe('/forms/');
  expect(treeMode[0]!.children.map(child => child.label)).toEqual(['Button']);
  const parent = generatedSidebar([node('Reference', tree, { href: '/reference/' })], () => false, 'sections', new Set(['/forms/']));
  expect(parent[0]!.href).toBe('/reference/');
  expect(parent[0]!.children.map(child => child.href)).toEqual(['/forms/', '/button/']);
  expect(() => generatedSidebar([node('Forms', [overview, overview])], () => false, 'sections', new Set(['/forms/']))).toThrow(/one overview/);
});
