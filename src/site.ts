import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApplication, devApplication, loadConfig, previewApplication, type ApplicationOptions, type ApplicationServer, type BuildResult, type MarkupKitPlugin,
  type LoadContext, type NavigationItem, type NavigationNode, type PagerLinks, type ServerOptions } from '@threadlabs/markupkit';
import { isIndex, type FrontMatter, type OutlineItem, type PagerLink, type SearchSection } from './content.js';
import { lastUpdated } from './git.js';
import { markdown } from './markdown.js';
import { footer, generatedSidebar, siteLink, type Link, type NavItem } from './navigation.js';
import { themeScript } from './theme.js';
import type { Syntax } from 'expressmark';
import { versionLinks } from './versions.js';
import type { LocalSearchOptions } from './search.js';

export interface DocumentationVersion {
  readonly id: string;
  readonly label?: string;
  readonly directory: string;
  /** Snapshot-owned public assets; active versions use the project's public directory. */
  readonly publicDir?: string;
}
export interface DocumentationLocale {
  readonly label: string;
  /** Content folder inside each version's directory; defaults to the locale ID. */
  readonly directory?: string;
  /** BCP 47 language tag; defaults to the locale ID. */
  readonly lang?: string;
  readonly dir?: 'ltr' | 'rtl' | 'auto';
}
export interface MarkupressOptions {
  /** Translated folders keyed by BCP 47 locale ID. Without this option, content stays directly in contentDir. */
  readonly locales?: Readonly<Record<string, DocumentationLocale>>;
  /** The locale served without a language prefix; defaults to the first configured locale. */
  readonly defaultLocale?: string;
  /** Local search matching options, or false to disable search and its generated indexes. */
  readonly search?: false | LocalSearchOptions;
  readonly root?: string;
  readonly contentDir?: string;
  readonly base?: string;
  /** The site's origin, such as https://example.com: MarkupKit writes `sitemap.xml` for it, and `robots.txt` links that sitemap. */
  readonly origin?: string;
  /** MarkupKit's `robots.txt`: true allows every crawler, and a string is the file's text. */
  readonly robots?: boolean | string;
  readonly outDir?: string;
  readonly title?: string;
  /** A removable status chip before search; dismissal emits markupress-header-notice-dismiss on window. */
  readonly headerNotice?: string;
  /** Tree disclosures (default), or category links with pages listed only in the current category. */
  readonly sidebarNavigation?: 'tree' | 'sections';
  readonly versions?: readonly DocumentationVersion[];
  readonly defaultVersion?: string;
  readonly host?: string;
  readonly port?: number;
  /** Number the lines of every highlighted code block unless its fence says `show-line-numbers=false`. */
  readonly lineNumbers?: boolean;
  /** The Markdown syntax of pages whose front matter sets no `markdownSyntax`: `standard` (the default) or `compatible`. */
  readonly markdownSyntax?: Syntax;
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
  /** The language of every page, as a BCP 47 tag such as `fr` or `pt-BR`: the document's `<html lang>`. */
  readonly lang?: string;
}
const optionNames = ['locales', 'defaultLocale', 'search', 'root', 'contentDir', 'base', 'origin', 'robots', 'outDir', 'title', 'headerNotice', 'sidebarNavigation', 'versions', 'defaultVersion', 'host', 'port', 'lineNumbers', 'markdownSyntax', 'logo', 'favicon', 'nav', 'editLink', 'titleTemplate', 'lang'];
export interface DocumentationPage {
  readonly locale?: string;
  readonly id: string;
  readonly version: string;
  readonly source: string;
  /** Application-relative URL in its locale and version, such as /fr/v/current/guide/install/. */
  readonly pathname: string;
}

type Edition = DocumentationVersion & { readonly locale: string; readonly prefix: string; readonly home: string; readonly language?: string; readonly direction?: 'ltr' | 'rtl' | 'auto' };
type Document = DocumentationPage & { readonly locale: string; readonly aliases: readonly string[]; readonly page: FrontMatter & { readonly title: string };
  readonly outline: readonly OutlineItem[]; readonly generated: boolean; readonly sections: readonly SearchSection[] };

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
// MarkupKit's css option is page-wide: Looma's :root tokens and its light/dark switch, and document defaults.
// A component's <style> is scoped to its own region, so these would never reach :root from the shell.
// theme.css also styles MarkupKit's built-in components, which no component's scoped style can reach.
const pageStyles = [...['tokens.css', 'theme-light.css', 'theme-dark.css'].map(file => fileURLToPath(import.meta.resolve(`@threadlabs/looma/${file}`))),
  own('styles/base.css'), own('theme/theme.css')];

/**
 * Versioned documentation as an MarkupKit plugin. Markdown pages come from the markdown plugin, and
 * MarkupKit routes them: each version's directory serves /v/<id>/, and the default version's also
 * serves the site root. Markupress keeps only the version catalog its switcher needs.
 */
export function markupress(options: MarkupressOptions = {}): MarkupKitPlugin {
  if (options.sidebarNavigation !== undefined && !['tree', 'sections'].includes(options.sidebarNavigation)) throw new Error('sidebarNavigation must be tree or sections.');
  const localSearch = options.search === false ? undefined : options.search === undefined ? {} : options.search;
  if (localSearch !== undefined) {
    if (localSearch === null || typeof localSearch !== 'object' || Array.isArray(localSearch)) throw new Error('search must be false or an object of local search options.');
    for (const key of Object.keys(localSearch)) if (!['limit', 'fuzzy', 'prefix'].includes(key)) throw new Error(`Unknown search option ${key}.`);
    if (localSearch.limit !== undefined && (!Number.isSafeInteger(localSearch.limit) || localSearch.limit < 1)) throw new Error('search.limit must be a positive whole number.');
    if (localSearch.fuzzy !== undefined && localSearch.fuzzy !== false && (typeof localSearch.fuzzy !== 'number' || !Number.isFinite(localSearch.fuzzy) || localSearch.fuzzy < 0 || localSearch.fuzzy > 1)) throw new Error('search.fuzzy must be false or a fraction between 0 and 1.');
    if (localSearch.prefix !== undefined && typeof localSearch.prefix !== 'boolean') throw new Error('search.prefix must be true or false.');
  }
  const searchOptions = { limit: localSearch?.limit ?? 20, fuzzy: localSearch?.fuzzy === false ? 0 : localSearch?.fuzzy ?? 0.2, prefix: localSearch?.prefix ?? true };
  const defaultVersion = options.defaultVersion ?? 'current';
  let root = resolve(options.root ?? process.cwd());
  let versionsList: readonly DocumentationVersion[] = [], editions: readonly Edition[] = [], siteBase = '/';
  const editionOf = (file: string) => editions.find(edition => inside(resolve(root, edition.directory), file));
  // Compiled documents by version and source file. MarkupKit recompiles every page when it rediscovers, so a
  // deleted file's stale entry is filtered by existence rather than cleared.
  const documents = new Map<string, Document>();
  const current = () => [...documents.values()].filter(doc => existsSync(doc.source));
  const pages = markdown({
    // Each Markdown page component imports the prose styles, so they style that page's region and nothing else.
    styles: [own('styles/prose.css')],
    ...(options.lineNumbers === undefined ? {} : { lineNumbers: options.lineNumbers }),
    ...(options.markdownSyntax === undefined ? {} : { markdownSyntax: options.markdownSyntax }),
    publicDir: file => resolve(root, editionOf(file)?.publicDir ?? 'public'),
    documentTitle(file, title) {
      const site = options.title ?? 'Documentation', edition = editionOf(file);
      // A version's home page is the site's own page.
      if (edition && isIndex(file) && dirname(file) === resolve(root, edition.directory)) return site;
      const template = options.titleTemplate ?? `:title | ${site}`;
      return template === false ? title : template.replaceAll(':title', title);
    },
    // A root-relative link is a page of the version the file belongs to.
    home: file => { const edition = editionOf(file); return edition ? siteBase + edition.prefix.slice(1) : siteBase; },
    onPage(page) {
      const owners = editions.filter(edition => inside(resolve(root, edition.directory), page.file));
      if (owners.length === 0 || page.href === undefined) return;
      // The page's URL is in the first version that serves its directory; others serve the same path.
      const first = siteBase + owners[0]!.prefix.slice(1);
      const path = page.href.slice(first.length);
      const id = page.id ?? (path.slice(0, -1) || 'index');
      for (const edition of owners) {
        const twin = current().find(doc => doc.source !== page.file && doc.version === edition.id && doc.locale === edition.locale && doc.id === id);
        if (twin) throw new Error(`Documentation identity collision: ${twin.source} and ${page.file} (${id}).`);
        documents.set(`${edition.locale}\0${edition.id}\0${page.file}`, { id, locale: edition.locale, version: edition.id, source: page.file, pathname: `${edition.prefix}${path}`,
          aliases: page.aliases.map(alias => edition.prefix + alias.slice(1)), outline: page.outline, generated: page.generated, sections: page.sections,
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
  async function load({ navigation, navigationTree, breadcrumbs, pager, url, base, propNames }: LoadContext, contentLocale?: string) {
    const path = '/' + url.pathname.slice(base.length);
    const explicit = editions.find(edition => path.startsWith(edition.prefix));
    const edition = explicit ?? editions.filter(edition => edition.id === defaultVersion && path.startsWith(edition.home))
      .sort((a, b) => b.home.length - a.home.length)[0]!;
    const selected = edition.id;
    const requested = explicit ? path : edition.prefix + path.slice(edition.home.length);
    const all = current();
    const catalog = all.filter(doc => doc.locale === edition.locale);
    const page = catalog.find(doc => doc.pathname === requested || doc.aliases.includes(requested));
    // The default version also serves the root; its entries are marked current under /v/<id>/.
    const within = { from: edition.prefix, current: base + (page?.pathname ?? requested).slice(1) };
    const items = await navigation(within);
    // The version's search index is served beside its pages: under /v/<id>/, or at the root for the default version there.
    const sidebarDefault = catalog.filter(doc => doc.version === selected && isIndex(doc.source) &&
      (page?.pathname ?? requested).startsWith(doc.pathname) && doc.page.sidebar !== undefined)
      .sort((a, b) => b.pathname.length - a.pathname.length)[0]?.page.sidebar;
    const data: Record<string, unknown> = { sidebarVisible: page?.page.sidebar ?? sidebarDefault ?? true, title: options.title ?? 'Documentation', home: base + edition.home.slice(1), navigation: items,
      search: options.search === false ? '' : base + (explicit ? edition.prefix : edition.home).slice(1) + '_search.json', searchOptions,
      ...await chrome(items, navigationTree, catalog.filter(doc => doc.version === selected), edition, within.current, base),
      versions: versionLinks(catalog, versionsList.map(version => ({ ...version, pathname: editions.find(entry => entry.id === version.id && entry.locale === edition.locale)!.prefix })), page?.id ?? 'index', selected, base),
      locales: Object.entries(options.locales ?? {}).map(([id, locale]) => {
        const targetEdition = editions.find(entry => entry.id === selected && entry.locale === id)!;
        const target = all.find(doc => doc.locale === id && doc.version === selected && doc.id === (page?.id ?? 'index'));
        return { label: locale.label, lang: locale.lang ?? id, href: base + (target?.pathname ?? targetEdition.prefix).slice(1),
          current: id === edition.locale ? 'page' : 'false', note: target ? '' : `This document is unavailable in ${locale.label}; open its documentation home.` };
      }),
      crumbs: await breadcrumbs(within), ...pagerLinks(await pager(within), page?.page), outline: page?.outline ?? [], page: page ? await pageData(page) : {},
      contents: page?.generated ? contents(await navigationTree({ ...within, from: page.pathname }), catalog, base, within.current) : [] };
    // MarkupKit rejects props a layout does not declare, so a layout receives the data its contract names, and
    // nested folder layouts' loaders read all of it from parent.markupress.
    // The page's language, else the site's, is the document's <html lang>.
    // MarkupKit serves one global 404 from the default locale, even for another locale's URL.
    const contentEdition = contentLocale === undefined ? edition : editions.find(entry => entry.locale === contentLocale && entry.id === selected) ?? edition;
    const lang = page?.page.lang ?? contentEdition.language ?? options.lang;
    const dir = contentEdition.direction;
    return { props: Object.fromEntries(propNames.filter(name => name in data).map(name => [name, data[name]])), data: { markupress: data },
      ...((lang === undefined && dir === undefined) ? {} : { head: { ...(lang === undefined ? {} : { lang }), ...(dir === undefined ? {} : { dir }) } }) };
  }
  /**
   * A version's search index: each section of its pages, linked under the path the index is served at, so a reader at
   * the site root finds the root's pages. MarkupKit routes no file whose name starts with `_`, so the path is free.
   */
  function searchIndex(edition: Edition, served: string, base: string): string {
    const own = edition.prefix;
    return JSON.stringify(current().filter(doc => doc.version === edition.id && doc.locale === edition.locale && doc.page.search !== false).flatMap(doc => {
      const href = base + served.slice(1) + doc.pathname.slice(own.length);
      return doc.sections.map(section => ({ page: doc.page.title, heading: section.heading || doc.page.title,
        href: section.id ? `${href}#${section.id}` : href, text: section.text }));
    }));
  }
  /** The shell around the page: the sections and links of the top navigation, logo, badge, the section's sidebar and the footer. */
  async function chrome(items: readonly NavigationItem[], navigationTree: LoadContext['navigationTree'], pages: readonly (DocumentationPage & { readonly page: FrontMatter })[], edition: Edition, current: string, base: string) {
    const home = base + edition.prefix.slice(1);
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
    const sections = (await navigationTree({ from: edition.prefix, current })).filter(node => node.href !== undefined && node.children.length > 0);
    // Pages recompile after each edit, so a folder's collapsed state follows its index page in development.
    const folded = new Set(pages.filter(doc => doc.page.navigation === 'collapsed').map(doc => base + doc.pathname.slice(1)));
    const collapsed = (page: string) => folded.has(page);
    const overviews = new Set(pages.filter(doc => doc.page.navigation === 'overview').map(doc => base + doc.pathname.slice(1)));
    const versions = versionsList.length > 1 ? edition : undefined;
    const { columns, copyright } = footer(resolve(root, edition.directory, '_footer.md'));
    return {
      sidebar: generatedSidebar(await navigationTree({ from: edition.prefix + section.slice(1), current }), collapsed, options.sidebarNavigation, overviews),
      sidebarNavigation: options.sidebarNavigation ?? 'tree',
      nav: [...sections.map(node => ({ ...link({ label: node.label, href: '/' + node.href!.slice(home.length) }), icon: '' })),
        ...(options.nav ?? []).map(entry => ({ ...link(entry), icon: entry.icon === undefined ? '' : file(entry.icon) }))],
      logo: logo === undefined ? null : { light: file(logo.light), dark: file(logo.dark ?? logo.light) },
      favicon: favicon === undefined ? null : file(favicon),
      badge: versions ? versions.label ?? versions.id : '',
      headerNotice: options.headerNotice ?? '',
      footer: { columns: columns.map(column => ({ title: column.title, items: column.items.map(link) })), copyright },
    };
  }
  // Config is plain data, so an option from another tool, or a removed one, fails rather than doing nothing.
  for (const name of Object.keys(options)) if (!optionNames.includes(name)) throw new Error(`Unknown Markupress option ${name}. Options are ${optionNames.join(', ')}.`);
  if (typeof options.titleTemplate === 'string' && !options.titleTemplate.includes(':title')) throw new Error(`The titleTemplate option places each page's title with :title: ${options.titleTemplate}.`);
  if (options.markdownSyntax !== undefined && options.markdownSyntax !== 'standard' && options.markdownSyntax !== 'compatible') throw new Error(`The markdownSyntax option is standard or compatible: ${String(options.markdownSyntax)}.`);
  if (options.lang !== undefined && !/^[A-Za-z]{2,8}(?:-[A-Za-z\d]{1,8})*$/.test(options.lang)) throw new Error(`The lang option is a language tag such as fr or pt-BR: ${options.lang}.`);
  if (options.editLink !== undefined && !options.editLink.endsWith('/')) throw new Error(`The editLink option ends in /, and each page's path in the project follows it: ${options.editLink}.`);
  return { ...pages, name: 'markupress',
    // Each version's search index beside its pages, and the default version's at the root too. MarkupKit runs this once
    // every page has compiled, and again in development after each change.
    generate: ({ base }) => options.search === false ? {} : Object.fromEntries(editions.flatMap(edition => [[edition.prefix + '_search.json', searchIndex(edition, edition.prefix, base)],
      ...(edition.id === defaultVersion ? [[edition.home + '_search.json', searchIndex(edition, edition.home, base)]] : [])])),
    async config(markupkit) {
    root = resolve(markupkit.root ?? root); siteBase = markupkit.base ?? '/';
    // Conventions first: public/logo.svg, public/logo-dark.svg and public/favicon.svg, which the options override.
    const own = (name: string) => existsSync(join(root, 'public', name)) ? `/${name}` : undefined;
    const light = own('logo.svg');
    logo = typeof options.logo === 'string' ? { light: options.logo } : options.logo ?? (light === undefined ? undefined : { light, dark: own('logo-dark.svg') ?? light });
    favicon = options.favicon ?? own('favicon.svg');
    versionsList = await versions(options, root);
    if (options.locales !== undefined && (!options.locales || typeof options.locales !== 'object' || Array.isArray(options.locales))) throw new Error('locales must be an object keyed by locale IDs.');
    const locales = Object.entries(options.locales ?? {});
    if (options.locales !== undefined && locales.length === 0) throw new Error('locales must contain at least one locale.');
    const defaultLocale = options.defaultLocale ?? locales[0]?.[0] ?? '';
    if ((options.defaultLocale !== undefined || locales.length) && !locales.some(([id]) => id === defaultLocale)) throw new Error(`Unknown defaultLocale: ${defaultLocale}.`);
    for (const [id, locale] of locales) {
      if (!/^[A-Za-z]{2,8}(?:-[A-Za-z\d]{1,8})*$/.test(id)) throw new Error(`Invalid locale ID: ${id}.`);
      if (!locale || typeof locale !== 'object' || typeof locale.label !== 'string' || !locale.label.trim()) throw new Error(`Locale ${id} needs a label.`);
      for (const key of Object.keys(locale)) if (!['label', 'directory', 'lang', 'dir'].includes(key)) throw new Error(`Unknown locale option ${id}.${key}.`);
      if (locale.lang !== undefined && !/^[A-Za-z]{2,8}(?:-[A-Za-z\d]{1,8})*$/.test(locale.lang)) throw new Error(`Invalid language tag for locale ${id}.`);
      if (locale.dir !== undefined && !['ltr', 'rtl', 'auto'].includes(locale.dir)) throw new Error(`Invalid direction for locale ${id}.`);
      if (locale.directory !== undefined && (typeof locale.directory !== 'string' || !locale.directory)) throw new Error(`Invalid directory for locale ${id}.`);
    }
    editions = versionsList.flatMap(version => (locales.length ? locales : [['', undefined] as const]).map(([id, locale]) => {
      const home = id === defaultLocale || !id ? '/' : `/${id}/`;
      const directory = locale ? join(version.directory, locale.directory ?? id) : version.directory;
      if (!inside(resolve(root, version.directory), resolve(root, directory))) throw new Error(`Locale ${id}: directory must stay inside its version.`);
      return { ...version, directory, locale: id, home, prefix: `${home}v/${version.id}/`,
        ...(locale ? { language: locale.lang ?? id, ...(locale.dir === undefined ? {} : { direction: locale.dir }) } : {}) };
    }));
    for (const edition of editions) {
      const overlap = editions.find(other => other.locale !== edition.locale && inside(resolve(root, edition.directory), resolve(root, other.directory)));
      if (overlap) throw new Error(`Locale directories overlap: ${edition.directory} (${edition.locale}) and ${overlap.directory} (${overlap.locale}).`);
    }
    // One git log dates every page, read once per build or development server.
    updated = lastUpdated(root, editions.map(edition => edition.directory));
    const ids = new Set<string>();
    for (const edition of editions) {
      if (!/^[A-Za-z0-9_-]+$/.test(edition.id) || ids.has(`${edition.locale}\0${edition.id}`)) throw new Error(`Duplicate or invalid documentation version: ${edition.id}.`);
      ids.add(`${edition.locale}\0${edition.id}`);
      const content = resolve(root, edition.directory);
      if (!inside(root, content)) throw new Error(`Version ${edition.id}: directory must be inside the project.`);
      if (!(await readdir(content)).some(isIndex)) throw new Error(`Version ${edition.id}: a root index.md landing page is required.`);
    }
    const homes = editions.filter(edition => edition.id === defaultVersion);
    if (homes.length === 0) throw new Error(`Unknown defaultVersion: ${defaultVersion}.`);
    const same = (a: DocumentationVersion, b: DocumentationVersion) => resolve(root, a.directory) === resolve(root, b.directory);
    // The shell is the layout of Markupress's own folders only, so a site's other pages keep theirs. A site's
    // app/layouts/default.html, which MarkupKit gives its other pages, replaces the shell and receives its loader data.
    const replacement = join(root, 'app/layouts/default.html');
    layoutFile = existsSync(replacement) ? replacement : shell;
    const layout = (edition: Edition) => ({ component: layoutFile, server: { load: (context: LoadContext) => load(context, edition.locale) } });
    // layout: home names this layout; a site's app/layouts/home.html takes its place, as MarkupKit resolves a name.
    return { headScript: themeScript, css: pageStyles, layouts: { home: { component: homeLayout, server: { load } } },
      // The root serves the default version's folder as its own; every further mount of a folder, the default's
      // /v/<id>/ included, is an alias, so its pages name the first as canonical and stay out of the sitemap.
      pages: [...editions.map((edition, index) => ({ dir: edition.directory, prefix: edition.prefix, layout: layout(edition),
        ...(homes.some(home => same(edition, home)) || editions.slice(0, index).some(earlier => same(earlier, edition)) ? { alias: true } : {}) })), ...homes.map(home => ({ dir: home.directory, prefix: home.home, layout: layout(home) }))] };
  } };
}

/**
 * The pager's links, which a page's `previous` and `next` front matter drop (`false`) or relabel and retarget. A link
 * the pager has none for needs an `href`.
 */
function pagerLinks(links: PagerLinks, page: FrontMatter | undefined): { previous?: NavigationItem; next?: NavigationItem } {
  const link = (own: PagerLink | undefined, computed: NavigationItem | undefined) => {
    if (own === undefined) return computed;
    if (own === false || (computed === undefined && own.href === undefined)) return undefined;
    return { ...computed ?? { current: 'false' as const, depth: 0, pageName: '' }, label: own.label ?? computed?.label ?? own.href!, href: own.href ?? computed!.href };
  };
  const previous = link(page?.previous, links.previous), next = link(page?.next, links.next);
  return { ...(previous ? { previous } : {}), ...(next ? { next } : {}) };
}

/**
 * A generated index's entries: the pages and folders directly in its folder, from MarkupKit's navigation tree below
 * the index page, each with its page's description. A folder without an index page (a route group) adds its pages.
 */
function contents(tree: readonly NavigationNode[], catalog: readonly (DocumentationPage & { readonly page: FrontMatter })[], base: string, self: string) {
  const descriptions = new Map(catalog.map(doc => [base + doc.pathname.slice(1), doc.page.description ?? '']));
  const entries = (nodes: readonly NavigationNode[]): { label: string; href: string; description: string }[] => nodes.flatMap(node =>
    node.href === undefined ? entries(node.children) : node.href === self ? [] : [{ label: node.label, href: node.href, description: descriptions.get(node.href) ?? '' }]);
  return entries(tree);
}

/**
 * MarkupKit options for a Markupress site, as the CLI runs it: the site's own MarkupKit options (its `markupkit.config.ts`)
 * with `markupress()` added after their plugins. Markupress's own `base`, `origin`, `robots` and `outDir`, when set, win over MarkupKit's.
 */
export function siteOptions(options: MarkupressOptions = {}, markupkit: ApplicationOptions = {}): ServerOptions {
  const root = resolve(options.root ?? markupkit.root ?? process.cwd());
  // markupress() already holds the markdown() plugin's pages; a second copy of either would compile .md twice.
  const listed = markupkit.plugins?.find(plugin => plugin.name === 'markupress' || plugin.name === 'markdown');
  if (listed) throw new Error(`markupkit.config: the markupress command adds markupress(), which includes markdown(); remove ${listed.name}() from its plugins.`);
  return { ...markupkit, root, base: options.base ?? markupkit.base ?? '/', outDir: resolve(root, options.outDir ?? markupkit.outDir ?? 'site'),
    plugins: [...markupkit.plugins ?? [], markupress({ ...options, root })],
    ...(options.origin === undefined ? {} : { origin: options.origin }), ...(options.robots === undefined ? {} : { robots: options.robots }),
    ...(options.host === undefined ? {} : { host: options.host }), ...(options.port === undefined ? {} : { port: options.port }) };
}
// Each loads the site's markupkit.config.ts or .js, as the markupkit command would, so its plugins compose with Markupress.
const withConfig = async (options: MarkupressOptions) => siteOptions(options, await loadConfig(resolve(options.root ?? process.cwd())));
export async function buildSite(options: MarkupressOptions = {}): Promise<BuildResult> { return buildApplication(await withConfig(options)); }
export async function previewSite(options: MarkupressOptions = {}): Promise<ApplicationServer> { return previewApplication(await withConfig(options)); }
/** MarkupKit's watcher recompiles Markdown and reloads open pages after each edit. */
export async function devSite(options: MarkupressOptions = {}): Promise<ApplicationServer> { return devApplication(await withConfig(options)); }
