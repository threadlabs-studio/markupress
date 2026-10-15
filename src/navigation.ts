import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { NavigationItem, NavigationNode } from '@nextwebwg/htmlkit';
import { parse } from 'yaml';
import type { FrontMatter } from './content.js';

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

const index = /^(?:\d+\.)?index\.md$/;
/** Whether a Markdown file is its folder's index page. */
export const isIndex = (file: string) => index.test(basename(file));
// Markupress's own name, and Docusaurus's, so a migrated folder keeps its metadata.
const categoryFiles = ['_category.yml', '_category_.yml', '_category_.json'];

interface Category { readonly label?: string; readonly position?: number; readonly collapsed?: boolean }
/** A folder's group metadata. YAML also reads Docusaurus's JSON. */
export function category(directory: string): Category {
  const file = categoryFiles.map(name => join(directory, name)).find(existsSync);
  if (file === undefined) return {};
  const value: unknown = parse(readFileSync(file, 'utf8'));
  const fields = (value ?? {}) as Record<string, unknown>;
  if (typeof fields !== 'object' || Array.isArray(fields)) throw new Error(`${file}: must be a mapping.`);
  for (const [name, type] of [['label', 'string'], ['position', 'number'], ['collapsed', 'boolean']] as const) {
    if (fields[name] !== undefined && typeof fields[name] !== type) throw new Error(`${file}: ${name} must be a ${type}.`);
  }
  // HTMLKit's hk:order is a whole number, as a file's number prefix is.
  if (fields.position !== undefined && !(Number.isSafeInteger(fields.position) && (fields.position as number) >= 0)) throw new Error(`${file}: position must be a whole number.`);
  return fields as Category;
}

/**
 * The front matter a folder's `_category` gives its index page: the label and position that HTMLKit's navigation
 * tree reads from the index page as the folder's own. `top` is the version's content directory, whose index page
 * is the version home and has no folder to order.
 */
export function categoryFrontMatter(file: string, top: string): FrontMatter | undefined {
  // HTMLKit labels and orders a folder only through its index page, so a _category without one could not apply.
  for (let directory = dirname(file); directory.length > top.length; directory = dirname(directory)) {
    const metadata = categoryFiles.map(name => join(directory, name)).find(existsSync);
    if (metadata !== undefined && !readdirSync(directory).some(name => index.test(name))) {
      throw new Error(`${metadata}: a folder's label, position and collapsed state apply through its index page; add an index.md to ${directory}.`);
    }
  }
  if (!isIndex(file) || dirname(file) === top) return undefined;
  const { label, position } = category(dirname(file));
  return { ...(label === undefined ? {} : { sidebarLabel: label }), ...(position === undefined ? {} : { sidebarPosition: position }) };
}

/**
 * HTMLKit's navigation tree with Markupress's group policy: a folder stays open unless its `_category` collapses
 * it, and one holding the current page is always open. `collapsed` tells whether a folder's index page URL starts closed.
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
