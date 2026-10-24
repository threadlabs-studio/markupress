import { applyLoomaCodeNotation, parseLoomaFenceInfo } from '@threadlabs/looma/markdown';
import { headingAnchors, parse, type Document, type Node } from 'expressmark';
import { renderHtml, type HtmlRenderContext, type HtmlTransformer } from 'expressmark/render';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { bundledLanguages, createHighlighter, type BundledLanguage, type Highlighter, type ShikiTransformer } from 'shiki';

/** HTML-escape text or a quoted attribute value. */
export function escapeHTML(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Markdown text is literal author content: HTML Next never reads `{` in it as an expression. Raw HTML keeps its expressions.
export function literal(value: string): string { return value.replace(/\\/g, '\\\\').replace(/{/g, '\\{'); }

/** A heading the page's outline lists. */
export interface OutlineItem {
  readonly id: string;
  /** The heading's fragment link, `#id`. */
  readonly href: string;
  readonly label: string;
  readonly depth: number;
}

/** An Expressive Markdown document rendered with Markupress's presentation, before Markupress's page layer. */
export interface RenderedMarkdown {
  /** The document's HTML, as HTML Next template content: Markdown text escapes its braces. */
  readonly html: string;
  /** The front matter mapping: the document title and ID, then the rest of its metadata. */
  readonly frontmatter: Readonly<Record<string, unknown>>;
  /** Whether the document has content after its front matter. */
  readonly empty: boolean;
  /** Every heading, in document order. */
  readonly headings: readonly OutlineItem[];
  readonly hasCode: boolean;
  /** The Looma components the document's blocks render. */
  readonly components: ReadonlySet<string>;
}

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
// Line highlighting and numbers are classes written at build time; the theme's stylesheet draws them.
const lineClasses = (marked: ReadonlySet<number>, numbers: boolean): ShikiTransformer => ({
  pre(node) { if (numbers) this.addClassToHast(node, 'line-numbers'); },
  line(node, line) { if (marked.has(line)) this.addClassToHast(node, 'highlighted'); },
});
// Hidden until the page's code controller connects, so without JavaScript a code block is only its code.
const codeActions = '<div class="code-actions" hidden="hidden" aria-live="polite"><button type="button" data-code-action="wrap" aria-pressed="false">Wrap</button>' +
  '<button type="button" data-code-action="copy">Copy</button></div>';

/** A code block's presentation, from Expressive Markdown's settings or the fence info spelling Markupress also reads. */
interface Fence { readonly language: string; readonly title?: string; readonly lines: ReadonlySet<number>; readonly numbers: boolean }
function fence(node: Node, lineNumbers: boolean): Fence {
  // Expressive Markdown's settings, such as `{title="a.ts" highlight=1,3-5 show-line-numbers}`.
  if (node.attributes !== undefined || typeof node.title === 'string') {
    const lines = new Set<number>();
    for (const range of String(node.attributes?.highlight ?? '').split(',')) {
      const [from, to = from] = range.trim().split('-').map(Number) as [number, number?];
      if (Number.isInteger(from) && Number.isInteger(to)) for (let line = from; line <= to!; line++) lines.add(line);
    }
    const shown = node.attributes?.showLineNumbers;
    return { language: node.language ?? '', lines, numbers: typeof shown === 'boolean' ? shown : lineNumbers, ...(typeof node.title === 'string' ? { title: node.title } : {}) };
  }
  // The info string Markupress also reads, such as `ts {1,3-5} title="a.ts" :line-numbers`, which Expressive Markdown keeps as written.
  const info = typeof node.source?.info === 'string' ? node.source.info : [node.language, node.meta].filter(Boolean).join(' ');
  const legacy = parseLoomaFenceInfo(info);
  return { language: legacy.language ?? '', lines: new Set(legacy.lines), numbers: legacy.lineNumbers ?? lineNumbers, ...(legacy.title ? { title: legacy.title } : {}) };
}
// Code reads as Looma's shared code notation leaves it: `[!code highlight]` comments mark lines and are removed.
const plainCode = (code: string, language: string) =>
  `<pre><code${language ? ` class="language-${escapeHTML(language)}"` : ''}>${literal(escapeHTML(applyLoomaCodeNotation(code).code))}</code></pre>`;
const codeFigure = (pre: string, title?: string) =>
  `<figure class="code">${title ? `<figcaption>${literal(escapeHTML(title))}</figcaption>` : ''}${codeActions}${pre}</figure>`;

/** Every node of the document, depth first, in document order. */
function* nodes(node: Node): Generator<Node> {
  yield node;
  if (typeof node.title === 'object') yield* nodes(node.title);
  for (const child of [...node.body ?? [], ...node.children ?? []]) yield* nodes(child);
}
/** A node's plain text: its value, or its descendants' text in order. */
function plainText(node: Node | string | undefined): string {
  if (node === undefined) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'html') return '';
  return node.value ?? [...node.body ?? [], ...node.children ?? []].map(plainText).join('');
}

// Callout types and their Looma tone; `caution` is `danger`, as in the shared block vocabulary.
const tones: Readonly<Record<string, string>> = { note: 'note', tip: 'tip', info: 'info', important: 'important', warning: 'warning', danger: 'danger', caution: 'danger' };
const blockComponents = (node: Node) => node.type !== 'container' ? undefined
  : node.subType !== undefined && Object.hasOwn(tones, node.subType) ? 'ui-callout'
    : node.subType === 'tabs' || node.subType === 'code-group' ? 'ui-tabs' : undefined;
const kebab = (name: string) => name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
/** A node's ID and its other attributes as `data-*`, as Expressive Markdown's own HTML writes them. */
function attributes(node: Node, skip: readonly string[] = []): string {
  const pairs = Object.entries(node.attributes ?? {}).filter(([name]) => !skip.includes(name));
  return (node.id ? ` id="${escapeHTML(node.id)}"` : '') + pairs.map(([name, value]) =>
    value === false ? '' : value === true ? ` data-${kebab(name)}` : ` data-${kebab(name)}="${escapeHTML(value)}"`).join('');
}

// Elements and attributes Markupress's own presentation writes, which the safe profile admits for the site's authors.
const ownTags = ['ui-callout', 'ui-tabs', 'section', 'figure', 'figcaption', 'div', 'button', 'input', 'label', 'nav', 'pre', 'code', 'span', 'details', 'summary'];
const ownAttributes = ['class', 'id', 'style', 'tone', 'heading', 'group', 'aria-label', 'aria-pressed', 'aria-live', 'aria-hidden', 'hidden', 'type', 'disabled', 'checked', 'tabindex', 'role', 'open', 'data-*'];
const shikiStyle = /^[#\w\s(),.%-]+$/;
const shikiStyles = Object.fromEntries(['color', 'font-style', 'font-weight', 'text-decoration', ...['', '-font-style', '-font-weight', '-text-decoration']
  .flatMap(suffix => [`--shiki-light${suffix}`, `--shiki-dark${suffix}`])].map(name => [name, [shikiStyle]]));
/** The tags and attribute names the document's own raw HTML uses, template content included. */
function rawHtmlNames(document: Document): { tags: Set<string>; attributes: Set<string> } {
  const tags = new Set<string>(), names = new Set<string>();
  const visit = (node: DefaultTreeAdapterMap['node']): void => {
    if ('tagName' in node) { tags.add(node.tagName); for (const attribute of node.attrs) names.add(attribute.name); }
    if ('content' in node) visit(node.content);
    if ('childNodes' in node) for (const child of node.childNodes) visit(child);
  };
  for (const node of nodes(document)) {
    const html = node.type === 'htmlElement' ? node.open : node.type === 'html' ? node.value : undefined;
    if (html) visit(parseFragment(html));
  }
  return { tags, attributes: names };
}

/**
 * Expressive Markdown with Markupress's presentation. expressmark parses the document, keeping the site's raw HTML,
 * and renders it through Markupress's transformers: Looma callouts and tabs, Shiki code figures, heading self-links,
 * task checkboxes and generated tables of contents. Front matter errors fail with the Markdown file.
 */
export async function renderMarkdown(source: string, options: { readonly file: string; readonly lineNumbers?: boolean }): Promise<RenderedMarkdown> {
  const document = parse(source, { syntax: 'modern', trustedHtml: true, onDiagnostic(diagnostic) {
    // Front matter is page metadata, so a mistake in it fails the build as an unknown field does.
    if (diagnostic.code === 'invalid-frontmatter' || diagnostic.code === 'duplicate-metadata-key') throw new Error(`${options.file}: ${diagnostic.message}`);
  } });
  // The page renders no element for the document ID, Markupress's identity across versions, so headings may take it.
  const { id: _identity, ...page } = document;
  const anchors = headingAnchors(page);
  const headings: OutlineItem[] = [], components = new Set<string>(), highlighted = new Map<Node, string>();
  // Each table cell's column alignment, which a table records once for its columns.
  const aligned = new Map<Node, string>();
  let hasCode = false;
  for (const node of nodes(document)) {
    if (node.type === 'table') for (const row of node.children ?? []) (row.children ?? []).forEach((cell, column) => { const align = node.align?.[column]; if (align) aligned.set(cell, align); });
    const component = blockComponents(node);
    if (component) components.add(component);
    if (node.type === 'heading') { const id = anchors.get(node)!; headings.push({ id, href: `#${id}`, label: plainText(node), depth: node.level ?? 1 }); }
    if (node.type !== 'code') continue;
    hasCode = true;
    const { language, lines, numbers } = fence(node, options.lineNumbers ?? false);
    // Languages Shiki does not bundle stay escaped plain text.
    if (!language || !(Object.hasOwn(bundledLanguages, language) || plain.has(language))) continue;
    // Highlighted lines are the block's own and those its `[!code highlight]` comments mark.
    const notation = applyLoomaCodeNotation(node.value ?? '');
    highlighted.set(node, await highlight(notation.code, language, lineClasses(new Set([...lines, ...notation.lines]), numbers)));
  }
  const pre = (node: Node) => highlighted.get(node) ?? plainCode(node.value ?? '', fence(node, false).language);
  const heading = (node: Node) => typeof node.title === 'object' ? plainText(node.title) : node.title ?? '';
  const tab = (label: string, content: string) => `<section aria-label="${escapeHTML(label)}">${content}</section>`;
  const callout: HtmlTransformer = (node, context) => {
    const tone = node.subType === undefined ? undefined : tones[node.subType];
    if (tone === undefined) return undefined;
    const title = heading(node);
    return `<ui-callout tone="${tone}"${title ? ` heading="${escapeHTML(title)}"` : ''}${attributes(node)}>${context.renderChildren()}</ui-callout>`;
  };
  // Each child of a tab group is a labelled panel; a code group's code block is labelled by its title or language.
  // Consecutive tabs inside a code group form their own group, whose panels are the code group's.
  const panels = (node: Node, context: HtmlRenderContext) => (node.body ?? []).flatMap(child => child.type === 'container' && child.subType === 'tabs' && node.subType === 'code-group' ? child.body ?? [] : [child]).map(child =>
    child.type === 'code' ? tab(fence(child, false).title ?? fence(child, false).language, codeFigure(pre(child)))
      : child.type === 'container' && child.subType === 'tab' ? tab(heading(child), context.render(child)) : context.render(child)).join('');
  const toc = (node: Node) => {
    const depth = Number(node.attributes?.depth ?? 3), format = String(node.attributes?.format ?? 'plain');
    const list = format === 'numbered' ? 'ol' : 'ul';
    const items = headings.filter(item => item.depth <= depth).map(item => `<li data-depth="${item.depth}"><a href="${item.href}">${literal(escapeHTML(item.label))}</a></li>`).join('');
    const title = heading(node);
    return `<nav data-type="toc" data-format="${escapeHTML(format)}" aria-label="${escapeHTML(title || 'Contents')}">${title ? `<strong>${literal(escapeHTML(title))}</strong>` : ''}<${list}>${items}</${list}></nav>`;
  };
  const transformers: Record<string, HtmlTransformer> = {
    ...Object.fromEntries(Object.keys(tones).map(type => [`container:${type}`, callout])),
    // A callout's alert spelling is the same callout node.
    'container:details': (node, context) => `<details${node.attributes?.open === true ? ' open' : ''}${attributes(node, ['open'])}><summary>${
      typeof node.title === 'object' ? context.render(node.title) : 'Details'}</summary>${context.renderChildren()}</details>`,
    'container:tabs': (node, context) => `<ui-tabs group="${escapeHTML(String(node.attributes?.group ?? 'tabs'))}">${panels(node, context)}</ui-tabs>`,
    'container:tab': (_node, context) => context.renderChildren(),
    'container:code-group': (node, context) => `<ui-tabs class="code-group" group="${escapeHTML(String(node.attributes?.group ?? 'code-group'))}">${panels(node, context)}</ui-tabs>`,
    'container:toc': toc,
    'leaf:toc': toc,
    code: node => codeFigure(pre(node), fence(node, false).title),
    tableCell: (node, context) => {
      const align = aligned.get(node as Node);
      if (align === undefined) return undefined;
      const tag = node.header ? 'th' : 'td', spans = (node.colSpan ? ` colspan="${node.colSpan}"` : '') + (node.rowSpan ? ` rowspan="${node.rowSpan}"` : '');
      return `<${tag} style="text-align:${align}"${spans}>${context.renderChildren()}</${tag}>`;
    },
    heading: (node, context) => {
      const id = anchors.get(node as Node)!, level = node.level ?? 1;
      return `<h${level} id="${escapeHTML(id)}"><a href="#${escapeHTML(id)}">${context.renderChildren()}</a></h${level}>`;
    },
    // A list whose every item has a checkbox is a task list, read-only as Expressive Markdown's tasks are. A tight
    // list's items hold their text without paragraphs, as CommonMark's HTML writes them.
    list: (node, context) => {
      const tasks = !node.ordered && (node.children ?? []).length > 0 && (node.children ?? []).every(item => typeof item.checked === 'boolean');
      if (!tasks && !node.tight) return undefined;
      const tag = node.ordered ? 'ol' : 'ul', start = node.ordered && node.start !== undefined && node.start !== 1 ? ` start="${node.start}"` : '';
      const items = (node.children ?? []).map(item => {
        const content = (item.body ?? []).map(child => child.type === 'paragraph' && node.tight ? context.render(child).replace(/^<p>([\s\S]*)<\/p>$/, '$1') : context.render(child)).join('');
        return typeof item.checked === 'boolean' && tasks
          ? `<li data-type="taskItem" data-checked="${item.checked}"><label><input type="checkbox" disabled${item.checked ? ' checked' : ''}> ${content}</label></li>`
          : `<li>${content}</li>`;
      }).join('');
      return `<${tag}${start}${tasks ? ' data-type="taskList"' : ''}>${items}</${tag}>`;
    },
  };
  const raw = rawHtmlNames(document);
  const html = renderHtml(document, { title: false, transformers, escapeText: literal,
    // The site's own authors write its Markdown, so its raw HTML and Markupress's presentation pass the profile as written.
    trustedHtml: { tags: [...ownTags, ...raw.tags], attributes: { '*': [...ownAttributes, ...raw.attributes] }, styles: shikiStyles } });
  const frontmatter = { ...(document.title ? { title: plainText(document.title) } : {}), ...(document.id ? { id: document.id } : {}), ...document.metadata };
  return { html, frontmatter, empty: document.body.length === 0, headings, hasCode, components };
}
