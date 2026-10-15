import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { NavigationItem } from '@nextwebwg/htmlkit';
import { parse } from 'yaml';

/** A top navigation or footer link. A path starting with `/` is a page of the selected version. */
export interface Link { readonly label: string; readonly href: string }
/** A top navigation entry: a link, or a dropdown of links. */
export type NavItem = Link | { readonly label: string; readonly items: readonly Link[] };
/** An explicit sidebar entry: a page by its path in the version (`/guide/install/`), a link, or a group. */
export type SidebarItem = string | Link | { readonly label: string; readonly items: readonly SidebarItem[]; readonly collapsed?: boolean };

/** What the shell renders: a page link, or a group with `items`. Three levels deep, the third flattened. */
export interface SidebarNode {
  readonly label: string;
  readonly href: string;
  readonly current: string;
  readonly open: boolean;
  readonly depth: number;
  readonly items: readonly SidebarNode[];
}
/** The source file behind a page URL, which places groups on disk and gives their file order. */
export type Sources = ReadonlyMap<string, string>;

const index = /^(?:\d+\.)?index\.md$/;
const rank = (name: string) => { const prefix = /^(\d+)\./.exec(name)?.[1]; return prefix === undefined ? Infinity : Number(prefix); };
// An index page takes its folder's number.
const fileRank = (source = '') => rank(basename(index.test(basename(source)) ? dirname(source) : source));
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
  return fields as Category;
}

type Tree = { label: string; href: string; current: string; open: boolean; items: Tree[]; rank: number; position?: number };

/**
 * Groups HTMLKit's ordered navigation by folder. `items` are one version's pages, `prefix` the folder's URL
 * (`/manual/v/current/` or a section within it). A folder's own index page is its group's first entry, and a
 * `_category` file labels the group, collapses it, or moves it with `position` as if that were its folder's number.
 */
export function generatedSidebar(items: readonly NavigationItem[], prefix: string, sources: Sources): SidebarNode[] {
  const segments = (item: NavigationItem) => item.href.slice(prefix.length).split('/').filter(Boolean);
  const build = (members: readonly NavigationItem[], depth: number, folder: string): Tree[] => {
    const nodes: Tree[] = [];
    const groups = new Map<string, NavigationItem[]>();
    // A folder with pages below its own is a group; a folder with only an index page is a page.
    const folders = new Set(members.filter(item => segments(item).length > depth + 1).map(item => segments(item)[depth]));
    for (const item of members) {
      const parts = segments(item), key = parts[depth];
      if (key === undefined || !folders.has(key)) {
        nodes.push({ label: item.label, href: item.href, current: item.current, open: false, items: [], rank: key === undefined ? -Infinity : fileRank(sources.get(item.href)) });
        continue;
      }
      if (!groups.has(key)) { groups.set(key, []); nodes.push({ label: key, href: '', current: 'false', open: true, items: [], rank: Infinity }); }
      groups.get(key)!.push(item);
    }
    for (const node of nodes) {
      if (node.href !== '') continue;
      const key = node.label, members = groups.get(key)!, url = `${folder}${key}/`;
      node.items = build(members, depth + 1, url);
      // Any page in the group places the folder on disk: walk up from its source to the group's depth.
      const member = members[0]!, source = sources.get(member.href);
      let directory = source === undefined ? undefined : dirname(source);
      if (directory !== undefined) for (let n = segments(member).length - (index.test(basename(source!)) ? 0 : 1); n > depth + 1; n--) directory = dirname(directory);
      const metadata = directory === undefined ? {} : category(directory);
      const own = members.find(item => item.href === url);
      node.label = metadata.label ?? own?.label ?? key;
      node.rank = directory === undefined ? Infinity : rank(basename(directory));
      if (metadata.position !== undefined) node.position = metadata.position;
      node.open = !metadata.collapsed || contains(node, 'page');
    }
    // HTMLKit's order already follows the file numbers; a position sorts the siblings by number, stably.
    return nodes.some(node => node.position !== undefined) ? nodes.sort((a, b) => (a.position ?? a.rank) - (b.position ?? b.rank)) : nodes;
  };
  return levels(build(items, 0, prefix));
}

/** A configured sidebar, resolved against the version's pages so entries get their labels and current page. */
export function configuredSidebar(entries: readonly SidebarItem[], items: readonly NavigationItem[], href: (path: string) => string, current: string): SidebarNode[] {
  const node = (entry: SidebarItem): Tree => {
    if (typeof entry === 'string') {
      const page = items.find(item => item.href === href(entry));
      if (page === undefined) throw new Error(`sidebar: no page at ${entry}.`);
      return { label: page.label, href: page.href, current: page.current, open: false, items: [], rank: 0 };
    }
    if ('items' in entry) {
      const group: Tree = { label: entry.label, href: '', current: 'false', open: true, items: entry.items.map(node), rank: 0 };
      group.open = entry.collapsed !== true || contains(group, 'page');
      return group;
    }
    const target = href(entry.href);
    return { label: entry.label, href: target, current: target === current ? 'page' : 'false', open: false, items: [], rank: 0 };
  };
  return levels(entries.map(node));
}

function contains(node: Tree, current: string): boolean { return node.current === current || node.items.some(item => contains(item, current)); }

// ponytail: the shell's template nests two group levels; deeper pages list flat in the second group, indented by depth.
// A recursive sidebar component would lift the ceiling.
function levels(nodes: readonly Tree[], level = 1, depth = 0): SidebarNode[] {
  return nodes.flatMap(({ label, href, current, open, items }) => level < 3 || href !== ''
    ? [{ label, href, current, open, depth, items: level < 3 ? levels(items, level + 1) : [] }]
    : levels(items, level, depth + 1));
}
