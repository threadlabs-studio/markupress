import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApplication, devApplication, loadConfig, previewApplication, type ApplicationOptions, type ApplicationServer, type BuildResult, type HtmlKitPlugin,
  type LoadContext, type NavigationItem, type ServerOptions } from '@nextwebwg/htmlkit';
import type { FrontMatter, OutlineItem } from './content.js';
import { markdown } from './markdown.js';
import { category, categoryFrontMatter, configuredSidebar, generatedSidebar, isIndex, type Link, type NavItem, type SidebarItem } from './navigation.js';
import { themeScript } from './theme.js';
import { versionLinks } from './versions.js';

export interface DocumentationVersion {
  readonly id: string;
  readonly label?: string;
  readonly directory: string;
  /** Snapshot-owned public assets; active versions use the project's public directory. */
  readonly publicDir?: string;
}
export interface MarkupressOptions {
  readonly root?: string;
  readonly contentDir?: string;
  readonly base?: string;
  readonly outDir?: string;
  readonly title?: string;
  readonly versions?: readonly DocumentationVersion[];
  readonly defaultVersion?: string;
  readonly host?: string;
  readonly port?: number;
  /** Number the lines of every highlighted code block unless its fence says `:no-line-numbers`. */
  readonly lineNumbers?: boolean;
  /**
   * An HTML Next layout component, relative to the root, that replaces the Markupress shell. It receives the
   * loader data its `<prop>` declarations name: see "Layout data" in the README.
   */
  readonly layout?: string;
  /** The logo before the title: one image, or one per theme. Paths starting with `/` are files in `public/`. */
  readonly logo?: string | { readonly light: string; readonly dark?: string };
  /** The site's icon, such as `/favicon.svg` from `public/`. */
  readonly favicon?: string;
  /** Top navigation: links, and dropdowns of links. A path starting with `/` is a page of the version being read. */
  readonly nav?: readonly NavItem[];
  /** Links at the end of the top navigation, each shown as its `icon` image (from `public/`) or its label. */
  readonly social?: readonly (Link & { readonly icon?: string })[];
  /** Text of the badge beside the title. Without it, a site with several versions shows the selected version's label. */
  readonly versionBadge?: string;
  /** Explicit sidebars by section path (`/`, `/editor/`). Every other section's sidebar is generated from its folder. */
  readonly sidebar?: Readonly<Record<string, readonly SidebarItem[]>>;
  /** Footer link columns and a copyright line. */
  readonly footer?: { readonly columns?: readonly { readonly title: string; readonly items: readonly Link[] }[]; readonly copyright?: string };
}
export interface DocumentationPage {
  readonly id: string;
  readonly version: string;
  readonly source: string;
  /** Application-relative URL in its version, such as /v/current/guide/install/. */
  readonly pathname: string;
}

function inside(root: string, path: string) {
  const part = relative(root, path); return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith('../') && !part.startsWith('..\\'));
}
async function versions(options: MarkupressOptions, root: string): Promise<readonly DocumentationVersion[]> {
  if (options.versions) return options.versions;
  const manifest = join(root, 'versioned_docs/versions.json');
  const snapshots = existsSync(manifest) ? JSON.parse(await readFile(manifest, 'utf8')) as DocumentationVersion[] : [];
  return [{ id: 'current', label: 'Current', directory: options.contentDir ?? 'docs' }, ...snapshots];
}

const shell = fileURLToPath(new URL('../theme/shell.html', import.meta.url));
const own = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
// HTMLKit's css option is page-wide: Looma's :root tokens and its light/dark switch, and document defaults.
// A component's <style> is scoped to its own region, so these would never reach :root from the shell.
// theme.css also styles HTMLKit's built-in components, which no component's scoped style can reach.
const pageStyles = [...['tokens.css', 'theme-light.css', 'theme-dark.css'].map(file => fileURLToPath(import.meta.resolve(`@threadlabs/looma/${file}`))),
  own('styles/base.css'), own('theme/theme.css')];

/**
 * Versioned documentation as an HTMLKit plugin. Markdown pages come from the markdown plugin, and
 * HTMLKit routes them: each version's directory serves /v/<id>/, and the default version's also
 * serves the site root. Markupress keeps only the version catalog its switcher needs.
 */
export function markupress(options: MarkupressOptions = {}): HtmlKitPlugin {
  const defaultVersion = options.defaultVersion ?? 'current';
  let root = resolve(options.root ?? process.cwd());
  let editions: readonly DocumentationVersion[] = [];
  const editionOf = (file: string) => editions.find(edition => inside(resolve(root, edition.directory), file));
  // Compiled documents by version and source file. HTMLKit recompiles every page when it rediscovers, so a
  // deleted file's stale entry is filtered by existence rather than cleared.
  const documents = new Map<string, DocumentationPage & { readonly aliases: readonly string[]; readonly page: FrontMatter & { readonly title: string; readonly label: string };
    readonly outline: readonly OutlineItem[] }>();
  const current = () => [...documents.values()].filter(doc => existsSync(doc.source));
  const pages = markdown({
    // Each Markdown page component imports the prose styles, so they style that page's region and nothing else.
    styles: [own('styles/prose.css')],
    ...(options.lineNumbers === undefined ? {} : { lineNumbers: options.lineNumbers }),
    publicDir: file => resolve(root, editionOf(file)?.publicDir ?? 'public'),
    frontmatter(file) { const edition = editionOf(file); return edition && categoryFrontMatter(file, resolve(root, edition.directory)); },
    onPage(page) {
      const owners = editions.filter(edition => inside(resolve(root, edition.directory), page.file));
      if (owners.length === 0 || page.href === undefined) return;
      // The page's URL is in the first version that serves its directory; others serve the same path.
      const first = `/v/${owners[0]!.id}/`;
      const path = page.href.slice(page.href.indexOf(first) + first.length);
      const id = page.id ?? (path.slice(0, -1) || 'index');
      for (const edition of owners) {
        const twin = current().find(doc => doc.source !== page.file && doc.version === edition.id && doc.id === id);
        if (twin) throw new Error(`Documentation identity collision: ${twin.source} and ${page.file} (${id}).`);
        documents.set(`${edition.id}\0${page.file}`, { id, version: edition.id, source: page.file, pathname: `/v/${edition.id}/${path}`,
          aliases: page.aliases.map(alias => `/v/${edition.id}${alias}`), outline: page.outline,
          page: { ...page.frontmatter, id, title: page.title, label: page.label } });
      }
    },
  });
  let layoutFile = shell;
  async function load({ navigation, navigationTree, breadcrumbs, pager, url, base, propNames }: LoadContext) {
    const path = '/' + url.pathname.slice(base.length);
    const selected = /^\/v\/([^/]+)\//.exec(path)?.[1] ?? defaultVersion;
    const requested = path.startsWith('/v/') ? path : `/v/${selected}${path}`;
    const catalog = current();
    const page = catalog.find(doc => doc.pathname === requested || doc.aliases.includes(requested));
    // The default version also serves the root; its entries are marked current under /v/<id>/.
    const within = { from: `/v/${selected}/`, current: base + (page?.pathname ?? requested).slice(1) };
    const items = await navigation(within);
    const data: Record<string, unknown> = { title: options.title ?? 'Documentation', home: base, navigation: items,
      ...await chrome(items, navigationTree, catalog.filter(doc => doc.version === selected), selected, within.current, base),
      versions: versionLinks(catalog, editions, page?.id ?? 'index', selected, base),
      crumbs: await breadcrumbs(within), ...await pager(within), outline: page?.outline ?? [], page: page?.page ?? {} };
    // HTMLKit rejects props a layout does not declare, so a layout receives the data its contract names, and
    // nested folder layouts' loaders read all of it from parent.markupress.
    return { props: Object.fromEntries(propNames.filter(name => name in data).map(name => [name, data[name]])), data: { markupress: data } };
  }
  /** The shell around the page: top navigation, logo, badge, the section's sidebar and the footer. */
  async function chrome(items: readonly NavigationItem[], navigationTree: LoadContext['navigationTree'], pages: readonly DocumentationPage[], selected: string, current: string, base: string) {
    const home = `${base}v/${selected}/`;
    const href = (to: string) => /^(?:[A-Za-z][\w+.-]*:|\/\/|#)/.test(to) || !to.startsWith('/') ? to : home + to.slice(1);
    const file = (path: string) => path.startsWith('/') ? base + path.slice(1) : path;
    // A link is the page itself, or an ancestor section of it (aria-current="true").
    const link = ({ label, href: to }: Link) => {
      const target = href(to), path = target.split('#')[0]!;
      return { label, href: target, current: target === current ? 'page' : path !== home && path.endsWith('/') && current.startsWith(path) ? 'true' : 'false' };
    };
    // The section is the longest configured sidebar path holding the page, else its top-level folder, else the root.
    const path = '/' + current.slice(home.length);
    const top = /^\/([^/]+)\//.exec(path)?.[1];
    const section = Object.keys(options.sidebar ?? {}).filter(key => key !== '/' && path.startsWith(key)).sort((a, b) => b.length - a.length)[0]
      ?? (top !== undefined && items.some(item => item.href.startsWith(`${home}${top}/`) && item.href !== `${home}${top}/`) ? `/${top}/` : '/');
    const explicit = options.sidebar?.[section];
    // A _category's collapsed state is read on each render, so editing it applies in development.
    const sources = new Map(pages.map(doc => [base + doc.pathname.slice(1), doc.source]));
    const collapsed = (page: string) => { const source = sources.get(page); return source !== undefined && isIndex(source) && category(dirname(source)).collapsed === true; };
    const logo = typeof options.logo === 'string' ? { light: options.logo, dark: options.logo } : options.logo;
    const versions = editions.length > 1 ? editions.find(edition => edition.id === selected) : undefined;
    return {
      sidebar: explicit ? configuredSidebar(explicit, items, href, current)
        : generatedSidebar(await navigationTree({ from: `/v/${selected}${section}`, current }), collapsed),
      nav: (options.nav ?? []).map(item => {
        if (!('items' in item)) return { ...link(item), items: [] };
        const links = item.items.map(link);
        return { label: item.label, href: '', current: links.some(entry => entry.current !== 'false') ? 'true' : 'false', items: links };
      }),
      logo: logo === undefined ? null : { light: file(logo.light), dark: file(logo.dark ?? logo.light) },
      favicon: options.favicon === undefined ? null : file(options.favicon),
      social: (options.social ?? []).map(entry => ({ label: entry.label, href: href(entry.href), icon: entry.icon === undefined ? '' : file(entry.icon) })),
      badge: options.versionBadge ?? (versions ? versions.label ?? versions.id : ''),
      footer: { columns: (options.footer?.columns ?? []).map(column => ({ title: column.title, items: column.items.map(link) })), copyright: options.footer?.copyright ?? '' },
    };
  }
  return { ...pages, name: 'markupress', async config(htmlkit) {
    root = resolve(htmlkit.root ?? root);
    editions = await versions(options, root);
    const ids = new Set<string>();
    for (const edition of editions) {
      if (!/^[A-Za-z0-9_-]+$/.test(edition.id) || ids.has(edition.id)) throw new Error(`Duplicate or invalid documentation version: ${edition.id}.`);
      ids.add(edition.id);
      const content = resolve(root, edition.directory);
      if (!inside(root, content)) throw new Error(`Version ${edition.id}: directory must be inside the project.`);
      if (!(await readdir(content)).some(name => /^(?:\d+\.)?index\.md$/.test(name))) throw new Error(`Version ${edition.id}: a root index.md landing page is required.`);
    }
    const home = editions.find(edition => edition.id === defaultVersion);
    if (home === undefined) throw new Error(`Unknown defaultVersion: ${defaultVersion}.`);
    for (const key of Object.keys(options.sidebar ?? {})) if (!/^\/(?:[^/]+\/)*$/.test(key)) throw new Error(`sidebar: ${key} must be a path such as / or /guide/.`);
    // The shell is the layout of Markupress's own folders only, so a site's other pages keep theirs.
    if (options.layout !== undefined) layoutFile = resolve(root, options.layout);
    const layout = { component: layoutFile, server: { load } };
    return { headScript: themeScript, css: pageStyles,
      pages: [...editions.map(edition => ({ dir: edition.directory, prefix: `/v/${edition.id}/`, layout })), { dir: home.directory, layout }] };
  } };
}

/**
 * HTMLKit options for a Markupress site, as the CLI runs it: the site's own HTMLKit options (its `htmlkit.config.ts`)
 * with `markupress()` added after their plugins. Markupress's own `base` and `outDir`, when set, win over HTMLKit's.
 */
export function siteOptions(options: MarkupressOptions = {}, htmlkit: ApplicationOptions = {}): ServerOptions {
  const root = resolve(options.root ?? htmlkit.root ?? process.cwd());
  // markupress() already holds the markdown() plugin's pages; a second copy of either would compile .md twice.
  const listed = htmlkit.plugins?.find(plugin => plugin.name === 'markupress' || plugin.name === 'markdown');
  if (listed) throw new Error(`htmlkit.config: the markupress command adds markupress(), which includes markdown(); remove ${listed.name}() from its plugins.`);
  return { ...htmlkit, root, base: options.base ?? htmlkit.base ?? '/', outDir: resolve(root, options.outDir ?? htmlkit.outDir ?? 'site'),
    plugins: [...htmlkit.plugins ?? [], markupress({ ...options, root })],
    ...(options.host === undefined ? {} : { host: options.host }), ...(options.port === undefined ? {} : { port: options.port }) };
}
// Each loads the site's htmlkit.config.ts or .js, as the htmlkit command would, so its plugins compose with Markupress.
const withConfig = async (options: MarkupressOptions) => siteOptions(options, await loadConfig(resolve(options.root ?? process.cwd())));
export async function buildSite(options: MarkupressOptions = {}): Promise<BuildResult> { return buildApplication(await withConfig(options)); }
export async function previewSite(options: MarkupressOptions = {}): Promise<ApplicationServer> { return previewApplication(await withConfig(options)); }
/** HTMLKit's watcher recompiles Markdown and reloads open pages after each edit. */
export async function devSite(options: MarkupressOptions = {}): Promise<ApplicationServer> { return devApplication(await withConfig(options)); }
