import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Marked } from 'marked';
import { parseFragment, serialize, serializeOuter, type DefaultTreeAdapterMap } from 'parse5';
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

export function compileMarkdown(source: string, options: MarkdownOptions): CompiledMarkdown {
  const { body, fields } = frontmatter(source, options.file);
  for (const name of ['title', 'description', 'sidebarLabel', 'id']) {
    if (fields[name] !== undefined && (typeof fields[name] !== 'string' || fields[name] === '')) throw new Error(`${options.file}: ${name} must be a nonempty string.`);
  }
  const aliases = fields.aliases ?? [];
  if (fields.sidebarHidden !== undefined && typeof fields.sidebarHidden !== 'boolean') throw new Error(`${options.file}: sidebarHidden must be a boolean.`);
  if (!Array.isArray(aliases) || aliases.some(value => typeof value !== 'string')) throw new Error(`${options.file}: aliases must be a list of route paths.`);
  const headings = new Map<string, number>();
  let firstHeading: string | undefined;
  const markdown = new Marked({ async: false, renderer: {
    text(token) { return 'tokens' in token && token.tokens ? this.parser.parseInline(token.tokens) : literal(token.text); },
    codespan({ text }) { return `<code>${literal(escapeHTML(text))}</code>`; },
    code({ text, lang }) { return `<pre><code${lang ? ` class="language-${escapeHTML(lang.split(/\s/)[0]!)}"` : ''}>${literal(escapeHTML(text))}</code></pre>\n`; },
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      const label = textContent(parseFragment(html)).replace(/\\([\\{])/g, '$1');
      firstHeading ??= label;
      const stem = label.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'heading';
      const count = headings.get(stem) ?? 0; headings.set(stem, count + 1);
      const id = count === 0 ? stem : `${stem}-${count}`;
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
  }] });
  const fragment = parseFragment(markdown.parse(body) as string);
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
