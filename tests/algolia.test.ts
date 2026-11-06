import { expect, it, vi } from 'vitest';
import { searchAlgolia, type HostedSearch } from '../src/algolia.js';

const context: HostedSearch = { appId: 'APP123', apiKey: 'public-key', indexName: 'docs', filters: 'audience:public', limit: 20,
  timeout: 5000, debounce: 0, language: 'fr', version: 'current', base: '/manual/', home: '/manual/fr/', prefix: '/manual/fr/v/current/',
  defaultVersion: true, excludedHomes: [], origin: 'https://docs.example' };
const hit = { objectID: 'setup', language: 'fr', version: 'current', url: 'https://docs.example/manual/fr/setup/#install',
  hierarchy: { lvl0: 'Documentation', lvl1: 'Installation', lvl2: 'Install the package' }, content: 'Keep <examples> literal. Café 👩🏽‍💻' };

it('sends contextual Algolia requests and maps literal DocSearch records into preview-local destinations', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [{ hits: [hit] }] })));
  const results = await searchAlgolia(context, 'café', { fetch, origin: 'http://localhost:3000' });
  const [url, init] = fetch.mock.calls[0]!;
  expect(url).toBe('https://app123-dsn.algolia.net/1/indexes/*/queries');
  expect(new Headers(init!.headers).get('x-algolia-api-key')).toBe('public-key');
  const request = JSON.parse(String(init!.body)).requests[0];
  expect(request.indexName).toBe('docs');
  const params = new URLSearchParams(request.params);
  expect(params.get('query')).toBe('café'); expect(params.get('filters')).toBe('audience:public');
  expect(JSON.parse(params.get('facetFilters')!)).toEqual(['language:fr', 'version:current']);
  expect(results).toEqual([{ href: '/manual/fr/setup/#install', page: 'Installation', heading: 'Install the package', excerpt: hit.content }]);
});

it('rejects other contexts, origins, catalog paths and non-document URLs while retaining valid record arrays', async () => {
  const hits = [hit, { ...hit, language: 'en' }, { ...hit, version: 'v1' }, { ...hit, url: 'javascript:alert(1)' },
    { ...hit, url: 'https://other.example/manual/fr/setup/' }, { ...hit, url: '/manual/fr/v/v1/setup/' }, { ...hit, url: '/manual/setup/' },
    { ...hit, language: ['fr'], version: ['current'], url: '/manual/fr/v/current/setup/' }];
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [{ hits }] })));
  expect((await searchAlgolia(context, 'install', { fetch, origin: 'https://docs.example' })).map(result => result.href))
    .toEqual(['/manual/fr/setup/#install', '/manual/fr/v/current/setup/']);
});

it('distinguishes empty results from HTTP and malformed provider responses', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ hits: [] }] })))
    .mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(new Response('{}'));
  expect(await searchAlgolia(context, 'missing', { fetch, origin: 'https://docs.example' })).toEqual([]);
  await expect(searchAlgolia(context, 'retry', { fetch, origin: 'https://docs.example' })).rejects.toThrow();
  await expect(searchAlgolia(context, 'retry', { fetch, origin: 'https://docs.example' })).rejects.toThrow();
});

it('aborts timed-out provider requests', async () => {
  vi.useFakeTimers();
  try {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((_url, init) => new Promise((_done, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const result = searchAlgolia(context, 'waiting', { fetch, origin: 'https://docs.example' });
    const assertion = expect(result).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(5000); await assertion;
  } finally { vi.useRealTimers(); }
});

it('keeps the default catalog out of other locale homes and versions', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [{ hits: [
    { ...hit, language: 'en', url: '/manual/setup/' }, { ...hit, language: 'en', url: '/manual/fr/setup/' },
    { ...hit, language: 'en', url: '/manual/v/v1/setup/' }, { ...hit, language: 'en', url: '/manual/v/current/setup/' },
  ] }] })));
  const scope = { ...context, language: 'en', home: '/manual/', prefix: '/manual/v/current/', excludedHomes: ['/manual/fr/', '/manual/ar/'] };
  expect((await searchAlgolia(scope, 'setup', { fetch, origin: 'https://docs.example' })).map(result => result.href))
    .toEqual(['/manual/setup/', '/manual/v/current/setup/']);
});

it('uses plain provider snippets without interpreting markup or splitting graphemes', async () => {
  const text = 'Matched <examples> 👩🏽‍💻 ';
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ results: [{ hits: [{ ...hit,
    _snippetResult: { content: { value: text } } }] }] })));
  const result = await searchAlgolia(context, 'matched', { fetch, origin: 'https://docs.example' });
  expect(result[0]!.excerpt).toBe(text);
  const params = new URLSearchParams(JSON.parse(String(fetch.mock.calls[0]![1]!.body)).requests[0].params);
  expect(JSON.parse(params.get('attributesToSnippet')!)).toEqual(['content:30']);
  expect(params.get('highlightPreTag')).toBe(''); expect(params.get('highlightPostTag')).toBe('');
});
