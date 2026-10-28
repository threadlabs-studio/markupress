import { existsSync, readFileSync } from 'node:fs';
import type { NavigationNode } from '@threadlabs/markupkit';
import { parse } from 'expressmark';
import { renderHtml } from 'expressmark/render';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';

/** A top navigation or footer link. A path starting with `/` is a page of the selected version. */
export interface Link { readonly label: string; readonly href: string }
/**
 * Where a site link points: a path starting with `/` is a page path below `home` (the version's home, or the site's
 * base), and any other link, such as a URL, a fragment or a relative path, stays as written. Markdown links, the
 * footer and the `nav` option share it, so `/tokens/` means the same page everywhere.
 */
export function siteLink(to: string, home: string): string {
  return /^(?:[A-Za-z][\w+.-]*:|\/\/|#)/.test(to) || !to.startsWith('/') ? to : home + to.slice(1);
}
/** A top navigation link after the sections, shown as its `icon` image (a path starting with `/` is in `public/`) or its label. */
export type NavItem = Link & { readonly icon?: string };

/** A sidebar entry from MarkupKit, rendered through Looma navigation controls: a page or link with `href`, and a folder or group with `children`. */
export interface SidebarNode {
  readonly label: string;
  readonly href?: string;
  readonly current: string;
  readonly open: boolean;
  readonly depth: number;
  readonly children: readonly SidebarNode[];
}

/**
 * MarkupKit's navigation tree with Markupress's group policy: a folder stays open unless its index page's front
 * matter says `navigation: collapsed`, and one holding the current page is always open. `collapsed` tells whether
 * a folder's index page URL starts closed. Section mode instead links every category
 * to its overview or first page and lists only the current category's descendants.
 */
export function generatedSidebar(tree: readonly NavigationNode[], collapsed: (href: string) => boolean, mode: 'tree' | 'sections' = 'tree', overviews: ReadonlySet<string> = new Set()): SidebarNode[] {
  if (overviews.size) tree = overviewNodes(tree, overviews);
  if (mode === 'sections') {
    const pages = (nodes: readonly NavigationNode[]): SidebarNode[] => nodes.flatMap(node => [
      ...(node.href === undefined ? [] : [{ ...node, children: [] }]), ...pages(node.children),
    ]);
    return tree.flatMap(node => {
      const children = pages(node.children), href = node.href ?? children[0]?.href;
      if (href === undefined) return [];
      // Route groups have no overview URL. Their heading links to the first page,
      // while current still describes the category separately from that page.
      return [{ ...node, href, current: node.current === 'page' ? 'page' : node.open ? 'location' : 'false',
        children: node.open ? children : [] }];
    });
  }
  return tree.map(node => ({ ...node, open: node.open || (node.children.length > 0 && !(node.href !== undefined && collapsed(node.href))),
    children: generatedSidebar(node.children, collapsed) }));
}

/** A route group can have an overview without adding a segment to its children's URLs. */
function overviewNodes(tree: readonly NavigationNode[], overviews: ReadonlySet<string>): NavigationNode[] {
  return tree.map(node => {
    const children = overviewNodes(node.children, overviews);
    // Match direct authored pages, before a nested group acquires its overview URL.
    const marked = node.children.filter(child => child.href !== undefined && overviews.has(child.href));
    if (marked.length > 1 || (marked.length && node.href !== undefined)) throw new Error(`Navigation group ${node.label} must have only one overview, including its folder index.`);
    const overview = marked[0];
    return overview === undefined ? { ...node, children } : { ...node, href: overview.href!, current: overview.current,
      children: children.filter((_, index) => index !== node.children.indexOf(overview)) };
  });
}

/** A version's footer uses the same standard Expressmark parser as its pages. */
export function footer(file: string): { columns: { title: string; items: Link[] }[]; copyright: string } {
  const result = { columns: [] as { title: string; items: Link[] }[], copyright: '' };
  if (!existsSync(file)) return result;
  const fail = (message: string): never => { throw new Error(`${file}: ${message}`); };
  type Node = DefaultTreeAdapterMap['node'];
  const text = (node: Node): string => 'value' in node ? node.value : 'childNodes' in node ? node.childNodes.map(text).join('') : '';
  const firstLink = (node: Node): DefaultTreeAdapterMap['element'] | undefined => 'tagName' in node && node.tagName === 'a' ? node
    : 'childNodes' in node ? node.childNodes.map(firstLink).find(Boolean) : undefined;
  const html = renderHtml(parse(readFileSync(file, 'utf8'), { syntax: 'standard' }), { title: false });
  for (const node of parseFragment(html).childNodes) {
    if (!('tagName' in node)) continue;
    if (/^h[1-6]$/.test(node.tagName)) result.columns.push({ title: text(node), items: [] });
    else if (node.tagName === 'ul' || node.tagName === 'ol') {
      const column = result.columns.at(-1) ?? fail('a footer list follows a heading, which titles its column.');
      for (const item of node.childNodes.filter(child => 'tagName' in child && child.tagName === 'li')) {
        const link = firstLink(item) ?? fail(`the footer list item "${text(item)}" is a link.`);
        column.items.push({ label: text(link), href: link.attrs.find(attribute => attribute.name === 'href')?.value ?? '' });
      }
    } else if (node.tagName === 'p') result.copyright = text(node);
    else fail(`a footer holds headings, lists of links, and a copyright paragraph, not ${node.tagName}.`);
  }
  return result;
}
