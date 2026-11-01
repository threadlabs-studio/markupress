import { createHash } from 'node:crypto';

export interface SearchRecordInput {
  readonly document: string;
  readonly section: string;
  readonly href: string;
  readonly page: string;
  readonly heading: string;
  readonly text: string;
}
export interface AlgoliaRecord {
  readonly objectID: string;
  readonly url: string;
  readonly url_without_anchor: string;
  readonly hierarchy: { readonly lvl1: string; readonly lvl2: string };
  readonly content: string;
  readonly language: string;
  readonly version: string;
  readonly type: 'content';
}

/** Fit the smallest documented Algolia record limit without dropping long sections or splitting graphemes. */
export function algoliaRecords(entries: readonly SearchRecordInput[], language: string, version: string, origin?: string): AlgoliaRecord[] {
  const records: AlgoliaRecord[] = [], graphemes = new Intl.Segmenter(language, { granularity: 'grapheme' });
  for (const entry of entries) {
    const record = (content: string, chunk: number): AlgoliaRecord => ({
      objectID: createHash('sha256').update(JSON.stringify([language, version, entry.document, entry.section, chunk])).digest('hex'),
      url: origin === undefined ? entry.href : new URL(entry.href, origin).href,
      url_without_anchor: origin === undefined ? entry.href.split('#')[0]! : new URL(entry.href.split('#')[0]!, origin).href,
      hierarchy: { lvl1: entry.page, lvl2: entry.heading || entry.page }, content, language, version, type: 'content',
    });
    const available = 10_000 - Buffer.byteLength(JSON.stringify(record('', 0)));
    if (available <= 0) throw new Error(`Algolia record metadata exceeds 10KB: ${entry.href}.`);
    let content = '', bytes = 0, chunk = 0;
    for (const { segment } of graphemes.segment(entry.text)) {
      // JSON quotes and control characters consume bytes too; each segment's encoding is additive.
      const size = Buffer.byteLength(JSON.stringify(segment)) - 2;
      if (size > available) throw new Error(`Algolia cannot fit a grapheme in its record: ${entry.href}.`);
      if (bytes + size > available) { records.push(record(content, chunk++)); content = ''; bytes = 0; }
      content += segment; bytes += size;
    }
    if (content || chunk === 0) records.push(record(content, chunk));
  }
  return records;
}
