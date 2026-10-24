import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const fenceLine = /^ {0,3}(`{3,}|~{3,})/;
const opener = /^(\s*)(:{3,})\s*(tabs|code-group)(?:\s+([A-Za-z][\w-]*))?\s*$/i;
const panel = /^\s*==\s+(.+?)\s*$/;
const closer = (colons: number) => new RegExp(`^\\s*:{${colons}}\\s*$`);

/** The lines of Markdown outside fenced code, which the conversion reads; code lines pass through unchanged. */
function outsideCode(lines: readonly string[]): boolean[] {
  const prose: boolean[] = [];
  let fence: string | undefined;
  for (const line of lines) {
    const marker = fenceLine.exec(line)?.[1];
    if (fence === undefined) { if (marker) fence = marker; prose.push(fence === undefined); continue; }
    prose.push(false);
    if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = undefined;
  }
  return prose;
}

/**
 * Markupress 0.7 Markdown rewritten as Expressive Markdown, for what Expressive Markdown reads differently:
 * `== Label` panels in `::: tabs` and `::: code-group` become `::: tab [Label]` containers, a tab group's name
 * (`::: tabs pm`) becomes `{group=pm}`, and `:mention[Label]{id=ref}` becomes `@[Label]#ref`. Code stays as written,
 * and converted Markdown converts to itself.
 */
export function convertMarkdown(source: string): string {
  const lines = source.split('\n');
  const prose = outsideCode(lines);
  const out: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const open = prose[index] ? opener.exec(line) : null;
    if (!open) { out.push(prose[index] ? mentions(line) : line); continue; }
    const [, indent = '', colons = ':::', kind = 'tabs', name] = open;
    // The block runs to its matching closing fence.
    let end = index + 1;
    while (end < lines.length && !(prose[end] && closer(colons.length).test(lines[end]!))) end++;
    if (end >= lines.length) { out.push(line); continue; }
    const body = lines.slice(index + 1, end), bodyProse = prose.slice(index + 1, end);
    const panels = body.flatMap((text, at) => bodyProse[at] && panel.test(text) ? [at] : []);
    if (panels.length === 0 && (kind.toLowerCase() === 'code-group' || name === undefined)) { out.push(line); continue; }
    // Tab containers take one colon more than any container inside them, and their group one more again.
    const inner = Math.max(2, ...body.flatMap((text, at) => bodyProse[at] ? [/^\s*(:{3,})/.exec(text)?.[1]?.length ?? 0] : []));
    const tab = ':'.repeat(Math.max(3, inner + 1)), group = ':'.repeat(tab.length + 1);
    const converted: string[] = [];
    if (panels.length === 0) converted.push(...body.map((text, at) => bodyProse[at] ? mentions(text) : text));
    else {
      // Content before the first panel stays before the panels.
      converted.push(...body.slice(0, panels[0]).map((text, at) => bodyProse[at] ? mentions(text) : text));
      panels.forEach((start, at) => {
        const label = panel.exec(body[start]!)![1]!, until = panels[at + 1] ?? body.length;
        const content = body.slice(start + 1, until).map((text, offset) => bodyProse[start + 1 + offset] ? mentions(text) : text);
        while (content.length > 0 && content.at(-1)!.trim() === '') content.pop();
        if (at > 0) converted.push('');
        converted.push(`${indent}${tab} tab [${label.replaceAll(']', '\\]')}]`, ...content, `${indent}${tab}`);
      });
    }
    const tabsOnly = kind.toLowerCase() === 'tabs';
    if (tabsOnly && name === undefined) out.push(...converted);
    else out.push(`${indent}${group} ${tabsOnly ? 'tabs' : kind}${name === undefined ? '' : ` {group=${name}}`}`, ...converted, `${indent}${group}`);
    index = end;
  }
  return out.join('\n');
}

/** A line's `:mention[Label]{id=ref}` as Expressive Markdown's `@[Label]#ref`; inline code stays as written. */
function mentions(line: string): string {
  return line.split(/(`+[^`]*`+)/).map(part => part.startsWith('`') ? part
    : part.replace(/:mention\[([^\]]*)\]\{\s*id=(?:"([^"]*)"|'([^']*)'|([^\s}]+))\s*\}/g, (_, label: string, double?: string, single?: string, bare?: string) =>
      `@[${label}]#${double ?? single ?? bare}`)).join('');
}

/** Converts every Markdown file below `root`'s content directories once, and returns the files it changed. */
export async function convertSite(root: string, directories: readonly string[]): Promise<string[]> {
  const changed: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) await visit(path); continue; }
      if (!entry.name.endsWith('.md')) continue;
      const source = await readFile(path, 'utf8'), converted = convertMarkdown(source);
      if (converted !== source) { await writeFile(path, converted); changed.push(relative(root, path)); }
    }
  };
  for (const directory of directories) if (existsSync(resolve(root, directory))) await visit(resolve(root, directory));
  return changed;
}
