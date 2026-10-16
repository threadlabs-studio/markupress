import { existsSync, readFileSync } from 'node:fs';
import type { NavigationNode } from '@nextwebwg/htmlkit';
import { createLoomaMarkdownIt } from '@threadlabs/looma/markdown/markdown-it';
import type { Token } from 'markdown-it';

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

const markdown = createLoomaMarkdownIt();

/**
 * A version's footer, from the `_footer.md` in its content directory (HTMLKit routes no `_` file): each heading
 * starts a column, its list items are links, and a paragraph after them is the copyright line.
 */
export function footer(file: string): { columns: { title: string; items: Link[] }[]; copyright: string } {
  const result = { columns: [] as { title: string; items: Link[] }[], copyright: '' };
  if (!existsSync(file)) return result;
  const fail = (message: string): never => { throw new Error(`${file}: ${message}`); };
  // A list item's first link, labelled by its text.
  const link = (inline: Token): Link | undefined => {
    const children = inline.children ?? [], open = children.findIndex(child => child.type === 'link_open');
    if (open < 0) return undefined;
    const close = children.findIndex((child, index) => index > open && child.type === 'link_close');
    return { label: children.slice(open + 1, close).map(child => child.content).join(''), href: children[open]!.attrGet('href') ?? '' };
  };
  const tokens = markdown.parse(readFileSync(file, 'utf8'), {});
  for (const [index, token] of tokens.entries()) {
    if (token.level !== 0 || token.nesting === -1) continue;
    if (token.type === 'heading_open') result.columns.push({ title: tokens[index + 1]!.content, items: [] });
    else if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      const column = result.columns.at(-1) ?? fail('a footer list follows a heading, which titles its column.');
      for (let item = index + 1; tokens[item]!.level > 0; item++) {
        if (tokens[item]!.type !== 'list_item_open' || tokens[item]!.level !== 1) continue;
        const inline = tokens.slice(item).find(next => next.type === 'inline')!;
        column.items.push(link(inline) ?? fail(`the footer list item "${inline.content}" is a link.`));
      }
    } else if (token.type === 'paragraph_open') result.copyright = tokens[index + 1]!.content;
    else fail(`a footer holds headings, lists of links, and a copyright paragraph, not ${token.type.replace(/_open$/, '')}.`);
  }
  return result;
}
