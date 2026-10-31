import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { PageSource } from '@threadlabs/markupkit';
import { readFrontMatter, type FrontMatter } from './content.js';

/** A locale/version's native mounts share one compilation scope, including its home alias. */
export interface LocaleEdition {
  readonly id: string;
  readonly locale: string;
  readonly directory: string;
  readonly prefix: string;
  readonly home: string;
}
export const editionScope = (edition: LocaleEdition): string => JSON.stringify([edition.locale, edition.id]);
export function sourceInside(root: string, file: string): boolean {
  const path = relative(root, file);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\'));
}
export interface LocaleSource {
  readonly file: string;
  readonly edition: LocaleEdition;
  readonly id: string;
  readonly path: string;
  readonly href: string;
  readonly canonical: string;
  readonly fields: FrontMatter;
}

/** Physical translations only. Fallback mounts never acquire translation ownership or hreflang. */
export async function localeSources(pages: readonly PageSource[], editions: readonly LocaleEdition[], root: string, base: string, origin?: string): Promise<readonly LocaleSource[]> {
  const fields = new Map<string, Promise<FrontMatter>>(), result: LocaleSource[] = [];
  for (const edition of editions) {
    const home = base + edition.home.slice(1), version = base + edition.prefix.slice(1);
    const mounts = pages.filter(page => page.scope === editionScope(edition) && page.file.endsWith('.md') && sourceInside(resolve(root, edition.directory), page.file));
    const files = new Set(mounts.map(page => page.file));
    for (const file of files) {
      const mount = mounts.find(page => page.file === file && page.href.startsWith(home) && !page.href.startsWith(version)) ?? mounts.find(page => page.file === file)!;
      let pending = fields.get(file);
      if (pending === undefined) { pending = readFile(file, 'utf8').then(source => readFrontMatter(source, file)); fields.set(file, pending); }
      const frontmatter = await pending;
      const path = mount.href.slice((mount.href.startsWith(version) ? version : home).length);
      const canonical = new URL(frontmatter.head?.canonical ?? mount.href, new URL(mount.href, origin ?? 'https://markupress.invalid'));
      const target = { file, edition, id: frontmatter.id ?? (path.slice(0, -1) || 'index'), path, href: mount.href,
        canonical: origin !== undefined || /^[A-Za-z][A-Za-z\d+.-]*:/.test(frontmatter.head?.canonical ?? '') ? canonical.href : canonical.pathname + canonical.search + canonical.hash, fields: frontmatter };
      const collision = result.find(source => source.edition.locale === edition.locale && source.edition.id === edition.id && source.id === target.id);
      if (collision) throw new Error(`Documentation identity collision: ${collision.file} and ${file} (${target.id}).`);
      result.push(target);
    }
  }
  return result;
}
