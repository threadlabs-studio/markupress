/// <reference lib="dom" />
import type { SearchResult } from './search.js';

export interface AlgoliaSearchOptions {
  readonly provider: 'algolia';
  readonly appId: string;
  /** Public search-only key, included in the browser's requests. */
  readonly apiKey: string;
  readonly indexName: string;
  /** Application filters, applied in addition to the selected language and version. */
  readonly filters?: string;
  readonly limit?: number;
  /** Request deadline in milliseconds, 5000 by default. */
  readonly timeout?: number;
  /** Input debounce in milliseconds, 150 by default; zero sends immediately. */
  readonly debounce?: number;
}
/** Resolved browser configuration; catalog language is separate from the interface's BCP 47 tag. */
export interface HostedSearch extends Required<Omit<AlgoliaSearchOptions, 'provider'>> {
  readonly language: string;
  readonly version: string;
  readonly base: string;
  readonly home: string;
  readonly prefix: string;
  readonly defaultVersion: boolean;
  readonly excludedHomes: readonly string[];
  readonly origin: string;
}
export const algoliaOrigin = (appId: string): string => `https://${appId.toLowerCase()}-dsn.algolia.net`;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const includes = (value: unknown, expected: string) => value === expected || (Array.isArray(value) && value.includes(expected));

function destination(value: string, options: HostedSearch, origin: string): string | undefined {
  const canonical = new URL(options.origin || origin);
  let url: URL;
  try { url = new URL(value, new URL(options.base, canonical)); } catch { return undefined; }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || (url.origin !== canonical.origin && url.origin !== origin)) return undefined;
  const version = url.pathname.startsWith(options.prefix);
  const home = options.defaultVersion && url.pathname.startsWith(options.home) && !url.pathname.startsWith(options.home + 'v/') &&
    !options.excludedHomes.some(prefix => url.pathname.startsWith(prefix));
  if (!version && !home) return undefined;
  // A canonical production URL also works in an installed preview on another origin.
  return url.pathname + url.search + url.hash;
}

/** The documented REST boundary; response text stays plain data for Looma's existing result controls. */
export async function searchAlgolia(options: HostedSearch, query: string, runtime: {
  readonly fetch: typeof globalThis.fetch;
  readonly origin: string;
  readonly signal?: AbortSignal;
}): Promise<SearchResult[]> {
  const controller = new AbortController();
  const abort = () => controller.abort(runtime.signal?.reason);
  if (runtime.signal?.aborted) abort();
  else runtime.signal?.addEventListener('abort', abort, { once: true });
  const deadline = setTimeout(() => controller.abort(new Error('Search request timed out.')), options.timeout);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const params = new URLSearchParams({ query, hitsPerPage: String(options.limit),
      facetFilters: JSON.stringify([`language:${options.language}`, `version:${options.version}`]),
      attributesToRetrieve: JSON.stringify(['hierarchy', 'content', 'url', 'language', 'version']),
      attributesToSnippet: JSON.stringify(['content:30']), highlightPreTag: '', highlightPostTag: '' });
    if (options.filters) params.set('filters', options.filters);
    const response = await runtime.fetch(algoliaOrigin(options.appId) + '/1/indexes/*/queries', { method: 'POST', credentials: 'omit', signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-algolia-application-id': options.appId, 'x-algolia-api-key': options.apiKey },
      body: JSON.stringify({ requests: [{ indexName: options.indexName, params: params.toString() }] }) });
    if (!response.ok) throw new Error(`Search provider returned ${response.status}.`);
    const data: unknown = await response.json();
    if (!object(data) || !Array.isArray(data.results) || !object(data.results[0]) || !Array.isArray(data.results[0].hits)) throw new Error('Search provider returned an invalid response.');
    const results: SearchResult[] = [], seen = new Set<string>();
    const graphemes = new Intl.Segmenter(options.language, { granularity: 'grapheme' });
    for (const hit of data.results[0].hits) {
      if (!object(hit) || !includes(hit.language, options.language) || !includes(hit.version, options.version) || typeof hit.url !== 'string' || !object(hit.hierarchy)) continue;
      const href = destination(hit.url, options, runtime.origin);
      const fields = hit.hierarchy;
      const hierarchy = Array.from({ length: 7 }, (_, level) => fields[`lvl${level}`]).filter((value): value is string => typeof value === 'string' && value !== '');
      if (href === undefined || seen.has(href) || hierarchy.length === 0) continue;
      const page = typeof fields.lvl1 === 'string' ? fields.lvl1 : hierarchy[0]!;
      const heading = hierarchy.at(-1)!;
      const snippet = object(hit._snippetResult) && object(hit._snippetResult.content) && typeof hit._snippetResult.content.value === 'string' ? hit._snippetResult.content.value : hit.content;
      const parts = [...graphemes.segment(typeof snippet === 'string' ? snippet : '')];
      results.push({ href, page: page === heading ? '' : page, heading, excerpt: parts.slice(0, 160).map(part => part.segment).join('') + (parts.length > 160 ? '…' : '') });
      seen.add(href);
      if (results.length >= options.limit) break;
    }
    return results;
  } finally {
    clearTimeout(deadline);
    runtime.signal?.removeEventListener('abort', abort);
  }
}
