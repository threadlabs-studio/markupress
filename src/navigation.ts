import { existsSync, readFileSync } from 'node:fs';
import type { NavigationNode } from '@nextwebwg/htmlkit';
import { Lexer, type Token } from 'marked';

/** A top navigation or footer link. A path starting with `/` is a page of the selected version. */
export interface Link { readonly label: string; readonly href: string }
/** A top navigation link after the sections, shown as its `icon` image (a path starting with `/` is in `public/`) or its label. */
export type NavItem = Link & { readonly icon?: string };

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

/**
 * A version's footer, from the `_footer.md` in its content directory (HTMLKit routes no `_` file): each heading
 * starts a column, its list items are links, and a paragraph after them is the copyright line.
 */
export function footer(file: string): { columns: { title: string; items: Link[] }[]; copyright: string } {
  const result = { columns: [] as { title: string; items: Link[] }[], copyright: '' };
  if (!existsSync(file)) return result;
  const fail = (message: string): never => { throw new Error(`${file}: ${message}`); };
  const link = (tokens: readonly Token[] = []): Link | undefined => {
    for (const token of tokens) {
      if (token.type === 'link') return { label: token.text, href: token.href };
      const inner = link('tokens' in token ? token.tokens : undefined);
      if (inner) return inner;
    }
    return undefined;
  };
  for (const token of Lexer.lex(readFileSync(file, 'utf8'))) {
    if (token.type === 'heading') result.columns.push({ title: token.text, items: [] });
    else if (token.type === 'list') {
      const column = result.columns.at(-1) ?? fail('a footer list follows a heading, which titles its column.');
      for (const item of token.items) column.items.push(link(item.tokens) ?? fail(`the footer list item "${item.text}" is a link.`));
    } else if (token.type === 'paragraph') result.copyright = token.text;
    else if (token.type !== 'space') fail(`a footer holds headings, lists of links, and a copyright paragraph, not ${token.type}.`);
  }
  return result;
}
