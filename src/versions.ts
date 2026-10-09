import { cp, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApplication, createApplication } from '@nextwebwg/htmlkit';
import { siteOptions, type DocumentationVersion, type MarkupressOptions } from './site.js';
import { stylesheet } from './styles.js';

export interface VersionLink {
  readonly href: string;
  readonly label: string;
  readonly current: 'page' | 'false';
  readonly note: string;
}
/** URLs are projected from logical identity; renaming a route never changes the switch target. */
export function versionLinks(documents: readonly { readonly id: string; readonly version: string; readonly pathname: string }[], versions: readonly { readonly id: string; readonly label?: string }[], id: string, selected: string, base: string): readonly VersionLink[] {
  return versions.map(version => {
    const target = documents.find(doc => doc.id === id && doc.version === version.id);
    return { href: base + (target?.pathname ?? `/v/${version.id}/`).slice(1), label: version.label ?? version.id,
      current: selected === version.id ? 'page' : 'false',
      note: target ? '' : `This document is unavailable in ${version.label ?? version.id}; open its documentation home.` };
  });
}

/** Snapshot author content without overwriting an existing edition. The manifest preserves explicit ordering. */
export async function snapshotVersion(id: string, options: MarkupressOptions = {}): Promise<DocumentationVersion> {
  if (!/^[A-Za-z0-9_-]+$/.test(id) || id === 'current') throw new Error('Snapshot id must be a URL slug other than current.');
  const root = resolve(options.root ?? process.cwd());
  const canonicalRoot = await realpath(root);
  const source = resolve(root, options.contentDir ?? 'docs');
  const relation = relative(root, source);
  if (isAbsolute(relation) || relation.startsWith('..')) throw new Error('Snapshot contentDir must be inside the project.');
  const snapshots = join(root, 'versioned_docs');
  await mkdir(snapshots, { recursive: true });
  const lock = join(snapshots, '.snapshot-lock');
  try { await mkdir(lock); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Another snapshot owns versioned_docs/.snapshot-lock; finish or recover that operation first.');
    throw error;
  }
  const destination = join(snapshots, id);
  let owned = false;
  try {
    const manifest = join(snapshots, 'versions.json');
    let versions: DocumentationVersion[] = [];
    try { versions = JSON.parse(await readFile(manifest, 'utf8')) as DocumentationVersion[]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (versions.some(version => version.id === id)) throw new Error(`Documentation version ${id} already exists.`);
    try { await mkdir(destination); owned = true; } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Documentation version ${id} already exists.`);
      throw error;
    }
    // Let HTMLKit/Vite identify the authored HTML, module, stylesheet and asset closure.
    // Mirroring project-relative paths keeps imports valid without rewriting source code.
    const site = siteOptions({ ...options, versions: [{ id: 'current', directory: relation }], defaultVersion: 'current' });
    const validation = join(destination, '.validation');
    const built = await buildApplication({ ...site, outDir: validation });
    const application = await createApplication(site);
    // Files that Markdown references, which HTMLKit serves, belong to the snapshot too.
    const inputs = new Set([...built.browserInputs, ...application.files.values()]);
    try {
      for (const pathname of await application.entries()) {
        for (const component of (await application.render(pathname)).components) {
          const file = component.definition.source.file;
          if (file) inputs.add(file.startsWith('file:') ? fileURLToPath(file) : file);
          for (const dependency of stylesheet(component.definition.css, fileURLToPath(file), false).files) inputs.add(dependency);
          // HTMLKit delivers a component's imported stylesheets apart from its local CSS, nested imports included.
          for (const sheet of component.definition.stylesheets ?? []) if (sheet.url.startsWith('file:')) inputs.add(fileURLToPath(sheet.url));
        }
      }
    } finally { await application.close(); }
    const visited = new Set<string>();
    for (const input of inputs) {
      if (!input.endsWith('.css') || input.endsWith('.htmlkit.css') || visited.has(input)) continue;
      visited.add(input);
      for (const dependency of stylesheet(await readFile(input, 'utf8'), input, false).files) inputs.add(dependency);
    }
    const mirror = join(destination, '_source');
    await cp(source, join(mirror, relation), { recursive: true, dereference: false });
    for (const input of inputs) {
      const file = input.split('?')[0]!;
      if (file.endsWith('.htmlkit.css')) continue; // HTMLKit's virtual inline stylesheet, not an authored file.
      const path = relative(canonicalRoot, await realpath(file));
      if (isAbsolute(path) || path.startsWith('..') || path.split(/[/\\]/).some(part => ['node_modules', '.markupress', 'versioned_docs'].includes(part))) continue;
      const target = join(mirror, path); await mkdir(dirname(target), { recursive: true }); await cp(file, target);
    }
    let publicDir: string | undefined;
    try { await cp(join(root, 'public'), join(mirror, 'public'), { recursive: true, dereference: false }); publicDir = `versioned_docs/${id}/_source/public`; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await rm(validation, { recursive: true, force: true });
    const version: DocumentationVersion = { id, label: id, directory: `versioned_docs/${id}/_source/${relation.replace(/\\/g, '/')}`, ...(publicDir ? { publicDir } : {}) };
    const pending = join(snapshots, '.versions-pending.json');
    await writeFile(pending, JSON.stringify([...versions, version], null, 2) + '\n');
    await rename(pending, manifest);
    owned = false;
    return version;
  } finally {
    if (owned) await rm(destination, { recursive: true, force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
