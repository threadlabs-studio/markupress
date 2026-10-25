import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, dirname, sep } from 'node:path';
import { createLoomaMarkdownIt } from '@threadlabs/looma/markdown/markdown-it';
import { fileURLToPath } from 'node:url';
import { buildApplication, createApplication } from '@threadlabs/htmlkit';
import { siteOptions, snapshotOf, type DocumentationVersion, type MarkupressOptions } from './site.js';
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

// A quoted @/ specifier where HTMLKit resolves one: an href, src or controller attribute, an @import, or a module import.
const rootPath = /(\b(?:href|src|controller)\s*=\s*|@import\s+(?:url\(\s*)?|\bfrom\s*|\bimport\s*\(?\s*)(["'])@\/([^"'\s?#]+)([^"']*)\2/g;
const markdown = createLoomaMarkdownIt();
/**
 * The file's @/ specifiers that name a file the snapshot copies, rewritten into the snapshot. A @/ specifier naming any
 * other file keeps reading the live project, with a warning. Markdown's code, fenced, indented and inline, stays as written.
 */
export function freezeRootPaths(text: string, path: string, id: string, copied: ReadonlySet<string>): string {
  const freeze = (part: string) => part.replace(rootPath, (whole, before: string, quote: string, target: string, rest: string) => {
    // HTMLKit resolves a controller's or module's .js name to its TypeScript source.
    if (copied.has(target) || copied.has(target.replace(/\.([cm]?)js(x?)$/, '.$1ts$2'))) return `${before}${quote}@/versions/${id}/${target}${rest}${quote}`;
    process.emitWarning(`${path}: @/${target} is outside version ${id}, so the snapshot reads the project's current file.`);
    return whole;
  });
  if (!path.endsWith('.md')) return freeze(text);
  const lines = text.split(/(?<=\n)/);
  const code = new Set<number>();
  for (const token of markdown.parse(text, {})) if ((token.type === 'fence' || token.type === 'code_block') && token.map) for (let line = token.map[0]; line < token.map[1]; line++) code.add(line);
  // Inline code spans are literal text too.
  return lines.map((line, index) => code.has(index) ? line : line.split(/(`+[^`]*`+)/).map(part => part.startsWith('`') ? part : freeze(part)).join('')).join('');
}

/**
 * Snapshot author content into `versions/<id>/` without overwriting an existing edition. The snapshot is staged in a
 * dot folder and renamed into place, so a version appears whole or not at all.
 */
export async function snapshotVersion(id: string, options: MarkupressOptions = {}): Promise<DocumentationVersion> {
  if (!/^[A-Za-z0-9_-]+$/.test(id) || id === 'current') throw new Error('Snapshot id must be a URL slug other than current.');
  const root = resolve(options.root ?? process.cwd());
  const canonicalRoot = await realpath(root);
  const source = resolve(root, options.contentDir ?? 'docs');
  const relation = relative(root, source);
  if (isAbsolute(relation) || relation.startsWith('..')) throw new Error('Snapshot contentDir must be inside the project.');
  const snapshots = join(root, 'versions');
  await mkdir(snapshots, { recursive: true });
  const lock = join(snapshots, '.snapshot-lock');
  try { await mkdir(lock); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Another snapshot owns versions/.snapshot-lock; finish or recover that operation first.');
    throw error;
  }
  const destination = join(snapshots, id);
  const staging = join(snapshots, `.${id}-pending`);
  try {
    if (existsSync(destination)) throw new Error(`Documentation version ${id} already exists.`);
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging);
    // Let HTMLKit/Vite identify the authored HTML, module, stylesheet and asset closure.
    // Mirroring project-relative paths keeps imports valid without rewriting source code.
    const site = siteOptions({ ...options, versions: [{ id: 'current', directory: relation }], defaultVersion: 'current' });
    const validation = join(staging, '.validation');
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
    await cp(source, join(staging, relation), { recursive: true, dereference: false });
    // The project-relative paths the snapshot holds, which its @/ specifiers then name inside the snapshot.
    const copied = new Set((await readdir(source, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())
      .map(entry => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/')));
    for (const input of inputs) {
      const file = input.split('?')[0]!;
      if (file.endsWith('.htmlkit.css')) continue; // HTMLKit's virtual inline stylesheet, not an authored file.
      const path = relative(canonicalRoot, await realpath(file));
      if (isAbsolute(path) || path.startsWith('..') || path.split(/[/\\]/).includes('node_modules') || /^versions[/\\]/.test(path)) continue;
      const target = join(staging, path); await mkdir(dirname(target), { recursive: true }); await cp(file, target);
      copied.add(path.split(sep).join('/'));
    }
    // A copy names its frozen neighbours: @/<path> becomes @/versions/<id>/<path> wherever the snapshot holds the file.
    for (const path of copied) {
      if (!/\.(?:md|html|css|[cm]?[jt]sx?)$/.test(path)) continue;
      const file = join(staging, path), text = await readFile(file, 'utf8');
      const frozen = freezeRootPaths(text, path, id, copied);
      if (frozen !== text) await writeFile(file, frozen);
    }
    try { await cp(join(root, 'public'), join(staging, 'public'), { recursive: true, dereference: false }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await rm(validation, { recursive: true, force: true });
    await rename(staging, destination);
    return snapshotOf(root, id, relation.replace(/\\/g, '/'));
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
