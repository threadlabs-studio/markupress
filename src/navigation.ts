import { existsSync, readFileSync } from 'node:fs';
import type { NavigationNode } from '@nextwebwg/htmlkit';
import { parse, type Node } from 'expressmark';

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

/** A sidebar entry from HTMLKit, rendered through Looma navigation controls: a page or link with `href`, and a folder or group with `children`. */
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

/** A node's plain text: its value, or its descendants' text in order. */
const plainText = (node: Node | string | undefined): string => node === undefined ? '' : typeof node === 'string' ? node
  : node.value ?? [...node.body ?? [], ...node.children ?? []].map(plainText).join('');

/**
 * A version's footer, from the `_footer.md` in its content directory (HTMLKit routes no `_` file): each heading
 * starts a column, its list items are links, and a paragraph after them is the copyright line.
 */
export function footer(file: string): { columns: { title: string; items: Link[] }[]; copyright: string } {
  const result = { columns: [] as { title: string; items: Link[] }[], copyright: '' };
  if (!existsSync(file)) return result;
  const fail = (message: string): never => { throw new Error(`${file}: ${message}`); };
  // A list item's first link, labelled by its text.
  const link = (item: Node): Link | undefined => {
    const find = (node: Node): Node | undefined => node.type === 'link' ? node : [...node.body ?? [], ...node.children ?? []].map(find).find(Boolean);
    const found = find(item);
    return found && { label: plainText(found), href: found.url ?? '' };
  };
  for (const node of parse(readFileSync(file, 'utf8'), { syntax: 'modern' }).body) {
    if (node.type === 'heading') result.columns.push({ title: plainText(node), items: [] });
    else if (node.type === 'list') {
      const column = result.columns.at(-1) ?? fail('a footer list follows a heading, which titles its column.');
      for (const item of node.children ?? []) column.items.push(link(item) ?? fail(`the footer list item "${plainText(item)}" is a link.`));
    } else if (node.type === 'paragraph') result.copyright = plainText(node);
    else fail(`a footer holds headings, lists of links, and a copyright paragraph, not ${node.type}.`);
  }
  return result;
}
