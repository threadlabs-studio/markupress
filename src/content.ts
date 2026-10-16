import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLoomaFenceInfo, splitLoomaFrontmatter, type LoomaFenceInfo } from '@threadlabs/looma/markdown';
import { createLoomaMarkdownIt } from '@threadlabs/looma/markdown/markdown-it';
import type { StateBlock, Token } from 'markdown-it';
import { parseFragment, serialize, serializeOuter, type DefaultTreeAdapterMap } from 'parse5';
import { bundledLanguages, createHighlighter, type BundledLanguage, type Highlighter, type ShikiTransformer } from 'shiki';
import { parseDocument } from 'yaml';
import { stylesheet } from './styles.js';

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
}
/** A heading the page's outline lists. */
export interface OutlineItem {
  readonly id: string;
  /** The heading's fragment link, `#id`. */
  readonly href: string;
  readonly label: string;
  readonly depth: number;
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
}
const index = /^(?:\d+\.)?index\.md$/;
/** Whether a Markdown file is its folder's index page, which HTMLKit reads as the folder's own entry. */
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
// meta stays on <code> as Looma Markdown's canonical HTML writes it.
const lineClasses = (marked: ReadonlySet<number>, numbers: boolean, meta: string): ShikiTransformer => ({
  pre(node) { if (numbers) this.addClassToHast(node, 'line-numbers'); },
  code(node) { if (meta) node.properties['data-meta'] = meta; },
  line(node, line) { if (marked.has(line)) this.addClassToHast(node, 'highlighted'); },
});
// `// [!code highlight]` at the end of a line highlights it and is removed, and `[!code highlight:3]` covers three
// lines. Alone on a line, the marker is removed with its line and applies to the lines after it.
// ponytail: matched on source lines rather than on Shiki's comment tokens, so a string ending in the marker counts too.
const notation = /[ \t]*(?:\/\/|#|--|<!--|\{?\/\*)[ \t]*\[!code highlight(?::(\d+))?\][ \t]*(?:-->|\*\/\}?)?[ \t]*$/;
function highlightNotation(code: string, marked: Set<number>): string {
  const lines: string[] = [];
  for (const line of code.split('\n')) {
    const match = notation.exec(line);
    if (!match) { lines.push(line); continue; }
    const rest = line.slice(0, match.index), own = rest.trim() !== '';
    if (own) lines.push(rest);
    for (let n = 0; n < Number(match[1] ?? 1); n++) marked.add(lines.length + (own ? 0 : 1) + n);
  }
  return lines.join('\n');
}
// Hidden until the page's code controller connects, so without JavaScript a code block is only its code.
const codeActions = '<div class="code-actions" hidden aria-live="polite"><button type="button" data-code-action="wrap" aria-pressed="false">Wrap</button>' +
  '<button type="button" data-code-action="copy">Copy</button></div>';

function textContent(node: DefaultTreeAdapterMap['node']): string {
  if ('value' in node) return node.value;
  return 'childNodes' in node ? node.childNodes.map(textContent).join('') : '';
}

/** Per-page render state: fences Shiki highlighted before the synchronous render. */
interface RenderEnv { readonly highlighted: ReadonlyMap<Token, string> }

// Looma Markdown: Looma's markdown-it plugin parses every form and renders the standard's canonical HTML. Markupress adds its presentation on top: Shiki code figures, heading self-links, literal text,
// and native component carriers.
const md = createLoomaMarkdownIt();
const { escapeHtml } = md.utils;
const rules = md.renderer.rules;
// Markdown text is literal: braces are escaped so HTML Next never interpolates them. Attributes are always literal
// in HTML Next, and raw HTML keeps its expressions. Plugin rules escape their text and attributes alike, so their
// text segments (between tags, where escaped HTML holds no `>`) gain the same escape.
const literalText = (html: string) => html.replace(/>([^<]+)</g, (_, text: string) => `>${literal(text)}<`);
for (const name of ['looma_container_open', 'looma_chip', 'looma_mention', 'looma_toc']) {
  const rule = rules[name]!;
  rules[name] = (...args) => literalText(rule(...args));
}
rules.text = (tokens, index) => literal(escapeHtml(tokens[index]!.content));
rules.code_inline = (tokens, index, _options, _env, self) => `<code${self.renderAttrs(tokens[index]!)}>${literal(escapeHtml(tokens[index]!.content))}</code>`;
// Each heading links to its own anchor, which the plugin assigned.
rules.heading_open = (tokens, index, options, _env, self) => `${self.renderToken(tokens, index, options)}<a href="#${escapeHtml(tokens[index]!.attrGet('id') ?? '')}">`;
rules.heading_close = (tokens, index, options, _env, self) => `</a>${self.renderToken(tokens, index, options)}`;
const plainCode = (code: string, { language, meta }: Pick<LoomaFenceInfo, 'language' | 'meta'>) =>
  `<pre><code${language ? ` class="language-${escapeHtml(language)}"` : ''}${meta ? ` data-meta="${escapeHtml(meta)}"` : ''}>${literal(escapeHtml(code.replace(/\n$/, '')))}</code></pre>`;
const codeFigure = (pre: string, title?: string) =>
  `<figure class="code">${title ? `<figcaption>${literal(escapeHtml(title))}</figcaption>` : ''}${codeActions}${pre}</figure>\n`;
rules.fence = (tokens, index, _options, env: RenderEnv) => {
  const token = tokens[index]!, info = parseLoomaFenceInfo(token.info), tab = tokens[index - 1];
  // A code group's tab already shows the fence title that labels it.
  const title = tab?.type === 'looma_tab_open' && (tab.meta as { label: string }).label === info.title ? undefined : info.title;
  return codeFigure(env.highlighted.get(token) ?? plainCode(token.content, info), title);
};
rules.code_block = (tokens, index) => codeFigure(plainCode(tokens[index]!.content, { meta: '' }));

// A native component carrier, `<template component>` at the start of a block, is raw HTML through its closing tag,
// blank lines included. Native fragment parsing finds the boundary, nested templates too, so Markdown never
// interprets a component's CSS, expressions or internal markup.
md.block.ruler.before('html_block', 'native_component', (state: StateBlock, startLine, endLine, silent) => {
  const start = state.bMarks[startLine]! + state.tShift[startLine]!;
  if (state.sCount[startLine]! - state.blkIndent >= 4 || !/^<template(?:\s|>)/i.test(state.src.slice(start, start + 10))) return false;
  const carrier = parseFragment(state.src.slice(start), { sourceCodeLocationInfo: true }).childNodes.find(node => 'tagName' in node);
  if (!carrier || !('tagName' in carrier) || carrier.tagName !== 'template' || !carrier.attrs.some(attr => attr.name === 'component')) return false;
  const end = carrier.sourceCodeLocation?.endTag?.endOffset;
  if (end === undefined) throw new Error(`${(state.env as { file: string }).file}: unclosed native component template.`);
  let line = startLine;
  while (line < endLine && state.eMarks[line]! < start + end) line++;
  if (line >= endLine) return false;
  if (silent) return true;
  const token = state.push('html_block', '', 0);
  token.content = state.src.slice(start, state.eMarks[line]) + '\n';
  token.map = [startLine, line + 1];
  state.line = line + 1;
  return true;
}, { alt: ['paragraph', 'reference', 'blockquote'] });

function frontmatter(source: string, file: string) {
  const split = splitLoomaFrontmatter(source);
  if (split === null) return { body: source, fields: {} as Record<string, unknown> };
  const document = parseDocument(split.yaml);
  if (document.errors.length > 0) throw new Error(`${file}: ${document.errors.map(error => error.message).join('; ')}`);
  const fields: unknown = document.toJS();
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) throw new Error(`${file}: frontmatter must be a mapping.`);
  return { body: split.body, fields: fields as Record<string, unknown> };
}

const text = (value: unknown) => typeof value === 'string' && value !== '';
const strings = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.values(value).every(item => typeof item === 'string' || typeof item === 'number');
const level = (value: unknown) => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 6;
const fieldTypes: Readonly<Record<string, readonly [check: (value: unknown) => boolean, expected: string]>> = {
  title: [text, 'a nonempty string'], description: [text, 'a nonempty string'],
  order: [value => Number.isSafeInteger(value) && (value as number) >= 0, 'a whole number'],
  navigation: [value => value === 'hidden' || value === 'collapsed', 'hidden, or collapsed on a folder\'s index page'],
  id: [text, 'a nonempty string'],
  aliases: [value => Array.isArray(value) && value.every(item => typeof item === 'string'), 'a list of route paths'],
  layout: [value => value === false || text(value), 'an HTMLKit layout name or false'],
  outline: [value => value === false || (Array.isArray(value) && value.length === 2 && value.every(level) && (value[0] as number) <= (value[1] as number)), 'false or a heading range such as [2, 3]'],
  head: [value => (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([key, item]) =>
    key === 'canonical' ? text(item) : (key === 'meta' || key === 'og') && strings(item))), 'a mapping of meta, og and canonical'],
  editLink: [value => value === false || text(value), 'a URL or false'],
};
function validFrontMatter(fields: Record<string, unknown>, file: string): FrontMatter {
  for (const [name, value] of Object.entries(fields)) {
    const type = fieldTypes[name];
    if (type === undefined) throw new Error(`${file}: unknown front matter field ${name}. Fields are ${Object.keys(fieldTypes).join(', ')}.`);
    if (!type[0](value)) throw new Error(`${file}: front matter ${name} must be ${type[1]}.`);
  }
  // HTMLKit reads a folder from its index page, so only an index page can start its folder collapsed.
  if (fields.navigation === 'collapsed' && !isIndex(file)) throw new Error(`${file}: front matter navigation collapsed applies to a folder's index page.`);
  return fields as FrontMatter;
}

// Blocks rendered as Looma components, which the page links by package specifier, as the theme's shell links
// ui-button, so the site resolves Looma.
const blockComponent = (token: Token) => token.type === 'looma_container_open'
  ? (token.info === 'tabs' || token.info === 'code-group' ? 'ui-tabs' : token.info === 'details' || token.info === 'figure' ? undefined : 'ui-callout')
  : token.type === 'blockquote_open' && token.tag === 'ui-callout' ? 'ui-callout' : undefined;

export async function compileMarkdown(source: string, options: MarkdownOptions): Promise<CompiledMarkdown> {
  const { body, fields: raw } = frontmatter(source, options.file);
  const fields = { ...options.frontmatter, ...validFrontMatter(raw, options.file) };
  const aliases = fields.aliases ?? [];
  const tokens = md.parse(source, { file: options.file });
  const highlighted = new Map<Token, string>(), components = new Set<string>(), headings: OutlineItem[] = [];
  let hasCode = false;
  for (const [index, token] of tokens.entries()) {
    const component = blockComponent(token);
    if (component) components.add(component);
    if (token.type === 'heading_open') {
      const id = token.attrGet('id')!;
      const label = textContent(parseFragment(md.renderer.renderInline(tokens[index + 1]!.children ?? [], md.options, { highlighted }))).replace(/\\([\\{])/g, '$1');
      headings.push({ id, href: `#${id}`, label, depth: Number(token.tag.slice(1)) });
    }
    if (token.type === 'code_block') hasCode = true;
    if (token.type !== 'fence') continue;
    hasCode = true;
    const { language, meta, lines, lineNumbers = options.lineNumbers ?? false } = parseLoomaFenceInfo(token.info);
    // Languages Shiki does not bundle stay escaped plain text.
    if (!language || !(Object.hasOwn(bundledLanguages, language) || plain.has(language))) continue;
    const marked = new Set(lines);
    highlighted.set(token, await highlight(highlightNotation(token.content.replace(/\n$/, ''), marked), language, lineClasses(marked, lineNumbers, meta)));
  }
  const fragment = parseFragment(md.renderer.render(tokens, md.options, { highlighted } satisfies RenderEnv));
  const declarations: string[] = [];
  const metadata: string[] = [];
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
        else if (!inCarrier && 'tagName' in child && ['title', 'meta', 'link'].includes(child.tagName)) metadata.push(serializeOuter(child));
        else kept.push(child);
      }
      node.childNodes = kept;
    }
  };
  visit(fragment, false);
  for (const name of components) declarations.push(`<link rel="component" href="@threadlabs/looma/components/${name}/${name}.html">`);
  const title = fields.title ?? headings[0]?.label ?? basename(options.file, '.md').replace(/^\d+\./, '');
  // A folder's index page with front matter only generates the folder's listing, which the layout's loader supplies.
  const generated = isIndex(options.file) && body.trim() === '';
  // Front matter becomes HTMLKit page metadata: HTMLKit owns navigation labels, order, visibility, alias routes, the
  // layout choice, and the document head, which merges meta and canonical links by identity.
  const { meta = {}, og = {}, canonical } = fields.head ?? {};
  const head = `<title>${literal(escapeHTML(title))}</title>` + (fields.description === undefined ? '' : `<meta name="description" content="${escapeHTML(fields.description)}">`) +
    `<meta name="hk:label" content="${escapeHTML(title)}">` + (fields.navigation === 'hidden' ? '<meta name="hk:navigation" content="hidden">' : '') +
    (fields.order === undefined ? '' : `<meta name="hk:order" content="${fields.order}">`) +
    aliases.map(alias => `<meta name="hk:alias" content="${escapeHTML(alias)}">`).join('') +
    (fields.layout === undefined ? '' : `<meta name="hk:layout" content="${fields.layout === false ? 'none' : escapeHTML(fields.layout)}">`) +
    Object.entries(meta).map(([name, content]) => `<meta name="${escapeHTML(name)}" content="${escapeHTML(String(content))}">`).join('') +
    Object.entries(og).map(([name, content]) => `<meta property="og:${escapeHTML(name)}" content="${escapeHTML(String(content))}">`).join('') +
    (canonical === undefined ? '' : `<link rel="canonical" href="${escapeHTML(canonical)}">`);
  const [from, to] = fields.outline === false ? [0, -1] : fields.outline ?? [2, 3];
  const styles = options.styles?.length ? `<style>${options.styles.map(file => `@import "${pathToFileURL(file).href}";`).join('')}</style>` : '';
  return { title, aliases, generated, ...(fields.id === undefined ? {} : { id: fields.id }),
    frontmatter: fields, outline: headings.filter(heading => heading.depth >= from && heading.depth <= to),
    resource: `<meta name="hk:page" content="${escapeHTML(options.pageName)}">\n${declarations.join('\n')}\n<template component="${escapeHTML(options.pageName)}"${hasCode ? ' controller="markupress/controllers/code.js"' : ''}>${head}${metadata.join('')}<article class="markupress-prose">${generated ? `<h1>${literal(escapeHTML(title))}</h1>` : ''}${serialize(fragment)}</article>${styles}</template>\n` };
}
