import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import type { HtmlKitPlugin, PageContext } from '@nextwebwg/htmlkit';
import { compileMarkdown, type CompiledMarkdown } from './content.js';

export interface MarkdownPluginOptions {
  /** Directory that a page's root-relative images and files (/logo.svg) come from; without one they stay site URLs. */
  readonly publicDir?: (file: string) => string | undefined;
  /** Called with each compiled page and its URL, for example to catalog documents. */
  readonly onPage?: (page: CompiledMarkdown & { readonly file: string; readonly href: string | undefined }) => void;
  /** Stylesheet files every Markdown page component imports, such as a theme's prose styles. */
  readonly styles?: readonly string[];
}

/**
 * An HTMLKit page plugin: each .md file compiles to an HTML Next page, which HTMLKit routes, orders,
 * renders, and builds like an .html page. Links to other .md files and referenced files resolve
 * through HTMLKit, so the plugin holds no routing of its own.
 */
export function markdown(options: MarkdownPluginOptions = {}): HtmlKitPlugin {
  return { name: 'markdown', pages: { extensions: ['.md'], async compile(source, page) {
    const href = page.href(page.file);
    // The URL, not the machine's path, names the page, so builds are reproducible.
    const pageName = 'page-md-' + createHash('sha256').update(href ?? page.file).digest('hex').slice(0, 20);
    // compileMarkdown also passes through links it already resolved; return those unchanged.
    const resolved = new Set<string>();
    const compiled = await compileMarkdown(source, { file: page.file, pageName, ...(options.styles ? { styles: options.styles } : {}), resolveLink(target, kind) {
      if (resolved.has(target)) return target;
      const url = link(target, kind, page, options);
      resolved.add(url);
      return url;
    } });
    options.onPage?.({ ...compiled, file: page.file, href });
    return compiled.resource;
  } } };
}

function link(href: string, kind: 'link' | 'asset', page: PageContext, options: MarkdownPluginOptions): string {
  if (/^(?:[A-Za-z][A-Za-z\d+.-]*:|#|\/\/)/.test(href)) return href;
  if (href.startsWith('/') && kind === 'link') return href;
  const [path, suffix = ''] = href.split(/(?=[?#])/, 2) as [string, string?];
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
