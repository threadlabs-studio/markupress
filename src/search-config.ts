import type { LocalSearchOptions } from './search.js';
import type { AlgoliaSearchOptions } from './algolia.js';

export type SearchOptions = (LocalSearchOptions & { readonly provider?: 'local' }) | AlgoliaSearchOptions;
export interface SearchConfiguration {
  readonly enabled: boolean;
  readonly local: { readonly limit: number; readonly fuzzy: number; readonly prefix: boolean };
  readonly algolia?: Required<Omit<AlgoliaSearchOptions, 'provider'>>;
}

/** Normalize configuration once; invalid provider-specific options cannot silently change meaning. */
export function configureSearch(input: false | SearchOptions | undefined): SearchConfiguration {
  if (input !== undefined && input !== false && (input === null || typeof input !== 'object' || Array.isArray(input))) throw new Error('search must be false or an object of search options.');
  const value = input === false || input === undefined ? {} : input;
  const provider = 'provider' in value ? value.provider : 'local';
  if (provider !== undefined && provider !== 'local' && provider !== 'algolia') throw new Error('search.provider must be local or algolia.');
  const keys = provider === 'algolia' ? ['provider', 'appId', 'apiKey', 'indexName', 'filters', 'limit', 'timeout', 'debounce'] : ['provider', 'limit', 'fuzzy', 'prefix'];
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`Unknown search option ${key}.`);
  const limit = value.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('search.limit must be a positive whole number.');
  if (provider === 'algolia') {
    const hosted = value as AlgoliaSearchOptions;
    if (typeof hosted.appId !== 'string' || !/^[A-Za-z0-9]+$/.test(hosted.appId)) throw new Error('search.appId must be an Algolia application ID.');
    for (const key of ['apiKey', 'indexName'] as const) if (typeof hosted[key] !== 'string' || !hosted[key].trim() || /[\r\n]/.test(hosted[key])) throw new Error(`search.${key} must be a nonempty single-line string.`);
    if (hosted.filters !== undefined && typeof hosted.filters !== 'string') throw new Error('search.filters must be a string.');
    const timeout = hosted.timeout ?? 5000, debounce = hosted.debounce ?? 150;
    if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error('search.timeout must be a positive whole number of milliseconds.');
    if (!Number.isSafeInteger(debounce) || debounce < 0) throw new Error('search.debounce must be a nonnegative whole number of milliseconds.');
    return { enabled: true, local: { limit, fuzzy: 0.2, prefix: true }, algolia: {
      appId: hosted.appId, apiKey: hosted.apiKey, indexName: hosted.indexName, filters: hosted.filters ?? '', limit, timeout, debounce } };
  }
  const local = value as LocalSearchOptions;
  if (local.fuzzy !== undefined && local.fuzzy !== false && (typeof local.fuzzy !== 'number' || !Number.isFinite(local.fuzzy) || local.fuzzy < 0 || local.fuzzy > 1)) throw new Error('search.fuzzy must be false or a fraction between 0 and 1.');
  if (local.prefix !== undefined && typeof local.prefix !== 'boolean') throw new Error('search.prefix must be true or false.');
  return { enabled: input !== false, local: { limit, fuzzy: local.fuzzy === false ? 0 : local.fuzzy ?? 0.2, prefix: local.prefix ?? true } };
}
