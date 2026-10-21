import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import type { HtmlKitPlugin, PageContext } from '@nextwebwg/htmlkit';
import { compileMarkdown, type CompiledMarkdown, type FrontMatter } from './content.js';
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
      ...(options.lineNumbers === undefined ? {} : { lineNumbers: options.lineNumbers }), ...(frontmatter ? { frontmatter } : {}), resolveLink: (target, kind) => link(target, kind, page, options, home(page.file)) });
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
  if (kind === 'asset' || path.includes('.')) return page.asset(target) + suffix;
  return href;
}
