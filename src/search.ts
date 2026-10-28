import MiniSearch from 'minisearch';

export interface LocalSearchOptions {
  /** Maximum number of results, 20 by default. */
  readonly limit?: number;
  /** Allowed edit distance as a fraction of term length, 0.2 by default; false disables typo matching. */
  readonly fuzzy?: number | false;
  /** Match unfinished words, true by default. */
  readonly prefix?: boolean;
}
export interface SearchEntry { readonly href: string; readonly page: string; readonly heading: string; readonly text: string }
export interface SearchResult { readonly href: string; readonly page: string; readonly heading: string; readonly excerpt: string }
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Build once per downloaded index; native segmentation also finds words in scripts without spaces. */
export function createSearch(entries: readonly SearchEntry[], options: LocalSearchOptions = {}, locale?: string): (query: string) => SearchResult[] {
  const words = new Intl.Segmenter(locale || undefined, { granularity: 'word' });
  const graphemes = new Intl.Segmenter(locale || undefined, { granularity: 'grapheme' });
  const tokenize = (text: string) => [...words.segment(text)].filter(part => part.isWordLike).map(part => part.segment);
  const index = new MiniSearch({ fields: ['heading', 'page', 'text'], tokenize, processTerm: fold,
    searchOptions: { combineWith: 'AND', boost: { heading: 10, page: 3 }, prefix: options.prefix ?? true,
      fuzzy: options.fuzzy === false ? false : options.fuzzy ?? 0.2 } });
  index.addAll(entries.map((entry, id) => ({ ...entry, id })));
  return query => index.search(query).slice(0, options.limit ?? 20).map(result => {
    const entry = entries[result.id as number]!;
    const at = [...words.segment(entry.text)].find(part => part.isWordLike && result.terms.some(term => fold(part.segment).startsWith(term)))?.index ?? 0;
    // Slice source graphemes, not folded offsets: normalization may change length, and neither emoji nor combining marks may split.
    const parts = [...graphemes.segment(entry.text)];
    const match = parts.findIndex(part => part.index >= at), start = Math.max(0, match - 60), end = start + 160;
    const excerpt = (start > 0 ? '…' : '') + parts.slice(start, end).map(part => part.segment).join('') + (end < parts.length ? '…' : '');
    return { href: entry.href, page: entry.heading === entry.page ? '' : entry.page, heading: entry.heading, excerpt };
  });
}
