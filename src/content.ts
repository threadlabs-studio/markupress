import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse, headingAnchors, type Node as MarkdownNode, type Document as MarkdownDocument, type HtmlAllowlist, type Syntax } from 'expressmark';
import { renderHtml, type HtmlRenderOptions, type HtmlTransformer } from 'expressmark/render';
import { parseFragment, serialize, serializeOuter, type DefaultTreeAdapterMap } from 'parse5';
import { bundledLanguages, createHighlighter, type BundledLanguage, type Highlighter, type ShikiTransformer } from 'shiki';
import { parseDocument } from 'yaml';
import { stylesheet } from './styles.js';
import { english, resolveTranslations, textDirection, type TranslationOverrides, type Translations } from './i18n.js';

export interface LanguageAlternate {
  readonly hreflang: string;
  readonly href: string;
}
export interface MarkdownOptions {
  /** Declarative alternate-language links in this page's head. */
  readonly alternates?: readonly LanguageAlternate[];
  /** Reader labels for code actions and unlabelled details blocks. */
  readonly translations?: TranslationOverrides;
  readonly file: string;
  readonly pageName: string;
  /** Resolve authored document links and assets from their original source. */
  readonly resolveLink?: (href: string, kind: 'link' | 'asset') => string;
  /** Stylesheet files the page component imports, so their rules style this page's own region. */
  readonly styles?: readonly string[];
  /** Number the lines of highlighted code blocks unless a fence says `show-line-numbers=false`. */
  readonly lineNumbers?: boolean;
  /** Front matter the page's own fields override, such as a site-wide default. */
  readonly frontmatter?: FrontMatter;
  /** The Markdown syntax of pages whose front matter sets no `markdownSyntax`; `standard` by default. */
  readonly markdownSyntax?: Syntax;
  /** The document `<title>` for the page's title, such as `Install | My site`; the page title by default. */
  readonly documentTitle?: (title: string) => string;
}
/** A page's validated front matter. Unknown or mistyped fields fail with the Markdown file's name. */
export interface FrontMatter {
  /** Whether this page appears in search, true by default. */
  readonly search?: boolean;
  readonly title?: string;
  /** `<meta name="description">`, and the page's line in its folder's generated index. */
  readonly description?: string;
  /** The page's place among its folder's pages, as a number prefix gives it; on an index page, the folder's place (MarkupKit `mk:order`). */
  readonly order?: number;
  /**
   * `hidden` leaves the page out of navigation and keeps its route (MarkupKit `mk:navigation`). On a folder's index
   * page, `collapsed` starts the folder's sidebar group closed. `overview` makes a
   * non-index page the containing route group's overview link.
   */
  readonly navigation?: 'hidden' | 'collapsed' | 'overview';
  /** Show documentation navigation; a folder index supplies its descendants' default. */
  readonly sidebar?: boolean;
  readonly id?: string;
  readonly aliases?: readonly string[];
  /** Old route paths in the page's version, each a redirect page to the page (MarkupKit `mk:redirect-from`). */
  readonly redirectFrom?: readonly string[];
  /** An MarkupKit layout name (app/layouts/<name>.html) in place of the site's layout, or false for none. */
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
  /** How this page's Markdown reads: `standard` Expressive Markdown or `compatible` CommonMark and GFM. */
  readonly markdownSyntax?: Syntax;
  /** Native page direction, overriding the locale's configured or inferred direction. */
  readonly dir?: 'ltr' | 'rtl' | 'auto';
  /** The pager's link to the page before this one: false for none, or a `label` and `href` in place of its own. */
  readonly previous?: PagerLink;
  /** The pager's link to the page after this one: false for none, or a `label` and `href` in place of its own. */
  readonly next?: PagerLink;
}
/** A pager link as front matter sets it. `href` is a link as in the page's Markdown, such as `../install.md`. */
export type PagerLink = false | { readonly label?: string; readonly href?: string };
/** A heading the page's outline lists. */
export interface OutlineItem {
  readonly id: string;
  /** The heading's fragment link, `#id`. */
  readonly href: string;
  readonly label: string;
  readonly depth: number;
}
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
/** Whether a Markdown file is its folder's index page, which MarkupKit reads as the folder's own entry. */
export const isIndex = (file: string) => index.test(basename(file));
export function escapeHTML(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Markdown text is literal author content. Raw HTML tokens retain component expressions.
export function literal(value: string): string { return value.replace(/\\/g, '\\\\').replace(/{/g, '\\{'); }

// Token colors are light-dark(light, dark), so they follow the page's color-scheme; --shiki-light and
// --shiki-dark carry the same colors for sites that switch another way. These themes keep common
// tokens at 4.5:1 or better on Looma's light and dark page surfaces.
const themes = { light: 'github-light-default', dark: 'github-dark-default' } as const;
let highlighter: Promise<Highlighter> | undefined;
const shikiOutput: ShikiTransformer = {
  // The site's stylesheet owns the code block's surface; Shiki's colors stay on the tokens.
  pre(node) { delete node.properties.style; },
  code(node) { this.addClassToHast(node, `language-${this.options.lang}`); },
  // Code is literal author content: escape it like Markdown text so HTML Next never interpolates it.
  span(node) { for (const child of node.children) if (child.type === 'text') child.value = literal(child.value); },
};
// Plain text needs no grammar, yet takes line highlighting and numbers like any highlighted language.
const plain = new Set(['text', 'plaintext', 'txt', 'plain']);
async function highlight(code: string, lang: string, lines: ShikiTransformer): Promise<string> {
  // One highlighter serves every page; a grammar loads the first time a fence uses its language.
  const shiki = await (highlighter ??= createHighlighter({ themes: Object.values(themes), langs: [] }));
  if (!plain.has(lang)) await shiki.loadLanguage(lang as BundledLanguage);
  return shiki.codeToHtml(code, { lang, themes, defaultColor: 'light-dark()', transformers: [shikiOutput, lines] });
}
// Line highlighting and numbers are classes written at build time; the theme's stylesheet draws them. The fence
// metadata stays on <code> while Expressmark owns its syntax.
const lineClasses = (marked: ReadonlySet<number>, numbers: boolean, meta: string): ShikiTransformer => ({
  pre(node) { if (numbers) this.addClassToHast(node, 'line-numbers'); },
  code(node) { if (meta) node.properties['data-meta'] = meta; },
  line(node, line) { if (marked.has(line)) this.addClassToHast(node, 'highlighted'); },
});
// Hidden until the page's code controller connects, so without JavaScript a code block is only its code.
const codeActions = (ui: Translations) => '<div class="code-actions" hidden aria-live="polite"><button type="button" data-code-action="wrap" aria-pressed="false">' +
  literal(escapeHTML(ui.codeWrap)) + '</button><button type="button" data-code-action="copy"' +
  ` data-code-label-copy="${literal(escapeHTML(ui.codeCopy))}" data-code-label-copied="${literal(escapeHTML(ui.codeCopied))}" data-code-label-failed="${literal(escapeHTML(ui.codeCopyFailed))}">${literal(escapeHTML(ui.codeCopy))}</button></div>`;

function textContent(node: DefaultTreeAdapterMap['node']): string {
  if ('value' in node) return node.value;
  return 'childNodes' in node ? node.childNodes.map(textContent).join('') : '';
}

/** Plain labels are separate from the rich body and remain literal component prop values. */
const markdownText = (node: MarkdownNode | string | undefined): string => typeof node === 'string' ? node : node === undefined ? ''
  : node.value ?? (node.body ?? node.children ?? []).map(markdownText).join('');
const walkMarkdown = (node: MarkdownNode, visit: (node: MarkdownNode) => void): void => {
  visit(node);
  if (typeof node.title === 'object') walkMarkdown(node.title, visit);
  for (const child of node.body ?? node.children ?? []) walkMarkdown(child, visit);
};
const codeFigure = (pre: string, title = '', ui: Translations = english) => `<figure class="code">${title ? `<figcaption>${literal(escapeHTML(title))}</figcaption>` : ''}${codeActions(ui)}${pre}</figure>`;
const codeLines = (value: string): ReadonlySet<number> => new Set(value.split(',').flatMap(part => {
  const match = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
  if (!match) return [];
  const start = Number(match[1]), end = Number(match[2] ?? start);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}));

/**
 * Authored pages are trusted HTML Next source, not submitted HTML. Expressmark still owns the
 * Markdown grammar and HTML rendering; its host allowlist admits the exact native tags and props
 * present in that source, plus the components and code styles this presentation emits.
 */
function hostHtml(document: MarkdownDocument): HtmlAllowlist {
  const tags = new Set(['ui-callout', 'ui-tabs', 'button', 'input']);
  const attributes = new Set(['heading', 'tone', 'group', 'type', 'hidden', 'disabled', 'checked', 'role', 'tabindex']);
  const styles: Record<string, readonly RegExp[]> = { color: [/^light-dark\(.*\)$/], '--shiki-light': [/^#[\da-f]+$/i], '--shiki-dark': [/^#[\da-f]+$/i] };
  const visit = (node: DefaultTreeAdapterMap['node']): void => {
    if ('tagName' in node) {
      tags.add(node.tagName);
      for (const attribute of node.attrs) {
        attributes.add(attribute.name);
        if (attribute.name === 'style') for (const declaration of attribute.value.split(';')) {
          const property = declaration.slice(0, declaration.indexOf(':')).trim();
          if (property) styles[property] = [/^[\s\S]*$/];
        }
      }
      if ('content' in node) visit(node.content);
    }
    if ('childNodes' in node) node.childNodes.forEach(visit);
  };
  walkMarkdown(document, node => {
    if (node.type === 'htmlElement') visit(parseFragment(`${node.open ?? ''}${node.close ?? ''}`));
    else if (node.type === 'html') visit(parseFragment(node.value ?? ''));
  });
  return { tags: [...tags], attributes: { '*': [...attributes] }, styles };
}

function frontmatter(source: string, file: string) {
  const split = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(source);
  if (split === null) return { body: source, fields: {} as Record<string, unknown> };
  const document = parseDocument(split[1]!);
  if (document.errors.length > 0) throw new Error(`${file}: ${document.errors.map(error => error.message).join('; ')}`);
  const fields: unknown = document.toJS();
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) throw new Error(`${file}: frontmatter must be a mapping.`);
  return { body: source.slice(split[0].length), fields: fields as Record<string, unknown> };
}

const syntaxes: readonly Syntax[] = ['standard', 'compatible'];
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
  search: [value => typeof value === 'boolean', 'true or false'],
  title: [text, 'a nonempty string'], description: [text, 'a nonempty string'],
  order: [value => Number.isSafeInteger(value) && (value as number) >= 0, 'a whole number'],
  navigation: [value => value === 'hidden' || value === 'collapsed' || value === 'overview', 'hidden, overview, or collapsed on a folder\'s index page'],
  sidebar: [value => typeof value === 'boolean', 'true or false'],
  markdownSyntax: [value => syntaxes.includes(value as Syntax), 'standard or compatible'],
  id: [text, 'a nonempty string'],
  aliases: [value => Array.isArray(value) && value.every(item => typeof item === 'string'), 'a list of route paths'],
  redirectFrom: [value => Array.isArray(value) && value.every(item => typeof item === 'string'), 'a list of route paths'],
  layout: [value => value === false || text(value), 'an MarkupKit layout name or false'],
  outline: [value => value === false || (Array.isArray(value) && value.length === 2 && value.every(level) && (value[0] as number) <= (value[1] as number)), 'false or a heading range such as [2, 3]'],
  head: [value => (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([key, item]) =>
    key === 'canonical' ? text(item) : (key === 'meta' || key === 'og') && strings(item))), 'a mapping of meta, og and canonical'],
  editLink: [value => value === false || text(value), 'a URL or false'],
  dir: [value => value === 'ltr' || value === 'rtl' || value === 'auto', 'ltr, rtl, or auto'],
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
  // MarkupKit reads a folder from its index page, so only an index page can start its folder collapsed.
  if (fields.navigation === 'collapsed' && !isIndex(file)) throw new Error(`${file}: front matter navigation collapsed applies to a folder's index page.`);
  if (fields.navigation === 'overview' && isIndex(file)) throw new Error(`${file}: a folder index is already its overview; navigation overview applies to a non-index page inside a route group.`);
  return fields as FrontMatter;
}

/** Read the same validated metadata used by compilation, without rendering the document body. */
export function readFrontMatter(source: string, file: string): FrontMatter {
  return validFrontMatter(frontmatter(source, file).fields, file);
}

/** A Markdown document rendered by Expressmark and Markupress's presentation, before Markupress's page layer. */
export interface RenderedMarkdown {
  /** The document's HTML, as HTML Next template content: Markdown text escapes its braces. */
  readonly html: string;
  /** The front matter mapping as parsed, before any host schema reads it. */
  readonly frontmatter: Readonly<Record<string, unknown>>;
  /** The document after its front matter. */
  readonly body: string;
  /** Every heading, in document order. */
  readonly headings: readonly OutlineItem[];
  readonly hasCode: boolean;
  /** The Looma components the document's blocks render. */
  readonly components: ReadonlySet<string>;
}

/**
 * Expressmark owns standard syntax and native HTML rendering. Markupress supplies component presentation,
 * highlighting and literal text escaping. Its own front matter schema stays in compileMarkdown.
 */
export async function renderMarkdown(source: string, options: Pick<MarkdownOptions, 'file' | 'lineNumbers' | 'markdownSyntax' | 'translations'>): Promise<RenderedMarkdown> {
  const { body, fields } = frontmatter(source, options.file);
  const ui = options.translations === undefined ? english : resolveTranslations('en', options.translations);
  const syntax = fields.markdownSyntax ?? options.markdownSyntax ?? 'standard';
  if (!syntaxes.includes(syntax as Syntax)) throw new Error(`${options.file}: markdownSyntax must be standard or compatible.`);
  const document = parse(body, { syntax: syntax as Syntax, trustedHtml: true });
  const highlighted = new Map<MarkdownNode, string>(), components = new Set<string>(), headings: OutlineItem[] = [];
  const anchors = headingAnchors(document);
  const codes: MarkdownNode[] = [];
  walkMarkdown(document, node => { if (node.type === 'code') codes.push(node); });
  for (const node of codes) {
    const language = node.language ?? '', meta = node.meta ?? '';
    const marked = codeLines(String(node.attributes?.highlight ?? ''));
    const numbers = node.attributes?.showLineNumbers === undefined ? options.lineNumbers ?? false : node.attributes.showLineNumbers !== false && node.attributes.showLineNumbers !== 'false';
    const code = node.value ?? '';
    const known = language && (Object.hasOwn(bundledLanguages, language) || plain.has(language));
    const pre = known ? await highlight(code, language, lineClasses(marked, numbers, meta))
      : `<pre tabindex="0"${numbers ? ' class="line-numbers"' : ''}><code${language ? ` class="language-${escapeHTML(language)}"` : ''}${meta ? ` data-meta="${escapeHTML(meta)}"` : ''}>${literal(escapeHTML(code))}</code></pre>`;
    highlighted.set(node, codeFigure(pre, markdownText(node.title), ui));
  }
  const trustedHtml = hostHtml(document);
  const attributes = (node: MarkdownNode) => Object.entries({ ...(node.id === undefined ? {} : { id: node.id }), ...node.attributes })
    .filter(([name]) => ['id', 'class', 'lang', 'dir'].includes(name)).map(([name, value]) => ` ${name}="${escapeHTML(String(value))}"`).join('');
  const title = (node: MarkdownNode) => markdownText(node.title);
  const transformers: Record<string, HtmlTransformer> = {
    code: node => highlighted.get(node),
    inlineCode: node => `<code>${literal(escapeHTML(node.value ?? ''))}</code>`,
    heading: (node, context) => {
      const id = anchors.get(node)!;
      return `<h${node.level} id="${escapeHTML(id)}"><a href="#${escapeHTML(id)}">${context.renderChildren()}</a></h${node.level}>`;
    },
    'container:tabs': (node, context) => {
      if (!node.body?.length || !node.body.every(child => child.type === 'container' && child.subType === 'tab')) return undefined;
      components.add('ui-tabs');
      return `<ui-tabs${attributes(node)} group="${escapeHTML(String(node.attributes?.group ?? node.body[0]?.attributes?.group ?? 'tabs'))}">${context.renderChildren()}</ui-tabs>`;
    },
    'container:tab': (node, context) => `<section${attributes(node)} aria-label="${escapeHTML(title(node))}">${context.renderChildren()}</section>`,
    'container:details': (node, context) => `<details${attributes(node)}${node.attributes?.open ? ' open' : ''}><summary>${literal(escapeHTML(title(node) || ui.details))}</summary>${context.renderChildren()}</details>`,
  };
  const callout = (tone: string | undefined): HtmlTransformer => (node, context) => {
    components.add('ui-callout');
    return `<ui-callout${attributes(node)}${tone ? ` tone="${tone === 'caution' ? 'danger' : tone}"` : ''}${node.title ? ` heading="${escapeHTML(title(node))}"` : ''}>${context.renderChildren()}</ui-callout>`;
  };
  for (const tone of ['note', 'tip', 'info', 'important', 'warning', 'danger', 'caution', 'success', 'neutral']) transformers[`container:${tone}`] = callout(tone);
  // A container with no type is a callout in Looma's default tone.
  const defaultCallout = callout(undefined);
  transformers.container = (node, context) => node.subType === undefined ? defaultCallout(node, context) : undefined;
  const toc: HtmlTransformer = (node, context) => {
    const depth = Number(node.attributes?.depth ?? 3), format = String(node.attributes?.format ?? 'plain');
    const list = format === 'numbered' ? 'ol' : format === 'bulleted' ? 'ul' : 'div';
    const entries = [...anchors].filter(([heading]) => (heading.level ?? 0) <= depth).map(([heading, id]) => {
      const link = `<a href="#${escapeHTML(id)}">${literal(escapeHTML(markdownText(heading)))}</a>`;
      return list === 'div' ? `<div role="listitem">${link}</div>` : `<li>${link}</li>`;
    }).join('');
    return `<nav data-type="toc" data-format="${escapeHTML(format)}"${attributes(node)}>${node.title ? `<header>${context.render(typeof node.title === 'string' ? { type: 'title', value: node.title } : node.title)}</header>` : ''}<${list} role="list">${entries}</${list}></nav>`;
  };
  transformers['container:toc'] = toc;
  transformers['leaf:toc'] = toc;
  // Component usage passes through as native HTML. External .html definitions are loaded,
  // bound and rendered later by HTML Next; Expressmark never sees those definitions.
  const renderOptions: HtmlRenderOptions = { transformers, trustedHtml, headingIds: true, title: false, escapeText: literal };
  const html = renderHtml(document, renderOptions);
  // Markdown and authored HTML share one outline in document order. A template defines
  // another component; its headings, like escaped code examples, are not page headings.
  const collectHeadings = (node: DefaultTreeAdapterMap['node']): void => {
    if ('tagName' in node) {
      if (node.tagName === 'template') return;
      const id = node.attrs.find(attribute => attribute.name === 'id')?.value;
      const hidden = node.attrs.some(attribute => attribute.name === 'hidden' || (attribute.name === 'aria-hidden' && attribute.value === 'true')
        || (attribute.name === 'class' && attribute.value.split(/\s+/).includes('sr-only')));
      if (hidden) return;
      if (/^h[1-6]$/.test(node.tagName) && id) {
        const label = textContent(node).replace(/\\([\\{])/g, '$1');
        headings.push({ id, href: `#${id}`, label, depth: Number(node.tagName.slice(1)) });
      }
    }
    if ('childNodes' in node) node.childNodes.forEach(collectHeadings);
  };
  collectHeadings(parseFragment(html));
  return { html, frontmatter: fields, body, headings, hasCode: codes.length > 0, components };
}

export async function compileMarkdown(source: string, options: MarkdownOptions): Promise<CompiledMarkdown> {
  const { html, frontmatter: raw, body, headings, hasCode, components } = await renderMarkdown(source, options);
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
        // A page links its components; their definitions live in component files.
        if (!inCarrier && 'tagName' in child && child.tagName === 'link' && child.attrs.some(attr => attr.name === 'rel' && attr.value.split(/\s+/).includes('component'))) declarations.push(serializeOuter(child));
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
  const generated = isIndex(options.file) && body.trim() === '';
  // Front matter becomes head declarations and MarkupKit settings in the page's <defs>: MarkupKit owns navigation labels,
  // order, visibility, alias routes, the layout choice, and the document head, where the page's entries win over its layout's.
  const { meta = {}, og = {}, canonical } = fields.head ?? {};
  // An authored <title> takes the place of the generated one, since a definition declares one title.
  const head = (metadata.some(item => item.startsWith('<title')) ? '' : `<title>${literal(escapeHTML(options.documentTitle?.(title) ?? title))}</title>`) + (fields.description === undefined ? '' : `<meta name="description" content="${escapeHTML(fields.description)}">`) +
    `<meta name="mk:label" content="${escapeHTML(title)}">` + (fields.navigation === 'hidden' ? '<meta name="mk:navigation" content="hidden">' : '') +
    (fields.order === undefined ? '' : `<meta name="mk:order" content="${fields.order}">`) +
    aliases.map(alias => `<meta name="mk:alias" content="${escapeHTML(alias)}">`).join('') +
    (fields.redirectFrom ?? []).map(path => `<meta name="mk:redirect-from" content="${escapeHTML(path)}">`).join('') +
    (fields.layout === undefined ? '' : `<meta name="mk:layout" content="${fields.layout === false ? 'none' : escapeHTML(fields.layout)}">`) +
    Object.entries(meta).map(([name, content]) => `<meta name="${escapeHTML(name)}" content="${escapeHTML(String(content))}">`).join('') +
    Object.entries(og).map(([name, content]) => `<meta property="og:${escapeHTML(name)}" content="${escapeHTML(String(content))}">`).join('') +
    (canonical === undefined ? '' : `<link rel="canonical" href="${escapeHTML(canonical)}">`) +
    (options.alternates ?? []).map(link => `<link rel="alternate" hreflang="${literal(escapeHTML(link.hreflang))}" href="${literal(escapeHTML(link.href))}">`).join('');
  const [from, to] = fields.outline === false ? [0, -1] : fields.outline ?? [2, 3];
  const css = [...(options.styles ?? []).map(file => `@import "${pathToFileURL(file).href}";`), ...imports].join('');
  const styles = css ? `<style>${stylesheet(css, options.file, true).css}</style>` : '';
  const lang = fields.lang, dir = fields.dir ?? (lang === undefined ? undefined : textDirection(lang));
  const language = (lang === undefined ? '' : ` lang="${escapeHTML(lang)}"`) + (dir === undefined ? '' : ` dir="${dir}"`);
  return { title, aliases, generated, sections: searchSections(fragment), ...(fields.id === undefined ? {} : { id: fields.id }),
    frontmatter: fields, outline: headings.filter(heading => heading.depth >= from && heading.depth <= to),
    resource: `<meta name="mk:page" content="${escapeHTML(options.pageName)}">\n${declarations.join('\n')}\n<template component="${escapeHTML(options.pageName)}"${hasCode ? ' controller="markupress/controllers/code.js"' : ''}><defs>${head}${metadata.join('')}</defs><article class="markupress-prose"${language}>${generated ? `<h1>${literal(escapeHTML(title))}</h1>` : ''}${article}</article>${styles}</template>\n` };
}

/**
 * The rendered page's text, split at each heading with an anchor. Code buttons, component definitions and styles hold
 * no reading text, and Markdown's literal-brace escapes are removed, so the text reads as the page shows it.
 */
const inline = new Set(['a', 'abbr', 'b', 'code', 'del', 'em', 'i', 'ins', 'kbd', 'mark', 's', 'small', 'span', 'strong', 'sub', 'sup', 'u']);
function searchSections(fragment: DefaultTreeAdapterMap['documentFragment']): SearchSection[] {
  const sections = [{ id: '', heading: '', text: '' }];
  const ignored = (node: DefaultTreeAdapterMap['element']) => node.attrs.some(attr => attr.name === 'data-search-ignore');
  const headingText = (node: DefaultTreeAdapterMap['node']): string => 'value' in node ? node.value
    : 'tagName' in node && ignored(node) ? ' ' : 'childNodes' in node ? node.childNodes.map(headingText).join('') : '';
  const visit = (node: DefaultTreeAdapterMap['node']): void => {
    if ('value' in node && node.nodeName === '#text') { sections.at(-1)!.text += node.value; return; }
    if (!('tagName' in node) || ['template', 'style', 'script'].includes(node.tagName) || node.attrs.some(attr => attr.name === 'class' && attr.value === 'code-actions')) return;
    if (ignored(node)) { sections.at(-1)!.text += ' '; return; }
    const id = /^h[1-6]$/.test(node.tagName) ? node.attrs.find(attr => attr.name === 'id')?.value : undefined;
    if (id !== undefined) { sections.push({ id, heading: headingText(node), text: '' }); return; }
    for (const child of node.childNodes) visit(child);
    // Block boundaries separate words that the HTML runs together.
    if (!inline.has(node.tagName)) sections.at(-1)!.text += ' ';
  };
  for (const node of fragment.childNodes) visit(node);
  const clean = (text: string) => text.replace(/\\([\\{])/g, '$1').replace(/\s+/g, ' ').trim();
  return sections.map(section => ({ id: section.id, heading: clean(section.heading), text: clean(section.text) })).filter(section => section.id !== '' || section.text !== '');
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
 * one primary), an image or an element marked data-hero-media is its media, and the rest is its tagline. Each h2 starts a feature card
 * that holds everything up to the next h2.
 */
function home(fragment: DefaultTreeAdapterMap['documentFragment'], title: string, components: Set<string>): string {
  const hero: Node[] = [], features: Node[][] = [];
  for (const node of fragment.childNodes) {
    if (element(node, 'h2')) features.push([node]);
    else (features.at(-1) ?? hero).push(node);
  }
  // An image may be a standalone node or the only content of its paragraph.
  const actions = hero.find(node => only(node, 'a')), image = hero.find(node => ('tagName' in node && node.attrs.some(attr => attr.name === 'data-hero-media')) || element(node, 'img') || only(node, 'img'));
  // Markdown puts text in blocks, so the fragment's own text nodes are only the space between them.
  const outer = (nodes: readonly Node[]) => nodes.map(node => 'tagName' in node ? serializeOuter(node) : '').join('');
  const heading = hero.some(node => element(node, 'h1')) ? '' : `<h1>${literal(escapeHTML(title))}</h1>`;
  const buttons = (actions && 'childNodes' in actions ? actions.childNodes : []).filter(child => element(child, 'a')).map((link, index) =>
    `<ui-button href="${escapeHTML(link.attrs.find(attr => attr.name === 'href')?.value ?? '')}" variant="${index === 0 ? 'solid' : 'outline'}" tone="${index === 0 ? 'accent' : 'neutral'}" size="lg">${serialize(link)}</ui-button>`).join('');
  if (buttons) components.add('ui-cluster').add('ui-button');
  if (features.length > 0) components.add('ui-grid').add('ui-card');
  return `<header class="hero"><div class="hero-text">${heading}${outer(hero.filter(node => node !== actions && node !== image))}` +
    (buttons ? `<div class="actions"><ui-cluster gap="m">${buttons}</ui-cluster></div>` : '') + '</div>' +
    (image ? `<div class="hero-image">${element(image, 'p') ? serialize(image) : outer([image])}</div>` : '') + '</header>' +
    (features.length === 0 ? '' : `<ui-grid class="features" min="md">${features.map(nodes => `<ui-card as="section">${outer(nodes)}</ui-card>`).join('')}</ui-grid>`);
}
