import { watch } from 'node:fs';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildApplication, devApplication, previewApplication, type ApplicationOptions, type ApplicationServer, type BuildResult } from '@nextwebwg/htmlkit';
import { compileMarkdown } from './content.js';
import { themeResource } from './theme.js';

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
interface CompiledSite extends PreparedSite { readonly sourceMap: ReadonlyMap<string, string>; }

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

/** Compile author content into an owned HTMLKit application, preserving original import locations. */
export async function prepareSite(options: MarkupressOptions = {}): Promise<PreparedSite> { return prepare(options, false); }

async function prepare(options: MarkupressOptions, live: boolean): Promise<CompiledSite> {
  const root = resolve(options.root ?? process.cwd());
  const base = options.base ?? '/';
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('base requires an absolute path with a trailing slash.');
  const generated = join(root, '.markupress');
  if (await exists(generated)) {
    const marker = await readFile(join(generated, 'owner.json'), 'utf8').catch(() => 'null');
    if (JSON.parse(marker)?.product !== 'markupress') throw new Error(`${generated}: refusing to replace an unowned directory.`);
  }
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
  const stage = await mkdtemp(join(root, '.markupress-build-'));
  const sourceMap = new Map<string, string>();
  const canonicalRoot = await realpath(root);
  try {
    const write = async (file: string, text: string) => { const destination = join(stage, file); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, text); };
    await write('owner.json', JSON.stringify({ product: 'markupress', version: 1 }));
    const assets = new Map<string, string>();
    const extraRoutes: { pattern: string; component: string }[] = [];
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
      const compiled = compileMarkdown(doc.text, { file: doc.source, pageName: doc.pageName, resolveLink });
      const component = `app/pages/v/${doc.version}/${doc.physical.replace(/\.md$/, '.html')}`;
      sourceMap.set(join(generated, component), doc.source);
      sourceMap.set(join(canonicalRoot, '.markupress', component), doc.source);
      await write(component, compiled.resource);
      if (doc.version === defaultVersion) extraRoutes.push({ pattern: doc.pathname.replace(`/v/${doc.version}`, '') || '/', component });
      for (const alias of doc.aliases) {
        if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(alias)) throw new Error(`${doc.source}: alias must be a route path with leading and trailing slashes.`);
        extraRoutes.push({ pattern: `/v/${doc.version}${alias}`, component });
      }
    }
    for (const [source, name] of assets) {
      const target = join(stage, 'public/_markupress/assets', name); await mkdir(dirname(target), { recursive: true }); await cp(source, target);
    }
    if (await exists(join(root, 'public'))) await cp(join(root, 'public'), join(stage, 'public'), { recursive: true });
    const labels = Object.fromEntries(documents.map(doc => [doc.pageName, doc.label]));
    const canonicalAliases = Object.fromEntries(documents.flatMap(doc => doc.aliases.map(alias => [`/v/${doc.version}${alias}`, doc.pathname])));
    await write('app/layouts/default.html', themeResource(options.title ?? 'Documentation', base));
    await write('app/layouts/default.server.js', `import { versionLinks } from 'markupress';
const labels = ${JSON.stringify(labels)};
const aliases = ${JSON.stringify(canonicalAliases)};
const visible = new Set(${JSON.stringify(documents.filter(doc => !doc.sidebarHidden).map(doc => base + doc.pathname.slice(1)))});
const documents = ${JSON.stringify(documents.map(({ id, version, pathname }) => ({ id, version, pathname })))};
const versions = ${JSON.stringify(editions)};
export async function load({ navigation, url, base }) {
 const relative = '/' + url.pathname.slice(base.length);
 const selected = relative.match(/^\\/v\\/([^/]+)\\//)?.[1] ?? ${JSON.stringify(defaultVersion)};
 const requested = relative.startsWith('/v/') ? relative : '/v/' + selected + relative;
 const canonical = aliases[requested] ?? requested;
 const page = documents.find(doc => doc.pathname === canonical);
 return { props: {
   navigation: (await navigation({ from: '/v/' + selected + '/', current: base + canonical.slice(1) })).filter(item => visible.has(item.href)).map(item => ({ ...item, label: labels[item.pageName] ?? item.label })),
   versions: versionLinks(documents, versions, page?.id ?? 'index', selected, base)
 } };
}`);
    const previous = await exists(generated);
    const backup = stage + '-previous';
    if (live && previous) await syncGenerated(stage, generated);
    else {
      if (previous) await rename(generated, backup);
      try { await rename(stage, generated); } catch (error) { if (previous) await rename(backup, generated); throw error; }
      if (previous) await rm(backup, { recursive: true, force: true });
    }
    return { documents, sourceMap, sourceFiles: [...assets.keys()], application: { root: generated, base, outDir: resolve(root, options.outDir ?? 'site'), fileRoutes: true, routeOrdering: true, routes: extraRoutes } };
  } finally { await rm(stage, { recursive: true, force: true }); }
}

// Keep watched directory identities in development; replace only changed generated files.
async function syncGenerated(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  const names = new Set(entries.map(entry => entry.name));
  for (const name of await readdir(target)) if (!names.has(name)) await rm(join(target, name), { recursive: true, force: true });
  for (const entry of entries) {
    const from = join(source, entry.name), to = join(target, entry.name);
    if (entry.isDirectory()) await syncGenerated(from, to);
    else if (!await exists(to) || !(await readFile(from)).equals(await readFile(to))) await cp(from, to);
  }
}

export async function buildSite(options: MarkupressOptions = {}): Promise<BuildResult> {
  const prepared = await prepare(options, false);
  try { return await buildApplication(prepared.application); }
  catch (error) {
    let message = error instanceof Error ? error.message : String(error);
    for (const [compiled, authored] of prepared.sourceMap) {
      message = message.replaceAll(pathToFileURL(compiled).href, authored).replaceAll(compiled, authored);
    }
    throw new Error(message, { cause: error });
  }
}
export async function previewSite(options: MarkupressOptions = {}): Promise<ApplicationServer> {
  return previewApplication({ root: resolve(options.root ?? process.cwd(), '.markupress'), outDir: resolve(options.root ?? process.cwd(), options.outDir ?? 'site'), ...(options.host === undefined ? {} : { host: options.host }), ...(options.port === undefined ? {} : { port: options.port }) });
}
export async function devSite(options: MarkupressOptions = {}): Promise<ApplicationServer> {
  const prepared = await prepareSite(options);
  const liveRoutes = [...(prepared.application.routes ?? [])];
  const server = await devApplication({ ...prepared.application, routes: liveRoutes, ...(options.host === undefined ? {} : { host: options.host }), ...(options.port === undefined ? {} : { port: options.port }) });
  const root = resolve(options.root ?? process.cwd());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = Promise.resolve();
  let closed = false;
  const rebuild = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      pending = pending.then(async () => {
        if (closed) return;
        const updated = await prepare(options, true);
        liveRoutes.splice(0, liveRoutes.length, ...(updated.application.routes ?? []));
      }).catch(error => { console.error(String(error)); });
    }, 75);
  };
  const watchers: ReturnType<typeof watch>[] = [];
  try {
    for (const version of await versions(options, root)) watchers.push(watch(resolve(root, version.directory), { recursive: true }, (_event, file) => { if (file?.endsWith('.md')) rebuild(); }));
  } catch (error) { watchers.forEach(watcher => watcher.close()); await server.close(); throw error; }
  return { url: server.url, async close() {
    closed = true; if (timer) clearTimeout(timer); watchers.forEach(watcher => watcher.close()); await pending; await server.close();
  } };
}
