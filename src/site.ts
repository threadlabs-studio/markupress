import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { buildApplication, devApplication, previewApplication, type ApplicationOptions, type ApplicationServer, type BuildResult, type GeneratedApplication,
  type LoadContext, type RouteInput, type RouteLayer } from '@nextwebwg/htmlkit';
import { compileMarkdown } from './content.js';
import { themeResource, themeScript } from './theme.js';
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
  readonly pathname: string;
  readonly label: string;
  readonly pageName: string;
}
export interface PreparedSite {
  readonly application: ApplicationOptions;
  readonly documents: readonly DocumentationPage[];
  readonly sourceFiles: readonly string[];
}
interface CompiledSite extends Omit<PreparedSite, 'application'> { readonly generated: GeneratedApplication; }

async function exists(path: string) {
  try { await stat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
function inside(root: string, path: string) {
  const part = relative(root, path); return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith('../') && !part.startsWith('..\\'));
}
async function files(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isSymbolicLink()) throw new Error(`${join(root, entry.name)}: symbolic links are not supported in documentation content.`);
    if (entry.isDirectory()) result.push(...await files(join(root, entry.name)));
    else if (entry.isFile() && entry.name.endsWith('.md')) result.push(join(root, entry.name));
  }
  return result;
}
function routePath(file: string) {
  const parts = file.replace(/\\/g, '/').replace(/\.md$/, '').split('/').map(part => part.replace(/^\d+-/, ''));
  if (parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error(`${file}: documentation filenames must be URL slugs with optional numeric prefixes.`);
  const id = parts.join('/');
  if (parts.at(-1) === 'index') parts.pop();
  return { id, pattern: '/' + (parts.length === 0 ? '' : parts.join('/') + '/') };
}
async function versions(options: MarkupressOptions, root: string): Promise<readonly DocumentationVersion[]> {
  if (options.versions) return options.versions;
  const manifest = join(root, 'versioned_docs/versions.json');
  const snapshots = await exists(manifest) ? JSON.parse(await readFile(manifest, 'utf8')) as DocumentationVersion[] : [];
  return [{ id: 'current', label: 'Current', directory: options.contentDir ?? 'docs' }, ...snapshots];
}

/**
 * Compile author content into an in-memory HTMLKit application. Each Markdown file is its own page
 * component, so diagnostics and relative references keep their original locations. HTMLKit calls
 * generate() again whenever it rediscovers routes, which is how development reflects edits.
 */
export async function prepareSite(options: MarkupressOptions = {}): Promise<PreparedSite> {
  const root = resolve(options.root ?? process.cwd());
  let first: CompiledSite | undefined = await compile(options, root);
  const { documents, sourceFiles } = first;
  return { documents, sourceFiles, application: { root, base: options.base ?? '/', outDir: resolve(root, options.outDir ?? 'site'), fileRoutes: false,
    // The first discovery reuses the compilation that validated these options.
    generate: async () => { const site = first ?? await compile(options, root); first = undefined; return site.generated; } } };
}

async function compile(options: MarkupressOptions, root: string): Promise<CompiledSite> {
  const base = options.base ?? '/';
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('base requires an absolute path with a trailing slash.');
  const editions = await versions(options, root);
  const ids = new Set<string>();
  for (const version of editions) {
    if (!/^[A-Za-z0-9_-]+$/.test(version.id) || ids.has(version.id)) throw new Error(`Duplicate or invalid documentation version: ${version.id}.`);
    ids.add(version.id);
  }
  const defaultVersion = options.defaultVersion ?? 'current';
  if (!ids.has(defaultVersion)) throw new Error(`Unknown defaultVersion: ${defaultVersion}.`);
  const documents: (DocumentationPage & { physical: string; text: string; aliases: readonly string[]; sidebarHidden: boolean })[] = [];
  const bySource = new Map<string, DocumentationPage>();
  const routes = new Map<string, DocumentationPage>();
  const identities = new Map<string, DocumentationPage>();
  for (const version of editions) {
    const content = resolve(root, version.directory);
    if (!inside(root, content)) throw new Error(`Version ${version.id}: directory must be inside the project.`);
    if (!await exists(join(content, 'index.md')) && !await exists(join(content, '01-index.md'))) {
      const landing = (await files(content)).some(file => relative(content, file).replace(/^\d+-/, '') === 'index.md');
      if (!landing) throw new Error(`Version ${version.id}: a root index.md landing page is required.`);
    }
    for (const source of await files(content)) {
      const physical = relative(content, source).replace(/\\/g, '/');
      const path = routePath(physical);
      const text = await readFile(source, 'utf8');
      const info = compileMarkdown(text, { file: source, pageName: 'page-catalog' });
      const id = info.id ?? path.id;
      const identity = `${version.id}\0${id}`;
      const pathname = `/v/${version.id}${path.pattern}`;
      const pageName = 'page-doc-' + createHash('sha256').update(identity).digest('hex').slice(0, 20);
      const document = { id, version: version.id, source, pathname, label: info.label, pageName, physical, text, aliases: info.aliases, sidebarHidden: info.sidebarHidden };
      const previous = routes.get(pathname) ?? identities.get(identity);
      if (previous) throw new Error(`Documentation collision: ${previous.source} and ${source} (${pathname}, ${id}).`);
      routes.set(pathname, document); identities.set(identity, document); bySource.set(`${version.id}\0${source}`, document); documents.push(document);
    }
  }
  const labels = Object.fromEntries(documents.map(doc => [doc.pageName, doc.label]));
  const canonicalAliases: Record<string, string> = Object.fromEntries(documents.flatMap(doc => doc.aliases.map(alias => [`/v/${doc.version}${alias}`, doc.pathname])));
  const visible = new Set(documents.filter(doc => !doc.sidebarHidden).map(doc => base + doc.pathname.slice(1)));
  // The shell's loader runs in this process; it reads the same catalog the routes were built from.
  const layout: RouteLayer = { component: join(root, '.markupress/layout.html'), server: { async load({ navigation, url, base }: LoadContext) {
    const path = '/' + url.pathname.slice(base.length);
    const selected = /^\/v\/([^/]+)\//.exec(path)?.[1] ?? defaultVersion;
    const requested = path.startsWith('/v/') ? path : '/v/' + selected + path;
    const canonical = canonicalAliases[requested] ?? requested;
    const page = documents.find(doc => doc.pathname === canonical);
    return { props: {
      navigation: (await navigation({ from: '/v/' + selected + '/', current: base + canonical.slice(1) }))
        .filter(item => visible.has(item.href)).map(item => ({ ...item, label: labels[item.pageName] ?? item.label })),
      versions: versionLinks(documents, editions, page?.id ?? 'index', selected, base),
    } };
  } } };
  const sources = new Map<string, string>([[layout.component, themeResource(options.title ?? 'Documentation', base)], [join(root, 'app/head.js'), themeScript]]);
  const assets = new Map<string, string>();
  const pages: RouteInput[] = [];
  for (const doc of documents) {
    const resolveLink = (href: string, kind: 'link' | 'asset') => {
      if (/^(?:[A-Za-z][A-Za-z\d+.-]*:|#|\/\/)/.test(href) || href.startsWith(base + '_markupress/')) return href;
      if (href.startsWith('/') && kind === 'link') return href;
      const [path, suffix = ''] = href.split(/(?=[?#])/, 2);
      const edition = editions.find(version => version.id === doc.version)!;
      const original = path!.startsWith('/') ? resolve(root, edition.publicDir ?? 'public', '.' + decodeURIComponent(path!)) : resolve(dirname(doc.source), decodeURIComponent(path!));
      if (path!.endsWith('.md')) {
        const target = bySource.get(`${doc.version}\0${original}`) ?? documents.find(page => page.source === original);
        if (!target) throw new Error(`${doc.source}: missing document ${href}.`);
        return base + target.pathname.slice(1) + suffix;
      }
      if (kind === 'asset' || path!.includes('.')) {
        if (!inside(root, original)) throw new Error(`${doc.source}: asset ${href} escapes the project root.`);
        const name = createHash('sha256').update(relative(root, original)).digest('hex').slice(0, 16) + '-' + basename(original);
        assets.set(original, name); return base + '_markupress/assets/' + name + suffix;
      }
      return href;
    };
    sources.set(doc.source, compileMarkdown(doc.text, { file: doc.source, pageName: doc.pageName, resolveLink }).resource);
    // Numeric filename prefixes order navigation, as HTMLKit's routeOrdering does for file routes.
    const ranks = doc.physical.replace(/\.md$/, '').split('/').map(part => /^(\d+)-/.exec(part)?.[1] ?? null);
    if (routePath(doc.physical).id.split('/').at(-1) === 'index') ranks.pop();
    pages.push({ pattern: doc.pathname, component: doc.source, order: [null, null, ...ranks], layouts: [layout] });
    if (doc.version === defaultVersion) pages.push({ pattern: doc.pathname.replace(`/v/${doc.version}`, '') || '/', component: doc.source, layouts: [layout] });
    for (const alias of doc.aliases) {
      if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(alias)) throw new Error(`${doc.source}: alias must be a route path with leading and trailing slashes.`);
      pages.push({ pattern: `/v/${doc.version}${alias}`, component: doc.source, layouts: [layout] });
    }
  }
  return { documents, sourceFiles: [...assets.keys()], generated: { routes: pages, files: sources,
    publicFiles: new Map([...assets].map(([original, name]) => [`_markupress/assets/${name}`, original])) } };
}

export async function buildSite(options: MarkupressOptions = {}): Promise<BuildResult> {
  return buildApplication((await prepareSite(options)).application);
}
export async function previewSite(options: MarkupressOptions = {}): Promise<ApplicationServer> {
  const root = resolve(options.root ?? process.cwd());
  return previewApplication({ root, outDir: resolve(root, options.outDir ?? 'site'), ...(options.host === undefined ? {} : { host: options.host }), ...(options.port === undefined ? {} : { port: options.port }) });
}
/** HTMLKit's watcher regenerates the application from Markdown and reloads open pages after each edit. */
export async function devSite(options: MarkupressOptions = {}): Promise<ApplicationServer> {
  const prepared = await prepareSite(options);
  return devApplication({ ...prepared.application, ...(options.host === undefined ? {} : { host: options.host }), ...(options.port === undefined ? {} : { port: options.port }) });
}
