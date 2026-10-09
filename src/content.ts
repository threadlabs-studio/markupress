import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Marked, type Token } from 'marked';
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
}
export interface CompiledMarkdown {
  readonly resource: string;
  readonly title: string;
  readonly label: string;
  readonly id?: string;
  readonly aliases: readonly string[];
  readonly sidebarHidden: boolean;
}
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
async function highlight(code: string, lang: BundledLanguage): Promise<string> {
  // One highlighter serves every page; a grammar loads the first time a fence uses its language.
  const shiki = await (highlighter ??= createHighlighter({ themes: Object.values(themes), langs: [] }));
  await shiki.loadLanguage(lang);
  return shiki.codeToHtml(code, { lang, themes, defaultColor: 'light-dark()', transformers: [shikiOutput] });
}
// A fence's first info word names its language unless it is an attribute, as in ```title="notes.txt".
const fenceLanguage = (info = '') => /^[^\s=]+(?=\s|$)/.exec(info)?.[0];

function textContent(node: DefaultTreeAdapterMap['node']): string {
  if ('value' in node) return node.value;
  return 'childNodes' in node ? node.childNodes.map(textContent).join('') : '';
}

function frontmatter(source: string, file: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (match === null) return { body: source, fields: {} as Record<string, unknown> };
  const document = parseDocument(match[1]!);
  if (document.errors.length > 0) throw new Error(`${file}: ${document.errors.map(error => error.message).join('; ')}`);
  const fields: unknown = document.toJS();
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) throw new Error(`${file}: frontmatter must be a mapping.`);
  return { body: source.slice(match[0].length), fields: fields as Record<string, unknown> };
}

export async function compileMarkdown(source: string, options: MarkdownOptions): Promise<CompiledMarkdown> {
  const { body, fields } = frontmatter(source, options.file);
  for (const name of ['title', 'description', 'sidebarLabel', 'id']) {
    if (fields[name] !== undefined && (typeof fields[name] !== 'string' || fields[name] === '')) throw new Error(`${options.file}: ${name} must be a nonempty string.`);
  }
  const aliases = fields.aliases ?? [];
  if (fields.sidebarHidden !== undefined && typeof fields.sidebarHidden !== 'boolean') throw new Error(`${options.file}: sidebarHidden must be a boolean.`);
  if (!Array.isArray(aliases) || aliases.some(value => typeof value !== 'string')) throw new Error(`${options.file}: aliases must be a list of route paths.`);
  // Heading IDs: `used` holds every ID emitted so far, `reserved` every custom ID in the document.
  const used = new Set<string>(), reserved = new Set<string>(), suffixes = new Map<string, number>();
  const customIds = new Map<Token, string>();
  let firstHeading: string | undefined;
  const highlighted = new Map<Token, string>();
  const markdown = new Marked({ async: true, async walkTokens(token) {
    if (token.type === 'heading') {
      // `## Title {#custom-id}` names the anchor; the marker ends the heading's last text token. Every token is
      // walked before any renders, so a custom ID is reserved before an earlier heading could generate it.
      const last = token.tokens?.at(-1);
      const custom = last?.type === 'text' ? / +\{#([\w-]+)\}$/.exec(last.text) : null;
      if (custom && last?.type === 'text') { last.text = last.text.slice(0, custom.index); customIds.set(token, custom[1]!); reserved.add(custom[1]!); }
      return;
    }
    if (token.type !== 'code') return;
    const language = fenceLanguage(token.lang);
    // Languages Shiki does not bundle stay escaped plain text.
    if (language && Object.hasOwn(bundledLanguages, language)) highlighted.set(token, await highlight(token.text, language as BundledLanguage));
  }, renderer: {
    text(token) { return 'tokens' in token && token.tokens ? this.parser.parseInline(token.tokens) : literal(token.text); },
    codespan({ text }) { return `<code>${literal(escapeHTML(text))}</code>`; },
    code(token) {
      const { text, lang = '' } = token;
      const language = fenceLanguage(lang);
      const title = /(?:^|\s)title="([^"]*)"/.exec(lang)?.[1];
      const pre = highlighted.get(token) ?? `<pre><code${language ? ` class="language-${escapeHTML(language)}"` : ''}>${literal(escapeHTML(text))}</code></pre>`;
      return (title ? `<figure class="code"><figcaption>${literal(escapeHTML(title))}</figcaption>${pre}</figure>` : pre) + '\n';
    },
    heading(token) {
      const { tokens, depth } = token;
      const html = this.parser.parseInline(tokens);
      const label = textContent(parseFragment(html)).replace(/\\([\\{])/g, '$1');
      firstHeading ??= label;
      const custom = customIds.get(token);
      const stem = custom ?? (label.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'heading');
      // A custom ID is kept unless an earlier heading used it. Any other ID takes the first free suffix,
      // skipping IDs already used and custom IDs reserved by later headings, so no two headings share an ID.
      const taken = (id: string) => used.has(id) || reserved.has(id);
      let id = stem;
      if (custom === undefined ? taken(id) : used.has(id)) {
        let n = suffixes.get(stem) ?? 1;
        while (taken(`${stem}-${n}`)) n++;
        suffixes.set(stem, n + 1); id = `${stem}-${n}`;
      }
      used.add(id);
      return `<h${depth} id="${escapeHTML(id)}"><a href="#${escapeHTML(id)}">${html}</a></h${depth}>\n`;
    },
    link({ href, title, tokens }) {
      const target = options.resolveLink?.(href, 'link') ?? href;
      return `<a href="${escapeHTML(target)}"${title ? ` title="${escapeHTML(title)}"` : ''}>${this.parser.parseInline(tokens)}</a>`;
    },
    image({ href, title, text }) {
      const target = options.resolveLink?.(href, 'asset') ?? href;
      return `<img src="${escapeHTML(target)}" alt="${escapeHTML(text)}"${title ? ` title="${escapeHTML(title)}"` : ''}>`;
    },
  } });
  markdown.use({ extensions: [{ name: 'native-component', level: 'block',
    start(text) { return text.indexOf('<template'); },
    tokenizer(text) {
      if (!/^ {0,3}<template(?:\s|>)/i.test(text)) return undefined;
      // Native fragment parsing identifies the carrier boundary, including nested templates.
      // Markdown must never interpret a component's CSS, expressions or internal markup.
      const carrier = parseFragment(text, { sourceCodeLocationInfo: true }).childNodes.find(node => 'tagName' in node);
      if (!carrier || !('tagName' in carrier) || carrier.tagName !== 'template' || !carrier.attrs.some(attr => attr.name === 'component')) return undefined;
      const end = carrier.sourceCodeLocation?.endTag?.endOffset;
      if (end === undefined) throw new Error(`${options.file}: unclosed native component template.`);
      const raw = text.slice(0, end);
      return { type: 'native-component', raw };
    }, renderer(token) { return token.raw; },
  }, { name: 'container', level: 'block',
    // `::: name` … `:::` wraps Markdown in <div class="name">. A container closes at the first marker at
    // least as long as its own, so an outer container uses more colons than those it contains.
    start(text) { return /^ {0,3}:{3,}[ \t]*[A-Za-z]/m.exec(text)?.index; },
    tokenizer(text) {
      const open = /^ {0,3}(:{3,})[ \t]*([A-Za-z][\w-]*)[ \t]*(?:\n|$)/.exec(text);
      if (!open) return undefined;
      const close = new RegExp(`^ {0,3}:{${open[1]!.length},}[ \\t]*$`);
      // A marker line inside fenced code is code, so the scan skips fences while looking for the close.
      let fence: RegExp | undefined;
      let offset = open[0].length;
      for (const line of text.slice(offset).split('\n')) {
        if (fence) { if (fence.test(line)) fence = undefined; }
        else if (close.test(line)) {
          // Like a blockquote, the content is a document of its own, so its paragraphs stay paragraphs inside a list.
          const top = this.lexer.state.top; this.lexer.state.top = true;
          const tokens = this.lexer.blockTokens(text.slice(open[0].length, offset));
          this.lexer.state.top = top;
          return { type: 'container', raw: text.slice(0, offset + line.length + 1), name: open[2], tokens };
        } else {
          const opener = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
          if (opener) fence = new RegExp(`^ {0,3}${opener[0]}{${opener.length},}[ \\t]*$`);
        }
        offset += line.length + 1;
      }
      return undefined;
    }, renderer(token) { return `<div class="${token.name as string}">\n${this.parser.parse(token.tokens ?? [])}</div>\n`; },
  }] });
  const fragment = parseFragment(await markdown.parse(body));
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
          // Markdown-rendered links are already resolved; the callback also accepts final URLs.
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
  const title = fields.title as string | undefined ?? firstHeading ?? basename(options.file, '.md').replace(/^\d+\./, '');
  const label = fields.sidebarLabel as string | undefined ?? title;
  // Front matter becomes HTMLKit page metadata: HTMLKit owns navigation labels, visibility, and alias routes.
  const head = `<title>${literal(escapeHTML(title))}</title>` + (fields.description === undefined ? '' : `<meta name="description" content="${escapeHTML(fields.description as string)}">`) +
    `<meta name="hk:label" content="${escapeHTML(label)}">` + (fields.sidebarHidden === true ? '<meta name="hk:navigation" content="hidden">' : '') +
    (aliases as string[]).map(alias => `<meta name="hk:alias" content="${escapeHTML(alias)}">`).join('');
  const styles = options.styles?.length ? `<style>${options.styles.map(file => `@import "${pathToFileURL(file).href}";`).join('')}</style>` : '';
  return { title, label, aliases, sidebarHidden: fields.sidebarHidden === true, ...(fields.id === undefined ? {} : { id: fields.id as string }),
    resource: `<meta name="hk:page" content="${escapeHTML(options.pageName)}">\n${declarations.join('\n')}\n<template component="${escapeHTML(options.pageName)}">${head}${metadata.join('')}<article class="markupress-prose">${serialize(fragment)}</article>${styles}</template>\n` };
}
