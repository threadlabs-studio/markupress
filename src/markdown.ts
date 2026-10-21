import { createHash } from 'node:crypto';
import { readdirSync, type Dirent } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { HtmlKitPlugin, PageContext } from '@nextwebwg/htmlkit';
import { compileMarkdown, isIndex, type CompiledMarkdown, type FrontMatter } from './content.js';
import { siteLink } from './navigation.js';

export interface MarkdownPluginOptions {
  /** Directory that a page's root-relative images and files (/logo.svg) come from; without one they stay site URLs. */
  readonly publicDir?: (file: string) => string | undefined;
  /** Called with each compiled page and its URL, for example to catalog documents. */
  readonly onPage?: (page: CompiledMarkdown & { readonly file: string; readonly href: string | undefined }) => void;
  /** Stylesheet files every Markdown page component imports, such as a theme's prose styles. */
  readonly styles?: readonly string[];
  /** Number the lines of every highlighted code block unless its fence says `:no-line-numbers`. */
  readonly lineNumbers?: boolean;
  /** Front matter for a page that its own fields override, such as a site-wide default. */
  readonly frontmatter?: (file: string) => FrontMatter | undefined;
  /** The URL a page's root-relative links (`/guide/`) start from, such as its version's home; the site's base by default. */
  readonly home?: (file: string) => string;
  /** A page's document `<title>` from its title, such as `Install | My site`; the page title by default. */
  readonly documentTitle?: (file: string, title: string) => string;
}

/**
 * An HTMLKit page plugin: each .md file compiles to an HTML Next page, which HTMLKit routes, orders,
 * renders, and builds like an .html page. Links to other .md files and referenced files resolve
 * through HTMLKit, so the plugin holds no routing of its own.
 */
export function markdown(options: MarkdownPluginOptions = {}): HtmlKitPlugin {
  let base = '/';
  const home = options.home ?? (() => base);
  return { name: 'markdown', config(htmlkit) { base = htmlkit.base ?? '/'; }, pages: { extensions: ['.md'], async compile(source, page) {
    const href = page.href(page.file);
    // The URL, not the machine's path, names the page, so builds are reproducible.
    const pageName = 'page-md-' + createHash('sha256').update(href ?? page.file).digest('hex').slice(0, 20);
    const frontmatter = options.frontmatter?.(page.file);
    const compiled = await compileMarkdown(source, { file: page.file, pageName, ...(options.styles ? { styles: options.styles } : {}),
      ...(options.lineNumbers === undefined ? {} : { lineNumbers: options.lineNumbers }), ...(frontmatter ? { frontmatter } : {}),
      ...(options.documentTitle ? { documentTitle: (title: string) => options.documentTitle!(page.file, title) } : {}), resolveLink: (target, kind) => link(target, kind, page, options, home(page.file)) });
    options.onPage?.({ ...compiled, file: page.file, href });
    return compiled.resource;
  } } };
}

function link(href: string, kind: 'link' | 'asset', page: PageContext, options: MarkdownPluginOptions, home: string): string {
  if (/^(?:[A-Za-z][A-Za-z\d+.-]*:|#|\/\/)/.test(href)) return href;
  const [path, suffix = ''] = href.split(/(?=[?#])/, 2) as [string, string?];
  // A root-relative link is a page path in the site, as in the footer and nav; one naming a file (/report.pdf) is a
  // public file, as a root-relative image is.
  if (path.startsWith('/') && kind === 'link' && !/\.[^/]*$/.test(path)) return siteLink(href, home);
  let target: string;
  if (path.startsWith('/')) {
    const directory = options.publicDir?.(page.file);
    if (directory === undefined) return href;
    target = resolve(directory, '.' + decodeURIComponent(path));
  } else target = resolve(dirname(page.file), decodeURIComponent(path));
  if (path.endsWith('.md')) {
    const url = page.href(target);
    if (url === undefined) throw new Error(`${page.file}: missing document ${href}.`);
    return url + suffix;
  }
  // A name with an extension (./report.pdf) is a file; a relative path without one (./install, ../guide/) is a page.
  if (kind === 'asset' || /\.[^/.]+$/.test(path)) return page.asset(target) + suffix;
  if (path === '' || path.startsWith('/')) return href;
  const file = pageFile(dirname(page.file), path);
  const url = file === undefined ? undefined : page.href(file);
  if (url === undefined) throw new Error(`${page.file}: missing document ${href}: no page ${path} beside it.`);
  return url + suffix;
}

/**
 * The Markdown file a relative page path names, as its URL does: `install` is `install.md` or `02.install.md`, and
 * `guide` or `guide/` is that page, else that folder's index page, whatever number prefixes the folders and files carry,
 * as the page's URL ends in a slash either way.
 */
function pageFile(from: string, path: string): string | undefined {
  const entries = (directory: string): Dirent[] => { try { return readdirSync(directory, { withFileTypes: true }); } catch { return []; } };
  const named = (entry: string, name: string) => entry === name || entry.replace(/^\d+\./, '') === name;
  const segments = decodeURIComponent(path).split('/');
  const folder = segments.at(-1) === '';
  const last = folder ? segments.at(-2) ?? '.' : segments.at(-1)!;
  let directory = from;
  for (const segment of segments.slice(0, folder ? -2 : -1)) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') { directory = dirname(directory); continue; }
    const next = entries(directory).find(entry => entry.isDirectory() && named(entry.name, segment));
    if (!next) return undefined;
    directory = join(directory, next.name);
  }
  if (last === '..') directory = dirname(directory);
  else if (last !== '.') {
    const own = entries(directory).find(entry => entry.isFile() && named(entry.name, `${last}.md`));
    if (own) return join(directory, own.name);
    const sub = entries(directory).find(entry => entry.isDirectory() && named(entry.name, last));
    if (!sub) return undefined;
    directory = join(directory, sub.name);
  }
  const index = entries(directory).find(entry => entry.isFile() && isIndex(entry.name));
  return index === undefined ? undefined : join(directory, index.name);
}
