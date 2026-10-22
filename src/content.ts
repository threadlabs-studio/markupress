import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseFragment, serialize, serializeOuter, type DefaultTreeAdapterMap } from 'parse5';
import { escapeHTML, literal, renderMarkdown, type OutlineItem } from './expressive.js';
import { stylesheet } from './styles.js';

export { escapeHTML, literal, renderMarkdown, type OutlineItem, type RenderedMarkdown } from './expressive.js';

export interface MarkdownOptions {
  readonly file: string;
  readonly pageName: string;
  /** Resolve authored document links and assets from their original source. */
  readonly resolveLink?: (href: string, kind: 'link' | 'asset') => string;
  /** Stylesheet files the page component imports, so their rules style this page's own region. */
  readonly styles?: readonly string[];
  /** Number the lines of highlighted code blocks unless a fence says `:no-line-numbers`. */
  readonly lineNumbers?: boolean;
  /** Front matter the page's own fields override, such as a site-wide default. */
  readonly frontmatter?: FrontMatter;
  /** The document `<title>` for the page's title, such as `Install | My site`; the page title by default. */
  readonly documentTitle?: (title: string) => string;
}
/** A page's validated front matter. Unknown or mistyped fields fail with the Markdown file's name. */
export interface FrontMatter {
  readonly title?: string;
  /** `<meta name="description">`, and the page's line in its folder's generated index. */
  readonly description?: string;
  /** The page's place among its folder's pages, as a number prefix gives it; on an index page, the folder's place (HTMLKit `hk:order`). */
  readonly order?: number;
  /**
   * `hidden` leaves the page out of navigation and keeps its route (HTMLKit `hk:navigation`). On a folder's index
   * page, `collapsed` starts the folder's sidebar group closed.
   */
  readonly navigation?: 'hidden' | 'collapsed';
  readonly id?: string;
  readonly aliases?: readonly string[];
  /** Old route paths in the page's version, each a redirect page to the page (HTMLKit `hk:redirect-from`). */
  readonly redirectFrom?: readonly string[];
  /** An HTMLKit layout name (app/layouts/<name>.html) in place of the site's layout, or false for none. */
  readonly layout?: string | false;
  /** The heading levels the page's outline lists, such as [2, 3], or false for no outline. */
  readonly outline?: false | readonly [number, number];
  readonly head?: {
    /** `<meta name content>` by name. */
    readonly meta?: Readonly<Record<string, string | number>>;
    /** Open Graph `<meta property="og:…" content>` by property name without its `og:` prefix. */
    readonly og?: Readonly<Record<string, string | number>>;
    readonly canonical?: string;
  };
  /** This page's "Edit this page" URL, or false to show none. */
  readonly editLink?: string | false;
  /** This page's language, a BCP 47 tag such as `fr`, in place of the site's `lang`. */
  readonly lang?: string;
  /** The pager's link to the page before this one: false for none, or a `label` and `href` in place of its own. */
  readonly previous?: PagerLink;
  /** The pager's link to the page after this one: false for none, or a `label` and `href` in place of its own. */
  readonly next?: PagerLink;
}
/** A pager link as front matter sets it. `href` is a link as in the page's Markdown, such as `../install.md`. */
export type PagerLink = false | { readonly label?: string; readonly href?: string };
/** A part of a page for search: the text from one heading to the next, or from the top to the first heading. */
export interface SearchSection {
  /** The heading's anchor, or "" for the text before the page's first heading. */
  readonly id: string;
  /** The heading's text, or "" before the first heading. */
  readonly heading: string;
  readonly text: string;
}
export interface CompiledMarkdown {
  readonly resource: string;
  readonly title: string;
  readonly id?: string;
  readonly aliases: readonly string[];
  readonly frontmatter: FrontMatter;
  /** The headings in the page's `outline` range, [2, 3] by default, in document order. */
  readonly outline: readonly OutlineItem[];
  /** An index page with an empty body: its layout lists the folder's pages below its title. */
  readonly generated: boolean;
  /** The page's text by heading, which the site's search index lists. */
  readonly sections: readonly SearchSection[];
}
const index = /^(?:\d+\.)?index\.md$/;
/** Whether a Markdown file is its folder's index page, which HTMLKit reads as the folder's own entry. */
export const isIndex = (file: string) => index.test(basename(file));
const text = (value: unknown) => typeof value === 'string' && value !== '';
const strings = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.values(value).every(item => typeof item === 'string' || typeof item === 'number');
const level = (value: unknown) => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 6;
function pagerLink(value: unknown): boolean {
  if (value === false) return true;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([key, item]) => (key === 'label' || key === 'href') && text(item));
}
const fieldTypes: Readonly<Record<string, readonly [check: (value: unknown) => boolean, expected: string]>> = {
  title: [text, 'a nonempty string'], description: [text, 'a nonempty string'],
  order: [value => Number.isSafeInteger(value) && (value as number) >= 0, 'a whole number'],
  navigation: [value => value === 'hidden' || value === 'collapsed', 'hidden, or collapsed on a folder\'s index page'],
  id: [text, 'a nonempty string'],
  aliases: [value => Array.isArray(value) && value.every(item => typeof item === 'string'), 'a list of route paths'],
  redirectFrom: [value => Array.isArray(value) && value.every(item => typeof item === 'string'), 'a list of route paths'],
  layout: [value => value === false || text(value), 'an HTMLKit layout name or false'],
  outline: [value => value === false || (Array.isArray(value) && value.length === 2 && value.every(level) && (value[0] as number) <= (value[1] as number)), 'false or a heading range such as [2, 3]'],
  head: [value => (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([key, item]) =>
    key === 'canonical' ? text(item) : (key === 'meta' || key === 'og') && strings(item))), 'a mapping of meta, og and canonical'],
  editLink: [value => value === false || text(value), 'a URL or false'],
  lang: [value => text(value) && /^[A-Za-z]{2,8}(?:-[A-Za-z\d]{1,8})*$/.test(value as string), 'a language tag such as fr or pt-BR'],
  previous: [pagerLink, 'false, or a mapping of label and href'],
  next: [pagerLink, 'false, or a mapping of label and href'],
};
function validFrontMatter(fields: Readonly<Record<string, unknown>>, file: string): FrontMatter {
  for (const [name, value] of Object.entries(fields)) {
    const type = fieldTypes[name];
    if (type === undefined) throw new Error(`${file}: unknown front matter field ${name}. Fields are ${Object.keys(fieldTypes).join(', ')}.`);
    if (!type[0](value)) throw new Error(`${file}: front matter ${name} must be ${type[1]}.`);
  }
  // HTMLKit reads a folder from its index page, so only an index page can start its folder collapsed.
  if (fields.navigation === 'collapsed' && !isIndex(file)) throw new Error(`${file}: front matter navigation collapsed applies to a folder's index page.`);
  return fields as FrontMatter;
}

export async function compileMarkdown(source: string, options: MarkdownOptions): Promise<CompiledMarkdown> {
  const { html, frontmatter: raw, empty, headings, hasCode, components } = await renderMarkdown(source, options);
  const own = validFrontMatter(raw, options.file);
  // A pager link's href resolves as a link in the page's Markdown does.
  const pager = (link: PagerLink): PagerLink => link && link.href !== undefined && options.resolveLink ? { ...link, href: options.resolveLink(link.href, 'link') } : link;
  const fields = { ...options.frontmatter, ...own, ...(own.previous === undefined ? {} : { previous: pager(own.previous) }), ...(own.next === undefined ? {} : { next: pager(own.next) }) };
  const aliases = fields.aliases ?? [];
  const fragment = parseFragment(html);
  const declarations: string[] = [];
  const metadata: string[] = [];
  const imports: string[] = [];
  const original = pathToFileURL(resolve(options.file)).href;
  const rebase = (value: string) => /^(?:\.\.?\/|\/)/.test(value) ? new URL(value, original).href : value;
  const visit = (node: DefaultTreeAdapterMap['node'], inCarrier: boolean): void => {
    if ('tagName' in node) {
      if (node.tagName === 'style') for (const child of node.childNodes) if ('value' in child) child.value = stylesheet(child.value, options.file, true).css;
      for (const attribute of node.attrs) {
        if (attribute.name === 'controller') attribute.value = rebase(attribute.value);
        if (node.tagName === 'link' && attribute.name === 'href' && node.attrs.some(attr => attr.name === 'rel' && attr.value.split(/\s+/).includes('component'))) attribute.value = rebase(attribute.value);
        else if (options.resolveLink && ((attribute.name === 'href' && node.tagName === 'a') || (attribute.name === 'src' && node.tagName === 'img'))) {
          // Every authored link and image, from Markdown or raw HTML, resolves here once.
          attribute.value = options.resolveLink(attribute.value, attribute.name === 'src' ? 'asset' : 'link');
        }
      }
      if (node.tagName === 'template' && 'content' in node) visit(node.content, true);
    }
    if ('childNodes' in node) {
      const kept: typeof node.childNodes = [];
      for (const child of node.childNodes) {
        visit(child, inCarrier);
        if (!inCarrier && 'tagName' in child && child.tagName === 'template' && child.attrs.some(attr => attr.name === 'component')) declarations.push(serializeOuter(child));
        else if (!inCarrier && 'tagName' in child && child.tagName === 'link' && child.attrs.some(attr => attr.name === 'rel' && attr.value.split(/\s+/).includes('component'))) declarations.push(serializeOuter(child));
        // A stylesheet is no head declaration: the page's <style> imports it, which scopes it to the page as its own CSS.
        else if (!inCarrier && 'tagName' in child && child.tagName === 'link' && child.attrs.some(attr => attr.name === 'rel' && attr.value.split(/\s+/).includes('stylesheet'))) {
          const attr = (name: string) => child.attrs.find(item => item.name === name)?.value;
          imports.push(`@import ${JSON.stringify(attr('href') ?? '')}${attr('media') ? ` ${attr('media')}` : ''};`);
        }
        else if (!inCarrier && 'tagName' in child && ['title', 'meta', 'link'].includes(child.tagName)) metadata.push(serializeOuter(child));
        else kept.push(child);
      }
      node.childNodes = kept;
    }
  };
  visit(fragment, false);
  const title = fields.title ?? headings[0]?.label ?? basename(options.file, '.md').replace(/^\d+\./, '');
  const blocks = new Set(components);
  const article = fields.layout === 'home' ? home(fragment, title, blocks) : serialize(fragment);
  for (const name of blocks) declarations.push(`<link rel="component" href="@threadlabs/looma/components/${name}/${name}.html">`);
  // A folder's index page with front matter only generates the folder's listing, which the layout's loader supplies.
  const generated = isIndex(options.file) && empty;
  // Front matter becomes head declarations and HTMLKit settings in the page's <defs>: HTMLKit owns navigation labels,
  // order, visibility, alias routes, the layout choice, and the document head, where the page's entries win over its layout's.
  const { meta = {}, og = {}, canonical } = fields.head ?? {};
  // An authored <title> takes the place of the generated one, since a definition declares one title.
  const head = (metadata.some(item => item.startsWith('<title')) ? '' : `<title>${literal(escapeHTML(options.documentTitle?.(title) ?? title))}</title>`) + (fields.description === undefined ? '' : `<meta name="description" content="${escapeHTML(fields.description)}">`) +
    `<meta name="hk:label" content="${escapeHTML(title)}">` + (fields.navigation === 'hidden' ? '<meta name="hk:navigation" content="hidden">' : '') +
    (fields.order === undefined ? '' : `<meta name="hk:order" content="${fields.order}">`) +
    aliases.map(alias => `<meta name="hk:alias" content="${escapeHTML(alias)}">`).join('') +
    (fields.redirectFrom ?? []).map(path => `<meta name="hk:redirect-from" content="${escapeHTML(path)}">`).join('') +
    (fields.layout === undefined ? '' : `<meta name="hk:layout" content="${fields.layout === false ? 'none' : escapeHTML(fields.layout)}">`) +
    Object.entries(meta).map(([name, content]) => `<meta name="${escapeHTML(name)}" content="${escapeHTML(String(content))}">`).join('') +
    Object.entries(og).map(([name, content]) => `<meta property="og:${escapeHTML(name)}" content="${escapeHTML(String(content))}">`).join('') +
    (canonical === undefined ? '' : `<link rel="canonical" href="${escapeHTML(canonical)}">`);
  const [from, to] = fields.outline === false ? [0, -1] : fields.outline ?? [2, 3];
  const css = [...(options.styles ?? []).map(file => `@import "${pathToFileURL(file).href}";`), ...imports].join('');
  const styles = css ? `<style>${stylesheet(css, options.file, true).css}</style>` : '';
  return { title, aliases, generated, sections: searchSections(fragment), ...(fields.id === undefined ? {} : { id: fields.id }),
    frontmatter: fields, outline: headings.filter(heading => heading.depth >= from && heading.depth <= to),
    resource: `<meta name="hk:page" content="${escapeHTML(options.pageName)}">\n${declarations.join('\n')}\n<template component="${escapeHTML(options.pageName)}"${hasCode ? ' controller="markupress/controllers/code.js"' : ''}><defs>${head}${metadata.join('')}</defs><article class="markupress-prose">${generated ? `<h1>${literal(escapeHTML(title))}</h1>` : ''}${article}</article>${styles}</template>\n` };
}

/**
 * The rendered page's text, split at each heading with an anchor. Code buttons, component definitions and styles hold
 * no reading text, and Markdown's literal-brace escapes are removed, so the text reads as the page shows it.
 */
const inline = new Set(['a', 'abbr', 'b', 'code', 'del', 'em', 'i', 'ins', 'kbd', 'mark', 's', 'small', 'span', 'strong', 'sub', 'sup', 'u']);
function searchSections(fragment: DefaultTreeAdapterMap['documentFragment']): SearchSection[] {
  const sections = [{ id: '', heading: '', text: '' }];
  const visit = (node: DefaultTreeAdapterMap['node']): void => {
    if ('value' in node && node.nodeName === '#text') { sections.at(-1)!.text += node.value; return; }
    if (!('tagName' in node) || ['template', 'style', 'script'].includes(node.tagName) || node.attrs.some(attr => attr.name === 'class' && attr.value === 'code-actions')) return;
    const id = /^h[1-6]$/.test(node.tagName) ? node.attrs.find(attr => attr.name === 'id')?.value : undefined;
    if (id !== undefined) { sections.push({ id, heading: textContent(node), text: '' }); return; }
    for (const child of node.childNodes) visit(child);
    // Block boundaries separate words that the HTML runs together.
    if (!inline.has(node.tagName)) sections.at(-1)!.text += ' ';
  };
  for (const node of fragment.childNodes) visit(node);
  const clean = (text: string) => text.replace(/\\([\\{])/g, '$1').replace(/\s+/g, ' ').trim();
  return sections.map(section => ({ id: section.id, heading: clean(section.heading), text: clean(section.text) })).filter(section => section.id !== '' || section.text !== '');
}

function textContent(node: DefaultTreeAdapterMap['node']): string {
  if ('value' in node) return node.value;
  return 'childNodes' in node ? node.childNodes.map(textContent).join('') : '';
}

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
const element = (node: Node, tag: string): node is Element => 'tagName' in node && node.tagName === tag;
/** A paragraph holding only `tag` elements, at least one, and the space between them. */
const only = (node: Node, tag: string): node is Element => element(node, 'p') && node.childNodes.some(child => element(child, tag)) &&
  node.childNodes.every(child => element(child, tag) || (child.nodeName === '#text' && 'value' in child && child.value.trim() === ''));

/**
 * A home page (`layout: home`) is read from its Markdown structure, so it reads the same as plain Markdown anywhere.
 * Everything before the first h2 is the hero: its h1 is the title, a paragraph of only links is its actions (the first
 * one primary), an image alone in its paragraph is its image, and the rest is its tagline. Each h2 starts a feature card
 * that holds everything up to the next h2.
 */
function home(fragment: DefaultTreeAdapterMap['documentFragment'], title: string, components: Set<string>): string {
  const hero: Node[] = [], features: Node[][] = [];
  for (const node of fragment.childNodes) {
    if (element(node, 'h2')) features.push([node]);
    else (features.at(-1) ?? hero).push(node);
  }
  // Looma Markdown renders an image alone in its paragraph as a block image, with no paragraph.
  const actions = hero.find(node => only(node, 'a')), image = hero.find(node => element(node, 'img') || only(node, 'img'));
  // Markdown puts text in blocks, so the fragment's own text nodes are only the space between them.
  const outer = (nodes: readonly Node[]) => nodes.map(node => 'tagName' in node ? serializeOuter(node) : '').join('');
  const heading = hero.some(node => element(node, 'h1')) ? '' : `<h1>${literal(escapeHTML(title))}</h1>`;
  const buttons = (actions && 'childNodes' in actions ? actions.childNodes : []).filter(child => element(child, 'a')).map((link, index) =>
    `<ui-button as="a" href="${escapeHTML(link.attrs.find(attr => attr.name === 'href')?.value ?? '')}" variant="${index === 0 ? 'solid' : 'outline'}" size="lg">${serialize(link)}</ui-button>`).join('');
  if (buttons) components.add('ui-cluster').add('ui-button');
  if (features.length > 0) components.add('ui-grid').add('ui-card');
  return `<header class="hero"><div class="hero-text">${heading}${outer(hero.filter(node => node !== actions && node !== image))}` +
    (buttons ? `<ui-cluster class="actions" gap="m">${buttons}</ui-cluster>` : '') + '</div>' +
    (image ? `<div class="hero-image">${element(image, 'p') ? serialize(image) : outer([image])}</div>` : '') + '</header>' +
    (features.length === 0 ? '' : `<ui-grid class="features" min="md">${features.map(nodes => `<ui-card as="section">${outer(nodes)}</ui-card>`).join('')}</ui-grid>`);
}
