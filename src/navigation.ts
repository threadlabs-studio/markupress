import type { NavigationItem, NavigationNode } from '@nextwebwg/htmlkit';

/** A top navigation or footer link. A path starting with `/` is a page of the selected version. */
export interface Link { readonly label: string; readonly href: string }
/** A top navigation entry: a link, or a dropdown of links. */
export type NavItem = Link | { readonly label: string; readonly items: readonly Link[] };
/** An explicit sidebar entry: a page by its path in the version (`/guide/install/`), a link, or a group. */
export type SidebarItem = string | Link | { readonly label: string; readonly items: readonly SidebarItem[]; readonly collapsed?: boolean };

/** A sidebar entry as `<hk-nav>` renders it: a page or link with `href`, and a folder or group with `children`. */
export interface SidebarNode {
  readonly label: string;
  readonly href?: string;
  readonly current: string;
  readonly open: boolean;
  readonly depth: number;
  readonly children: readonly SidebarNode[];
}

/**
 * HTMLKit's navigation tree with Markupress's group policy: a folder stays open unless its index page's front
 * matter says `navigation: collapsed`, and one holding the current page is always open. `collapsed` tells whether
 * a folder's index page URL starts closed.
 */
export function generatedSidebar(tree: readonly NavigationNode[], collapsed: (href: string) => boolean): SidebarNode[] {
  return tree.map(node => ({ ...node, open: node.open || (node.children.length > 0 && !(node.href !== undefined && collapsed(node.href))),
    children: generatedSidebar(node.children, collapsed) }));
}

/** A configured sidebar, resolved against the version's pages so entries get their labels and current page. */
export function configuredSidebar(entries: readonly SidebarItem[], items: readonly NavigationItem[], href: (path: string) => string, current: string, depth = 0): SidebarNode[] {
  return entries.map(entry => {
    if (typeof entry === 'string') {
      const page = items.find(item => item.href === href(entry));
      if (page === undefined) throw new Error(`sidebar: no page at ${entry}.`);
      return { label: page.label, href: page.href, current: page.current, open: false, depth, children: [] };
    }
    if ('items' in entry) {
      const children = configuredSidebar(entry.items, items, href, current, depth + 1);
      return { label: entry.label, current: 'false', open: entry.collapsed !== true || children.some(holdsCurrent), depth, children };
    }
    const target = href(entry.href);
    return { label: entry.label, href: target, current: target === current ? 'page' : 'false', open: false, depth, children: [] };
  });
}

const holdsCurrent = (node: SidebarNode): boolean => node.current === 'page' || node.children.some(holdsCurrent);
