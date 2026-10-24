import type { NavigationNode } from '@nextwebwg/htmlkit';
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
