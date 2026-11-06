import { expect, it } from 'vitest';
import { configureSearch } from '../src/search-config.js';

it('keeps local search defaults and validates explicit provider settings', () => {
  expect(configureSearch(undefined)).toEqual({ enabled: true, local: { limit: 20, fuzzy: 0.2, prefix: true } });
  expect(configureSearch(false).enabled).toBe(false);
  expect(configureSearch({ provider: 'local', fuzzy: false }).local.fuzzy).toBe(0);
  const options = { provider: 'algolia' as const, appId: 'APP123', apiKey: 'public-key', indexName: 'docs' };
  expect(configureSearch(options).algolia).toMatchObject({ appId: 'APP123', apiKey: 'public-key', indexName: 'docs', timeout: 5000, debounce: 150 });
  for (const invalid of [{ ...options, appId: 'host.example' }, { ...options, apiKey: '' }, { ...options, timeout: 0 }, { ...options, debounce: -1 }, { ...options, fuzzy: true }]) {
    expect(() => configureSearch(invalid as never)).toThrow(/search/);
  }
});
