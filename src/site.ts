import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApplication, devApplication, loadConfig, previewApplication, type ApplicationOptions, type ApplicationServer, type BuildResult, type HtmlKitPlugin,
  type LoadContext, type NavigationItem, type NavigationNode, type ServerOptions } from '@nextwebwg/htmlkit';
import { isIndex, type FrontMatter, type OutlineItem } from './content.js';
import { lastUpdated } from './git.js';
import { markdown } from './markdown.js';
import { footer, generatedSidebar, siteLink, type Link, type NavItem } from './navigation.js';
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
  /** The site's origin, such as https://example.com: HTMLKit writes `sitemap.xml` for it, and `robots.txt` links that sitemap. */
  readonly origin?: string;
  /** HTMLKit's `robots.txt`: true allows every crawler, and a string is the file's text. */
  readonly robots?: boolean | string;
  readonly outDir?: string;
  readonly title?: string;
  readonly versions?: readonly DocumentationVersion[];
  readonly defaultVersion?: string;
  readonly host?: string;
  readonly port?: number;
  /** Number the lines of every highlighted code block unless its fence says `:no-line-numbers`. */
  readonly lineNumbers?: boolean;
  /** The logo before the title, in place of `public/logo.svg` and `public/logo-dark.svg`: one image, or one per theme. */
  readonly logo?: string | { readonly light: string; readonly dark?: string };
  /** The site's icon, in place of `public/favicon.svg`. */
  readonly favicon?: string;
  /** Links after the sections in the top navigation, each shown as its `icon` image or its label. */
  readonly nav?: readonly NavItem[];
  /** Every page's "Edit this page" link: this URL, ending in `/`, followed by the page file's path in the project. */
  readonly editLink?: string;
  /**
   * Each page's document `<title>`, where `:title` is the page's title: `":title | <title>"` by default, with the site
   * `title`. `false` gives the page's title alone. A version's home page is titled with the site title alone.
   */
  readonly titleTemplate?: string | false;
}
const optionNames = ['root', 'contentDir', 'base', 'origin', 'robots', 'outDir', 'title', 'versions', 'defaultVersion', 'host', 'port', 'lineNumbers', 'logo', 'favicon', 'nav', 'editLink', 'titleTemplate'];
export interface DocumentationPage {
  readonly id: string;
  readonly version: string;
  readonly source: string;
  /** Application-relative URL in its version, such as /v/current/guide/install/. */
  readonly pathname: string;
}

type Document = DocumentationPage & { readonly aliases: readonly string[]; readonly page: FrontMatter & { readonly title: string };
  readonly outline: readonly OutlineItem[]; readonly generated: boolean };

function inside(root: string, path: string) {
  const part = relative(root, path); return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith('../') && !part.startsWith('..\\'));
}
/**
 * A snapshot recorded in `versions/<id>/`, which keeps the project's layout: its content is `versions/<id>/<contentDir>`
 * and its public files `versions/<id>/public`. Snapshots follow the current version, highest number first.
 */
export function snapshotOf(root: string, id: string, contentDir: string): DocumentationVersion {
  return { id, directory: `versions/${id}/${contentDir}`, ...(existsSync(join(root, 'versions', id, 'public')) ? { publicDir: `versions/${id}/public` } : {}) };
}
async function versions(options: MarkupressOptions, root: string): Promise<readonly DocumentationVersion[]> {
  if (options.versions) return options.versions;
  const content = options.contentDir ?? 'docs';
  // A folder whose name starts with "." is a snapshot in progress, or its lock.
  const ids = existsSync(join(root, 'versions')) ? (await readdir(join(root, 'versions'), { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => entry.name).sort((a, b) => b.localeCompare(a, 'en', { numeric: true })) : [];
  return [{ id: 'current', label: 'Current', directory: content }, ...ids.map(id => snapshotOf(root, id, content))];
}

const shell = fileURLToPath(new URL('../theme/shell.html', import.meta.url));
const homeLayout = fileURLToPath(new URL('../theme/home.html', import.meta.url));
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
  let editions: readonly DocumentationVersion[] = [], siteBase = '/';
  const editionOf = (file: string) => editions.find(edition => inside(resolve(root, edition.directory), file));
  // Compiled documents by version and source file. HTMLKit recompiles every page when it rediscovers, so a
  // deleted file's stale entry is filtered by existence rather than cleared.
  const documents = new Map<string, Document>();
  const current = () => [...documents.values()].filter(doc => existsSync(doc.source));
  const pages = markdown({
    // Each Markdown page component imports the prose styles, so they style that page's region and nothing else.
    styles: [own('styles/prose.css')],
    ...(options.lineNumbers === undefined ? {} : { lineNumbers: options.lineNumbers }),
    publicDir: file => resolve(root, editionOf(file)?.publicDir ?? 'public'),
    documentTitle(file, title) {
      const site = options.title ?? 'Documentation', edition = editionOf(file);
      // A version's home page is the site's own page.
      if (edition && isIndex(file) && dirname(file) === resolve(root, edition.directory)) return site;
      const template = options.titleTemplate ?? `:title | ${site}`;
      return template === false ? title : template.replaceAll(':title', title);
    },
    // A root-relative link is a page of the version the file belongs to.
    home: file => { const edition = editionOf(file); return edition ? `${siteBase}v/${edition.id}/` : siteBase; },
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
          aliases: page.aliases.map(alias => `/v/${edition.id}${alias}`), outline: page.outline, generated: page.generated,
          page: { ...page.frontmatter, id, title: page.title } });
      }
    },
  });
  let layoutFile = shell;
  let logo: { readonly light: string; readonly dark?: string } | undefined, favicon: string | undefined;
  let updated: Promise<ReadonlyMap<string, string>> = Promise.resolve(new Map());
  /** The page's front matter, with its resolved edit link and the date its file last changed in git. */
  async function pageData(doc: Document) {
    const file = relative(root, doc.source).split(sep).join('/');
    const { editLink, ...page } = doc.page;
    const edit = editLink ?? (options.editLink === undefined ? false : options.editLink + encodeURI(file));
    const date = (await updated).get(file);
    return { ...page, ...(edit === false ? {} : { editLink: edit }), ...(date === undefined ? {} : { lastUpdated: date }) };
  }
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
      crumbs: await breadcrumbs(within), ...await pager(within), outline: page?.outline ?? [], page: page ? await pageData(page) : {},
      contents: page?.generated ? contents(await navigationTree({ ...within, from: page.pathname }), catalog, base, within.current) : [] };
    // HTMLKit rejects props a layout does not declare, so a layout receives the data its contract names, and
    // nested folder layouts' loaders read all of it from parent.markupress.
    return { props: Object.fromEntries(propNames.filter(name => name in data).map(name => [name, data[name]])), data: { markupress: data } };
  }
  /** The shell around the page: the sections and links of the top navigation, logo, badge, the section's sidebar and the footer. */
  async function chrome(items: readonly NavigationItem[], navigationTree: LoadContext['navigationTree'], pages: readonly (DocumentationPage & { readonly page: FrontMatter })[], selected: string, current: string, base: string) {
    const home = `${base}v/${selected}/`;
    const href = (to: string) => siteLink(to, home);
    const file = (path: string) => path.startsWith('/') ? base + path.slice(1) : path;
    // A link is the page itself, or an ancestor section of it (aria-current="true").
    const link = ({ label, href: to }: Link) => {
      const target = href(to), path = target.split('#')[0]!;
      return { label, href: target, current: target === current ? 'page' : path !== home && path.endsWith('/') && current.startsWith(path) ? 'true' : 'false' };
    };
    // The section is the page's top-level folder, else the root.
    const top = /^([^/]+)\//.exec(current.slice(home.length))?.[1];
    const section = top !== undefined && items.some(item => item.href.startsWith(`${home}${top}/`) && item.href !== `${home}${top}/`) ? `/${top}/` : '/';
    // Each top-level folder with an index page is a section, linked from the top navigation by its index page.
    const sections = (await navigationTree({ from: `/v/${selected}/`, current })).filter(node => node.href !== undefined && node.children.length > 0);
    // Pages recompile after each edit, so a folder's collapsed state follows its index page in development.
    const folded = new Set(pages.filter(doc => doc.page.navigation === 'collapsed').map(doc => base + doc.pathname.slice(1)));
    const collapsed = (page: string) => folded.has(page);
    const versions = editions.length > 1 ? editions.find(edition => edition.id === selected) : undefined;
    const edition = editions.find(entry => entry.id === selected)!;
    const { columns, copyright } = footer(resolve(root, edition.directory, '_footer.md'));
    return {
      sidebar: generatedSidebar(await navigationTree({ from: `/v/${selected}${section}`, current }), collapsed),
      nav: [...sections.map(node => ({ ...link({ label: node.label, href: '/' + node.href!.slice(home.length) }), icon: '' })),
        ...(options.nav ?? []).map(entry => ({ ...link(entry), icon: entry.icon === undefined ? '' : file(entry.icon) }))],
      logo: logo === undefined ? null : { light: file(logo.light), dark: file(logo.dark ?? logo.light) },
      favicon: favicon === undefined ? null : file(favicon),
      badge: versions ? versions.label ?? versions.id : '',
      footer: { columns: columns.map(column => ({ title: column.title, items: column.items.map(link) })), copyright },
    };
  }
  // Config is plain data, so an option from another tool, or a removed one, fails rather than doing nothing.
  for (const name of Object.keys(options)) if (!optionNames.includes(name)) throw new Error(`Unknown Markupress option ${name}. Options are ${optionNames.join(', ')}.`);
  if (typeof options.titleTemplate === 'string' && !options.titleTemplate.includes(':title')) throw new Error(`The titleTemplate option places each page's title with :title: ${options.titleTemplate}.`);
  if (options.editLink !== undefined && !options.editLink.endsWith('/')) throw new Error(`The editLink option ends in /, and each page's path in the project follows it: ${options.editLink}.`);
  return { ...pages, name: 'markupress', async config(htmlkit) {
    root = resolve(htmlkit.root ?? root); siteBase = htmlkit.base ?? '/';
    // Conventions first: public/logo.svg, public/logo-dark.svg and public/favicon.svg, which the options override.
    const own = (name: string) => existsSync(join(root, 'public', name)) ? `/${name}` : undefined;
    const light = own('logo.svg');
    logo = typeof options.logo === 'string' ? { light: options.logo } : options.logo ?? (light === undefined ? undefined : { light, dark: own('logo-dark.svg') ?? light });
    favicon = options.favicon ?? own('favicon.svg');
    editions = await versions(options, root);
    // One git log dates every page, read once per build or development server.
    updated = lastUpdated(root, editions.map(edition => edition.directory));
    const ids = new Set<string>();
    for (const edition of editions) {
      if (!/^[A-Za-z0-9_-]+$/.test(edition.id) || ids.has(edition.id)) throw new Error(`Duplicate or invalid documentation version: ${edition.id}.`);
      ids.add(edition.id);
      const content = resolve(root, edition.directory);
      if (!inside(root, content)) throw new Error(`Version ${edition.id}: directory must be inside the project.`);
      if (!(await readdir(content)).some(isIndex)) throw new Error(`Version ${edition.id}: a root index.md landing page is required.`);
    }
    const home = editions.find(edition => edition.id === defaultVersion);
    if (home === undefined) throw new Error(`Unknown defaultVersion: ${defaultVersion}.`);
    const same = (a: DocumentationVersion, b: DocumentationVersion) => resolve(root, a.directory) === resolve(root, b.directory);
    // The shell is the layout of Markupress's own folders only, so a site's other pages keep theirs. A site's
    // app/layouts/default.html, which HTMLKit gives its other pages, replaces the shell and receives its loader data.
    const replacement = join(root, 'app/layouts/default.html');
    layoutFile = existsSync(replacement) ? replacement : shell;
    const layout = { component: layoutFile, server: { load } };
    // layout: home names this layout; a site's app/layouts/home.html takes its place, as HTMLKit resolves a name.
    return { headScript: themeScript, css: pageStyles, layouts: { home: { component: homeLayout, server: { load } } },
      // The root serves the default version's folder as its own; every further mount of a folder, the default's
      // /v/<id>/ included, is an alias, so its pages name the first as canonical and stay out of the sitemap.
      pages: [...editions.map((edition, index) => ({ dir: edition.directory, prefix: `/v/${edition.id}/`, layout,
        ...(same(edition, home) || editions.slice(0, index).some(earlier => same(earlier, edition)) ? { alias: true } : {}) })), { dir: home.directory, layout }] };
  } };
}

/**
 * A generated index's entries: the pages and folders directly in its folder, from HTMLKit's navigation tree below
 * the index page, each with its page's description. A folder without an index page (a route group) adds its pages.
 */
function contents(tree: readonly NavigationNode[], catalog: readonly (DocumentationPage & { readonly page: FrontMatter })[], base: string, self: string) {
  const descriptions = new Map(catalog.map(doc => [base + doc.pathname.slice(1), doc.page.description ?? '']));
  const entries = (nodes: readonly NavigationNode[]): { label: string; href: string; description: string }[] => nodes.flatMap(node =>
    node.href === undefined ? entries(node.children) : node.href === self ? [] : [{ label: node.label, href: node.href, description: descriptions.get(node.href) ?? '' }]);
  return entries(tree);
}

/**
 * HTMLKit options for a Markupress site, as the CLI runs it: the site's own HTMLKit options (its `htmlkit.config.ts`)
 * with `markupress()` added after their plugins. Markupress's own `base`, `origin`, `robots` and `outDir`, when set, win over HTMLKit's.
 */
export function siteOptions(options: MarkupressOptions = {}, htmlkit: ApplicationOptions = {}): ServerOptions {
  const root = resolve(options.root ?? htmlkit.root ?? process.cwd());
  // markupress() already holds the markdown() plugin's pages; a second copy of either would compile .md twice.
  const listed = htmlkit.plugins?.find(plugin => plugin.name === 'markupress' || plugin.name === 'markdown');
  if (listed) throw new Error(`htmlkit.config: the markupress command adds markupress(), which includes markdown(); remove ${listed.name}() from its plugins.`);
  return { ...htmlkit, root, base: options.base ?? htmlkit.base ?? '/', outDir: resolve(root, options.outDir ?? htmlkit.outDir ?? 'site'),
    plugins: [...htmlkit.plugins ?? [], markupress({ ...options, root })],
    ...(options.origin === undefined ? {} : { origin: options.origin }), ...(options.robots === undefined ? {} : { robots: options.robots }),
    ...(options.host === undefined ? {} : { host: options.host }), ...(options.port === undefined ? {} : { port: options.port }) };
}
// Each loads the site's htmlkit.config.ts or .js, as the htmlkit command would, so its plugins compose with Markupress.
const withConfig = async (options: MarkupressOptions) => siteOptions(options, await loadConfig(resolve(options.root ?? process.cwd())));
export async function buildSite(options: MarkupressOptions = {}): Promise<BuildResult> { return buildApplication(await withConfig(options)); }
export async function previewSite(options: MarkupressOptions = {}): Promise<ApplicationServer> { return previewApplication(await withConfig(options)); }
/** HTMLKit's watcher recompiles Markdown and reloads open pages after each edit. */
export async function devSite(options: MarkupressOptions = {}): Promise<ApplicationServer> { return devApplication(await withConfig(options)); }
