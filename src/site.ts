import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApplication, devApplication, previewApplication, type ApplicationServer, type BuildResult, type HtmlKitPlugin,
  type LoadContext, type ServerOptions } from '@nextwebwg/htmlkit';
import { markdown } from './markdown.js';
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
const themeStyles = fileURLToPath(new URL('../theme/theme.css', import.meta.url));

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
  const documents = new Map<string, DocumentationPage & { readonly aliases: readonly string[] }>();
  const current = () => [...documents.values()].filter(doc => existsSync(doc.source));
  const pages = markdown({
    publicDir: file => resolve(root, editionOf(file)?.publicDir ?? 'public'),
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
          aliases: page.aliases.map(alias => `/v/${edition.id}${alias}`) });
      }
    },
  });
  async function load({ navigation, breadcrumbs, pager, url, base }: LoadContext) {
    const path = '/' + url.pathname.slice(base.length);
    const selected = /^\/v\/([^/]+)\//.exec(path)?.[1] ?? defaultVersion;
    const requested = path.startsWith('/v/') ? path : `/v/${selected}${path}`;
    const catalog = current();
    const page = catalog.find(doc => doc.pathname === requested || doc.aliases.includes(requested));
    // The default version also serves the root; its entries are marked current under /v/<id>/.
    const within = { from: `/v/${selected}/`, current: base + (page?.pathname ?? requested).slice(1) };
    return { props: { title: options.title ?? 'Documentation', home: base, navigation: await navigation(within),
      versions: versionLinks(catalog, editions, page?.id ?? 'index', selected, base),
      crumbs: await breadcrumbs(within), ...await pager(within) } };
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
    // The shell is the layout of Markupress's own folders only, so a site's other pages keep theirs.
    const layout = { component: shell, server: { load } };
    return { headScript: themeScript, css: [themeStyles],
      pages: [...editions.map(edition => ({ dir: edition.directory, prefix: `/v/${edition.id}/`, layout })), { dir: home.directory, layout }] };
  } };
}

/** HTMLKit options for a Markupress site, as the CLI runs it. */
export function siteOptions(options: MarkupressOptions = {}): ServerOptions {
  const root = resolve(options.root ?? process.cwd());
  return { root, base: options.base ?? '/', outDir: resolve(root, options.outDir ?? 'site'), plugins: [markupress({ ...options, root })],
    ...(options.host === undefined ? {} : { host: options.host }), ...(options.port === undefined ? {} : { port: options.port }) };
}
export function buildSite(options: MarkupressOptions = {}): Promise<BuildResult> { return buildApplication(siteOptions(options)); }
export function previewSite(options: MarkupressOptions = {}): Promise<ApplicationServer> { return previewApplication(siteOptions(options)); }
/** HTMLKit's watcher recompiles Markdown and reloads open pages after each edit. */
export function devSite(options: MarkupressOptions = {}): Promise<ApplicationServer> { return devApplication(siteOptions(options)); }
