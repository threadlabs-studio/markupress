import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApplication, devApplication, loadConfig, previewApplication, type ApplicationOptions, type ApplicationServer, type BuildResult, type MarkupKitPlugin,
  type LoadContext, type PageContext, type PageSource, type NavigationItem, type NavigationNode, type PagerLinks, type ServerOptions } from '@threadlabs/markupkit';
import { formatMessage, resolveTranslations, textDirection, type TranslationOverrides, type Translations } from './i18n.js';
import { readFrontMatter, isIndex, type FrontMatter, type OutlineItem, type PagerLink, type SearchSection } from './content.js';
import { lastUpdated } from './git.js';
import { compilePage, markdown } from './markdown.js';
import { editionScope, localeSources, type LocaleSource } from './locale-sources.js';
import { footer, generatedSidebar, siteLink, type Link, type NavItem, type SidebarNode } from './navigation.js';
import { themeScript } from './theme.js';
import type { Syntax } from 'expressmark';
import { versionLinks } from './versions.js';
import { configureSearch, type SearchOptions } from './search-config.js';
import { algoliaOrigin, type HostedSearch } from './algolia.js';
import { algoliaRecords } from './search-records.js';
import { hostedPolicy } from './search-policy.js';

export interface DocumentationVersion {
  readonly id: string;
  readonly label?: string;
  readonly directory: string;
  /** Snapshot-owned public assets; active versions use the project's public directory. */
  readonly publicDir?: string;
}
export interface DocumentationLocale extends Pick<MarkupressOptions, 'title' | 'nav' | 'logo' | 'favicon' | 'titleTemplate' | 'headerNotice' | 'translations' | 'dateFormat'> {
  readonly editLink?: string | false;
  readonly label: string;
  /** Content folder inside each version's directory; defaults to the locale ID. */
  readonly directory?: string;
  /** BCP 47 language tag; defaults to the locale ID. */
  readonly lang?: string;
  readonly dir?: 'ltr' | 'rtl' | 'auto';
}
export interface MarkupressOptions {
  /** Partial reader-string overrides; locale overrides apply after these. */
  readonly translations?: TranslationOverrides;
  /** Visible last-updated dates use these native Intl options, with UTC as the default time zone. */
  readonly dateFormat?: Intl.DateTimeFormatOptions;
  /** Translated folders keyed by BCP 47 locale ID. Without this option, content stays directly in contentDir. */
  readonly locales?: Readonly<Record<string, DocumentationLocale>>;
  /** The locale served without a language prefix; defaults to the first configured locale. */
  readonly defaultLocale?: string;
  /** Serve missing translations from the default locale, or retain locale-home switching (the default). */
  readonly localeFallback?: 'source' | 'home';
  /** Local matching options or an Algolia provider, or false to disable search and generated indexes. */
  readonly search?: false | SearchOptions;
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
  /** Serve pages whose front matter sets `draft: true`: in `markupress dev` by default, and left out of a build. */
  readonly drafts?: boolean;
}
const optionNames = ['translations', 'dateFormat', 'locales', 'defaultLocale', 'localeFallback', 'search', 'root', 'contentDir', 'base', 'origin', 'robots', 'outDir', 'title', 'headerNotice', 'sidebarNavigation', 'versions', 'defaultVersion', 'host', 'port', 'lineNumbers', 'markdownSyntax', 'logo', 'favicon', 'nav', 'editLink', 'titleTemplate', 'lang', 'drafts'];
export interface DocumentationPage {
  readonly locale?: string;
  readonly id: string;
  readonly version: string;
  readonly source: string;
  /** Application-relative URL in its locale and version, such as /fr/guide/install/ or /fr/v/1.2.3/guide/install/. */
  readonly pathname: string;
}

type Edition = DocumentationVersion & { readonly locale: string; readonly prefix: string; readonly home: string; readonly language?: string; readonly direction?: 'ltr' | 'rtl' | 'auto' };
type Document = DocumentationPage & { readonly locale: string; readonly fallback?: boolean; readonly aliases: readonly string[]; readonly page: FrontMatter & { readonly title: string };
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
 * MarkupKit routes them: the default version serves the site root and historical versions
 * serve /v/<id>/. Markupress keeps only the version catalog its switcher needs.
 */
export function markupress(options: MarkupressOptions = {}): MarkupKitPlugin {
  if (options.sidebarNavigation !== undefined && !['tree', 'sections'].includes(options.sidebarNavigation)) throw new Error('sidebarNavigation must be tree or sections.');
  const searchConfiguration = configureSearch(options.search), searchOptions = searchConfiguration.local;
  if (options.localeFallback !== undefined && options.localeFallback !== 'source' && options.localeFallback !== 'home') throw new Error('localeFallback must be source or home.');
  const sourceFallback = options.localeFallback === 'source' && options.locales !== undefined;
  const defaultVersion = options.defaultVersion ?? 'current';
  let root = resolve(options.root ?? process.cwd());
  let versionsList: readonly DocumentationVersion[] = [], editions: readonly Edition[] = [], siteBase = '/', siteOrigin: string | undefined;
  const editionOf = (file: string) => editions.find(edition => inside(resolve(root, edition.directory), file));
  const localeOf = (edition: Edition | undefined) => options.locales?.[edition?.locale ?? ''];
  const uiLanguage = (edition: Edition | undefined) => edition?.language ?? options.lang ?? 'en';
  const messagesOf = (edition: Edition | undefined) => resolveTranslations(uiLanguage(edition), options.translations, localeOf(edition)?.translations);
  // Compiled documents by version and source file. A native source-catalog generation starts a fresh set;
  // existence checks also exclude deleted files while a development rediscovery is pending.
  const documents = new Map<string, Document>();
  let discovered: readonly PageSource[] | undefined;
  type TranslationSource = { readonly source: string; readonly id: string; readonly locale: string; readonly version: string; readonly href: string };
  const translationCatalogs = new WeakMap<readonly PageSource[], Promise<readonly TranslationSource[]>>();
  async function translationSources(context: PageContext): Promise<readonly TranslationSource[]> {
    const mounts = new Map<string, PageSource[]>();
    for (const source of context.pages) if (source.file.endsWith('.md')) {
      const previous = mounts.get(source.file) ?? []; previous.push(source); mounts.set(source.file, previous);
    }
    const catalog: TranslationSource[] = [];
    for (const [file, sources] of mounts) {
      const owners = sources.filter(source => source.aliasOf === undefined);
      // A physical page compiles once. Only one owning URL gives it an unambiguous reciprocal head;
      // directory aliases share that head, while separate versions normally have separate source files.
      if (owners.length !== 1) continue;
      const source = owners[0]!;
      const edition = editions.find(edition => inside(resolve(root, edition.directory), file) &&
        source.href.startsWith(siteBase + (edition.id === defaultVersion ? edition.home : edition.prefix).slice(1)));
      if (edition === undefined) continue;
      context.watch(file);
      const fields = readFrontMatter(await readFile(file, 'utf8'), file);
      const home = siteBase + (edition.id === defaultVersion ? edition.home : edition.prefix).slice(1);
      const path = source.href.slice(home.length);
      catalog.push({ source: file, id: fields.id ?? (path.slice(0, -1) || 'index'), locale: edition.locale, version: edition.id,
        href: new URL(fields.head?.canonical ?? source.href, new URL(source.href, siteOrigin)).href });
    }
    return catalog;
  }
  const scopedCatalogs = new WeakMap<readonly PageSource[], Promise<readonly LocaleSource[]>>();
  const scopedCatalog = (sources: readonly PageSource[]) => {
    let pending = scopedCatalogs.get(sources);
    if (pending === undefined) { pending = localeSources(sources, editions, root, siteBase, siteOrigin); scopedCatalogs.set(sources, pending); }
    return pending;
  };
  const current = () => [...documents.values()].filter(doc => existsSync(doc.source));
  let drafts = options.drafts ?? true;
  const published = async (file: string) => drafts || !file.endsWith('.md') || readFrontMatter(await readFile(file, 'utf8'), file).draft !== true;
  const pages = markdown({
    // Each Markdown page component imports the prose styles, so they style that page's region and nothing else.
    styles: [own('styles/prose.css')],
    ...(options.lineNumbers === undefined ? {} : { lineNumbers: options.lineNumbers }),
    ...(options.markdownSyntax === undefined ? {} : { markdownSyntax: options.markdownSyntax }),
    publicDir: file => resolve(root, editionOf(file)?.publicDir ?? 'public'),
    translations: file => messagesOf(editionOf(file)),
    async alternates(context) {
      if (siteOrigin === undefined || options.locales === undefined) return [];
      let pending = translationCatalogs.get(context.pages);
      if (pending === undefined) { pending = translationSources(context); translationCatalogs.set(context.pages, pending); }
      const catalog = await pending, source = catalog.find(page => page.source === context.file);
      if (source === undefined) return [];
      const counterparts = catalog.filter(page => page.id === source.id && page.version === source.version);
      const links = Object.entries(options.locales).flatMap(([id, locale]) => {
        const target = counterparts.find(page => page.locale === id);
        return target ? [{ hreflang: locale.lang ?? id, href: target.href }] : [];
      });
      const defaultLocale = options.defaultLocale ?? Object.keys(options.locales)[0];
      const fallback = counterparts.find(page => page.locale === defaultLocale);
      return fallback ? [...links, { hreflang: 'x-default', href: fallback.href }] : links;
    },
    frontmatter: file => {
      const edition = editionOf(file), lang = edition?.language ?? options.lang, dir = localeOf(edition)?.dir;
      return lang === undefined && dir === undefined ? undefined : { ...(lang === undefined ? {} : { lang }), ...(dir === undefined ? {} : { dir }) };
    },
    documentTitle(file, title) {
      const edition = editionOf(file), locale = localeOf(edition);
      const site = locale?.title ?? options.title ?? messagesOf(edition).documentation;
      // A version's home page is the site's own page.
      if (edition && isIndex(file) && dirname(file) === resolve(root, edition.directory)) return site;
      const template = locale?.titleTemplate ?? options.titleTemplate ?? `:title | ${site}`;
      return template === false ? title : template.replaceAll(':title', title);
    },
    // A root-relative link is a page of the version the file belongs to.
    home: file => { const edition = editionOf(file); return edition ? siteBase + edition.prefix.slice(1) : siteBase; },
    onPage(page, context) {
      // A rediscovery can swap identities between surviving files; old entries cannot participate.
      if (discovered !== context.pages) { documents.clear(); discovered = context.pages; }
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
  async function compileScoped(source: string, context: PageContext): Promise<string> {
    const edition = editions.find(edition => editionScope(edition) === context.scope);
    if (!sourceFallback || edition === undefined) return pages.pages!.compile(source, context);
    const catalog = await scopedCatalog(context.pages);
    for (const page of catalog) context.watch(page.file);
    const physical = catalog.find(page => page.file === context.file && page.edition.id === edition.id);
    if (physical === undefined) return pages.pages!.compile(source, context);
    const fallback = physical.edition.locale !== edition.locale;
    const original = editions.find(entry => editionScope(entry) === editionScope(physical.edition))!;
    const lang = original.language ?? options.lang;
    const dir = localeOf(original)?.dir;
    const localized: PageContext = { ...context, href(target) {
      const document = catalog.find(page => page.file === target && page.edition.id === edition.id);
      const translation = document === undefined ? undefined : catalog.find(page => page.id === document.id && page.edition.id === edition.id && page.edition.locale === edition.locale);
      return context.href(translation?.file ?? target);
    } };
    const ui = messagesOf(edition), locale = localeOf(edition);
    const counterparts = catalog.filter(page => page.id === physical.id && page.edition.id === edition.id);
    const alternates = siteOrigin === undefined ? [] : Object.entries(options.locales ?? {}).flatMap(([id, locale]) => {
      const target = counterparts.find(page => page.edition.locale === id);
      return target ? [{ hreflang: locale.lang ?? id, href: target.canonical }] : [];
    });
    const defaultLocale = options.defaultLocale ?? Object.keys(options.locales ?? {})[0];
    const defaultSource = counterparts.find(page => page.edition.locale === defaultLocale);
    if (siteOrigin !== undefined && defaultSource) alternates.push({ hreflang: 'x-default', href: defaultSource.canonical });
    return compilePage(source, localized, {
      styles: [own('styles/prose.css')],
      ...(options.lineNumbers === undefined ? {} : { lineNumbers: options.lineNumbers }),
      ...(options.markdownSyntax === undefined ? {} : { markdownSyntax: options.markdownSyntax }),
      publicDir: () => resolve(root, original.publicDir ?? 'public'),
      translations: () => ui,
      frontmatter: () => ({ ...(lang === undefined ? {} : { lang }), ...(dir === undefined ? {} : { dir }) }),
      alternates: () => alternates,
      documentTitle(_file, title) {
        const site = locale?.title ?? options.title ?? ui.documentation;
        if (isIndex(context.file) && dirname(context.file) === resolve(root, original.directory)) return site;
        const template = locale?.titleTemplate ?? options.titleTemplate ?? `:title | ${site}`;
        return template === false ? title : template.replaceAll(':title', title);
      },
      home: () => siteBase + edition.prefix.slice(1),
      onPage(page) {
        if (discovered !== context.pages) { documents.clear(); discovered = context.pages; }
        documents.set(`${edition.locale}\0${edition.id}\0${page.file}`, { id: physical.id, locale: edition.locale, version: edition.id, source: page.file,
          ...(fallback ? { fallback: true } : {}), pathname: edition.prefix + physical.path,
          aliases: page.aliases.map(alias => edition.prefix + alias.slice(1)), outline: page.outline, generated: page.generated, sections: page.sections,
          page: { ...page.frontmatter, id: physical.id, title: page.title } });
      },
    }, siteBase, { canonical: physical.canonical, uiLanguage: uiLanguage(edition) });
  }
  let layoutFile = shell;
  let logo: { readonly light: string; readonly dark?: string } | undefined, favicon: string | undefined;
  let updated: Promise<ReadonlyMap<string, string>> = Promise.resolve(new Map());
  /** The page's front matter, with its resolved edit link and the date its file last changed in git. */
  async function pageData(doc: Document) {
    const file = relative(root, doc.source).split(sep).join('/');
    const { editLink, ...page } = doc.page;
    const edition = editions.find(edition => edition.id === doc.version && edition.locale === doc.locale), locale = localeOf(edition);
    const editBase = locale?.editLink ?? options.editLink;
    const edit = editLink ?? (editBase === undefined || editBase === false ? false : editBase + encodeURI(file));
    const date = (await updated).get(file);
    const dateFormat = locale?.dateFormat ?? options.dateFormat ?? { dateStyle: 'long' };
    return { ...page, ...(edit === false ? {} : { editLink: edit }), ...(date === undefined ? {} : { lastUpdated: date,
      lastUpdatedText: new Intl.DateTimeFormat(uiLanguage(edition), { timeZone: 'UTC', ...dateFormat }).format(new Date(date)) }) };
  }
  async function load({ navigation, navigationTree, breadcrumbs, pager, url, base, propNames }: LoadContext, contentLocale?: string) {
    const path = '/' + url.pathname.slice(base.length);
    const edition = editions.filter(edition => path.startsWith(edition.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0]!;
    const selected = edition.id, locale = localeOf(edition), ui = messagesOf(edition);
    const requested = path;
    const all = current();
    const catalog = all.filter(doc => doc.locale === edition.locale);
    const page = catalog.find(doc => doc.pathname === requested || doc.aliases.includes(requested));
    // Current entries and historical entries use their own mounted paths.
    const within = { from: edition.prefix, current: base + (page?.pathname ?? requested).slice(1),
      exclude: editions.filter(other => other !== edition && other.prefix.startsWith(edition.prefix)).map(other => other.prefix) };
    const items = await navigation(within);
    // The version's search index is served beside its pages: under /v/<id>/, or at the root for the default version there.
    const sidebarDefault = catalog.filter(doc => doc.version === selected && isIndex(doc.source) &&
      (page?.pathname ?? requested).startsWith(doc.pathname) && doc.page.sidebar !== undefined)
      .sort((a, b) => b.pathname.length - a.pathname.length)[0]?.page.sidebar;
    const hosted: HostedSearch | null = searchConfiguration.algolia === undefined ? null : {
      ...searchConfiguration.algolia, language: edition.locale || uiLanguage(edition), version: edition.id, base,
      home: base + edition.home.slice(1), prefix: base + edition.prefix.slice(1), defaultVersion: edition.id === defaultVersion,
      excludedHomes: [...new Set(editions.filter(other => other.home !== edition.home && other.home.startsWith(edition.home)).map(other => base + other.home.slice(1)))],
      origin: siteOrigin ?? '',
    };
    const data: Record<string, unknown> = { fallbackNotice: page?.fallback ? formatMessage(ui.untranslatedContent, { locale: locale?.label ?? edition.locale }) : '', sidebarVisible: page?.page.sidebar ?? sidebarDefault ?? true, title: locale?.title ?? options.title ?? ui.documentation, ui, uiLang: uiLanguage(edition), home: base + edition.home.slice(1), navigation: items,
      hosted, search: !searchConfiguration.enabled ? '' : base + edition.prefix.slice(1) + '_search.json', searchOptions,
      ...await chrome(items, navigationTree, catalog.filter(doc => doc.version === selected), edition, within.current, base),
      versions: versionLinks(catalog, versionsList.map(version => ({ ...version, ...(options.versions === undefined && version.id === 'current' ? { label: ui.currentVersion } : {}), pathname: editions.find(entry => entry.id === version.id && entry.locale === edition.locale)!.prefix })), page?.id ?? 'index', selected, base, version => formatMessage(ui.versionUnavailable, { version })),
      locales: Object.entries(options.locales ?? {}).flatMap(([id, locale]) => {
        const target = all.find(doc => doc.locale === id && doc.version === selected && doc.id === page?.id && !doc.fallback);
        return target ? [{ label: locale.label, lang: locale.lang ?? id, href: base + target.pathname.slice(1),
          current: id === edition.locale ? 'page' : 'false', note: '' }] : [];
      }),
      crumbs: await breadcrumbs(within), ...pagerLinks(await pager(within), page?.page), outline: page?.outline ?? [], page: page ? await pageData(page) : {},
      contents: page?.generated ? contents(await navigationTree({ ...within, from: page.pathname }), catalog, base, within.current) : [] };
    // MarkupKit rejects props a layout does not declare, so a layout receives the data its contract names, and
    // nested folder layouts' loaders read all of it from parent.markupress.
    // Fallback chrome uses the selected locale; the compiled article retains its source language.
    // MarkupKit serves one global 404 from the default locale, even for another locale's URL.
    const contentEdition = contentLocale === undefined ? edition : editions.find(entry => entry.locale === contentLocale && entry.id === selected) ?? edition;
    const lang = page?.fallback ? uiLanguage(edition) : page?.page.lang ?? contentEdition.language ?? options.lang;
    const dir = page?.fallback ? edition.direction : page?.page.dir ?? localeOf(contentEdition)?.dir ?? (page?.page.lang ? textDirection(page.page.lang) : contentEdition.direction);
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
    const home = base + edition.prefix.slice(1), locale = localeOf(edition), ui = messagesOf(edition);
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
    const excluded = editions.filter(other => other !== edition && other.prefix.startsWith(edition.prefix)).map(other => other.prefix);
    const sections = (await navigationTree({ from: edition.prefix, current, exclude: excluded })).filter(node => node.href !== undefined && node.children.length > 0);
    // Pages recompile after each edit, so a folder's collapsed state follows its index page in development.
    const folded = new Set(pages.filter(doc => doc.page.navigation === 'collapsed').map(doc => base + doc.pathname.slice(1)));
    const collapsed = (page: string) => folded.has(page);
    const overviews = new Set(pages.filter(doc => doc.page.navigation === 'overview').map(doc => base + doc.pathname.slice(1)));
    const versions = versionsList.length > 1 ? edition : undefined;
    const { columns, copyright } = footer(resolve(root, edition.directory, '_footer.md'));
    const localLogo = typeof locale?.logo === 'string' ? { light: locale.logo } : locale?.logo ?? logo;
    const headerNotice = locale?.headerNotice ?? options.headerNotice ?? '';
    return {
      sidebar: translatedSidebar(generatedSidebar(await navigationTree({ from: edition.prefix + section.slice(1), current, exclude: excluded }), collapsed, options.sidebarNavigation, overviews), ui),
      sidebarNavigation: options.sidebarNavigation ?? 'tree',
      nav: [...sections.map(node => ({ ...link({ label: node.label, href: '/' + node.href!.slice(home.length) }), icon: '' })),
        ...(locale?.nav ?? options.nav ?? []).map(entry => ({ ...link(entry), icon: entry.icon === undefined ? '' : file(entry.icon) }))],
      logo: localLogo === undefined ? null : { light: file(localLogo.light), dark: file(localLogo.dark ?? localLogo.light) },
      favicon: (locale?.favicon ?? favicon) === undefined ? null : file((locale?.favicon ?? favicon)!),
      badge: versions ? options.versions === undefined && versions.id === 'current' ? ui.currentVersion : versions.label ?? versions.id : '',
      headerNotice, noticeLabel: formatMessage(ui.removeNotice, { notice: headerNotice }),
      footer: { columns: columns.map(column => ({ title: column.title, items: column.items.map(link) })), copyright },
    };
  }
  // Config is plain data, so an option from another tool, or a removed one, fails rather than doing nothing.
  for (const name of Object.keys(options)) if (!optionNames.includes(name)) throw new Error(`Unknown Markupress option ${name}. Options are ${optionNames.join(', ')}.`);
  if (typeof options.titleTemplate === 'string' && !options.titleTemplate.includes(':title')) throw new Error(`The titleTemplate option places each page's title with :title: ${options.titleTemplate}.`);
  if (options.markdownSyntax !== undefined && options.markdownSyntax !== 'standard' && options.markdownSyntax !== 'compatible') throw new Error(`The markdownSyntax option is standard or compatible: ${String(options.markdownSyntax)}.`);
  if (options.lang !== undefined && !/^[A-Za-z]{2,8}(?:-[A-Za-z\d]{1,8})*$/.test(options.lang)) throw new Error(`The lang option is a language tag such as fr or pt-BR: ${options.lang}.`);
  if (options.editLink !== undefined && !options.editLink.endsWith('/')) throw new Error(`The editLink option ends in /, and each page's path in the project follows it: ${options.editLink}.`);
  if (options.drafts !== undefined && typeof options.drafts !== 'boolean') throw new Error(`The drafts option is true or false: ${String(options.drafts)}.`);
  resolveTranslations('en', options.translations);
  validateDateFormat(options.dateFormat);
  return { ...pages, name: 'markupress', pages: { ...pages.pages!, compile: compileScoped },
    buildStart({ command }) { drafts = options.drafts ?? command === 'dev'; },
    // Each version's search index lives beside its pages. MarkupKit runs this once
    // every page has compiled, and again in development after each change.
    generate: ({ base }) => {
      if (!searchConfiguration.enabled) return {};
      const files = Object.fromEntries(editions.map(edition => [edition.prefix + '_search.json', searchIndex(edition, edition.prefix, base)]));
      if (searchConfiguration.algolia) files['/_algolia.json'] = JSON.stringify(editions.flatMap(edition => algoliaRecords(
        current().filter(doc => doc.version === edition.id && doc.locale === edition.locale && doc.page.search !== false).flatMap(doc => {
          const href = base + (edition.id === defaultVersion ? edition.home : edition.prefix).slice(1) + doc.pathname.slice(edition.prefix.length);
          return doc.sections.map(section => ({ document: doc.id, section: section.id, page: doc.page.title, heading: section.heading,
            href: section.id ? `${href}#${section.id}` : href, text: section.text }));
        }), edition.locale || uiLanguage(edition), edition.id, siteOrigin)).sort((a, b) => a.objectID.localeCompare(b.objectID)));
      return files;
    },
    async config(markupkit) {
    root = resolve(markupkit.root ?? root); siteBase = markupkit.base ?? '/'; siteOrigin = markupkit.origin;
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
      for (const key of Object.keys(locale)) if (!['label', 'directory', 'lang', 'dir', 'title', 'nav', 'logo', 'favicon', 'editLink', 'titleTemplate', 'headerNotice', 'translations', 'dateFormat'].includes(key)) throw new Error(`Unknown locale option ${id}.${key}.`);
      if (locale.lang !== undefined && !/^[A-Za-z]{2,8}(?:-[A-Za-z\d]{1,8})*$/.test(locale.lang)) throw new Error(`Invalid language tag for locale ${id}.`);
      if (locale.dir !== undefined && !['ltr', 'rtl', 'auto'].includes(locale.dir)) throw new Error(`Invalid direction for locale ${id}.`);
      resolveTranslations(locale.lang ?? id, options.translations, locale.translations);
      validateDateFormat(locale.dateFormat);
      if (typeof locale.editLink === 'string' && !locale.editLink.endsWith('/')) throw new Error(`Locale ${id}: editLink must end in /.`);
      if (typeof locale.titleTemplate === 'string' && !locale.titleTemplate.includes(':title')) throw new Error(`Locale ${id}: titleTemplate must contain :title.`);
      if (locale.directory !== undefined && (typeof locale.directory !== 'string' || !locale.directory)) throw new Error(`Invalid directory for locale ${id}.`);
    }
    editions = versionsList.flatMap(version => (locales.length ? locales : [['', undefined] as const]).map(([id, locale]) => {
      const home = id === defaultLocale || !id ? '/' : `/${id}/`;
      const directory = locale ? join(version.directory, locale.directory ?? id) : version.directory;
      if (!inside(resolve(root, version.directory), resolve(root, directory))) throw new Error(`Locale ${id}: directory must stay inside its version.`);
      return { ...version, directory, locale: id, home, prefix: version.id === defaultVersion ? home : `${home}v/${version.id}/`,
        ...(locale ? { language: locale.lang ?? id, direction: locale.dir ?? textDirection(locale.lang ?? id) } : options.lang === undefined ? {} : { direction: textDirection(options.lang) }) };
    }));
    for (const edition of editions) {
      const overlap = editions.find(other => other.locale !== edition.locale && inside(resolve(root, edition.directory), resolve(root, other.directory)));
      if (overlap) throw new Error(`Locale directories overlap: ${edition.directory} (${edition.locale}) and ${overlap.directory} (${overlap.locale}).`);
    }
    // One git log dates every page, read once per build or development server.
    updated = lastUpdated(root, editions.map(edition => edition.directory));
    const ids = new Set<string>();
    for (const edition of editions) {
      if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(edition.id) || ids.has(`${edition.locale}\0${edition.id}`)) throw new Error(`Duplicate or invalid documentation version: ${edition.id}.`);
      ids.add(`${edition.locale}\0${edition.id}`);
      const content = resolve(root, edition.directory);
      if (!inside(root, content)) throw new Error(`Version ${edition.id}: directory must be inside the project.`);
      const landingRequired = !sourceFallback || edition.locale === defaultLocale;
      if (landingRequired && !(await readdir(content)).some(isIndex)) throw new Error(`Version ${edition.id}: a root index.md landing page is required.`);
    }
    const homes = editions.filter(edition => edition.id === defaultVersion);
    if (homes.length === 0) throw new Error(`Unknown defaultVersion: ${defaultVersion}.`);
    const same = (a: DocumentationVersion, b: DocumentationVersion) => resolve(root, a.directory) === resolve(root, b.directory);
    // The shell is the layout of Markupress's own folders only, so a site's other pages keep theirs. A site's
    // app/layouts/default.html, which MarkupKit gives its other pages, replaces the shell and receives its loader data.
    const replacement = join(root, 'app/layouts/default.html');
    layoutFile = existsSync(replacement) ? replacement : shell;
    const nativeScope = (edition: Edition) => sourceFallback ? { scope: editionScope(edition), optional: edition.locale !== defaultLocale } : {};
    const fallbackMounts = sourceFallback ? editions.flatMap(edition => {
      if (edition.locale === defaultLocale) return [];
      const original = editions.find(source => source.id === edition.id && source.locale === defaultLocale)!;
      const include = async (file: string, candidates: readonly PageSource[]) => {
        if (!await published(file)) return false;
        const catalog = await scopedCatalog(candidates);
        const source = catalog.find(page => page.file === file && page.edition.id === edition.id && page.edition.locale === defaultLocale);
        return source !== undefined && !catalog.some(page => page.id === source.id && page.edition.id === edition.id && page.edition.locale === edition.locale);
      };
      return [{ dir: original.directory, prefix: edition.prefix, scope: editionScope(edition), alias: true, include, layout: layout(edition) }];
    }) : [];
    function layout(edition: Edition) { return { component: layoutFile, server: { load: (context: LoadContext) => load(context, edition.locale) } }; }
    // layout: home names this layout; a site's app/layouts/home.html takes its place, as MarkupKit resolves a name.
    return { ...(searchConfiguration.algolia ? { csp: hostedPolicy(markupkit.csp, algoliaOrigin(searchConfiguration.algolia.appId)) } : {}), headScript: themeScript, css: pageStyles, layouts: { home: { component: homeLayout, server: { load } } },
      // The default version owns its locale root. Only historical versions use /v/<id>/;
      // another version serving the same files is an alias and stays out of the sitemap.
      pages: [...editions.map((edition, index) => ({ dir: edition.directory, prefix: edition.prefix, layout: layout(edition), include: published, ...nativeScope(edition),
        ...(edition.id !== defaultVersion && (homes.some(home => same(edition, home)) || editions.slice(0, index).some(earlier => same(earlier, edition))) ? { alias: true } : {}) })), ...fallbackMounts] };
  } };
}

function validateDateFormat(format: Intl.DateTimeFormatOptions | undefined): void {
  if (format !== undefined && (format === null || typeof format !== 'object' || Array.isArray(format))) throw new Error('dateFormat must be an object of Intl.DateTimeFormat options.');
  new Intl.DateTimeFormat('en', { timeZone: 'UTC', ...format });
}
function translatedSidebar(items: readonly SidebarNode[], ui: Translations): SidebarNode[] {
  return items.map(item => ({ ...item, overviewLabel: formatMessage(ui.overview, { label: item.label }), children: translatedSidebar(item.children, ui) }));
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
