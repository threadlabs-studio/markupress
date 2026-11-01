// @vitest-environment jsdom
/// <reference lib="dom" />
import { expect, it, vi } from 'vitest';
import type { ComponentHost } from '@nextwebwg/html-next/runtime';
import searchController from '../src/controllers/search.js';
import type { HostedSearch } from '../src/algolia.js';

let identity = 0;
function controller(fetch: typeof window.fetch, shells = '<div data-component="ui-search-shell"></div>', hosted?: HostedSearch) {
  const root = document.createElement('div');
  root.innerHTML = '<span class="trigger" hidden></span><input>' + shells;
  document.body.replaceChildren(root);
  window.fetch = fetch;
  let connect!: () => (() => void);
  const state: Record<string, unknown> = { results: [], status: '' };
  const props = { index: { value: `/index-${++identity}.json` }, options: { value: {} }, hosted: { value: hosted ?? null } };
  let effect: (() => void) | undefined;
  searchController({ root, state, props,
    effect(callback: () => void) { effect = callback; callback(); return () => { effect = undefined; }; },
    on(_event: string, callback: () => (() => void)) { connect = callback; } } as unknown as ComponentHost);
  const disconnect = connect();
  const input = (query: string) => { root.querySelector('input')!.value = query; root.querySelector('input')!.dispatchEvent(new Event('input')); };
  return { state, input, disconnect, changeHosted(value: HostedSearch | null) { props.hosted.value = value; effect?.(); }, changeIndex(url: string) { props.index.value = url; effect?.(); } };
}
const entries = [{ href: '/install/', page: 'Installation', heading: 'Installation', text: 'Set up the package.' }];

it('does not fetch for an empty query or replace a cleared query with a late response', async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
  const subject = controller(fetch);
  subject.input(''); expect(fetch).not.toHaveBeenCalled();
  subject.input('install'); subject.input('');
  resolve(new Response(JSON.stringify(entries)));
  await vi.waitFor(() => expect(fetch).toHaveResolved());
  expect(subject.state).toMatchObject({ results: [], status: '' });
  subject.disconnect();
});

it('clears results on failure and retries the failed index on later input', async () => {
  const fetch = vi.fn<typeof window.fetch>().mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(entries)));
  const subject = controller(fetch);
  subject.state.results = [{ href: '/obsolete/' }]; subject.input('install');
  await vi.waitFor(() => expect(subject.state.status).toBe('Search is unavailable.'));
  expect(subject.state.results).toEqual([]);
  subject.input('install');
  await vi.waitFor(() => expect(subject.state.status).toBe('1 result'));
  expect(subject.state.results).toMatchObject([{ href: '/install/' }]);
  expect(fetch).toHaveBeenCalledTimes(2);
  subject.disconnect();
});

it('keeps only the newest query and ignores completion after disconnect', async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
  const subject = controller(fetch);
  subject.input('missing'); subject.input('install');
  resolve(new Response(JSON.stringify(entries)));
  await vi.waitFor(() => expect(subject.state.status).toBe('1 result'));
  expect(subject.state.results).toMatchObject([{ href: '/install/' }]);
  subject.input('missing'); subject.disconnect();
  await new Promise(done => setTimeout(done, 0));
  expect(subject.state.status).toBe('Searching…');
});

it('lets an IME confirm composition without choosing a result', () => {
  const subject = controller(vi.fn());
  const result = document.createElement('div');
  result.dataset.href = '/install/'; result.innerHTML = '<button>Installation</button>';
  document.body.firstElementChild!.append(result);
  const click = vi.fn(); result.querySelector('button')!.addEventListener('click', click);
  document.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
  expect(click).not.toHaveBeenCalled();
  subject.disconnect();
});


it('clears a previous locale and rejects its late response after the index changes', async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.fn<typeof window.fetch>().mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }))
    .mockResolvedValueOnce(new Response(JSON.stringify([{ ...entries[0], href: '/fr/install/' }])));
  const subject = controller(fetch);
  subject.state.open = true; subject.input('install');
  subject.changeIndex('/fr/index.json');
  expect(subject.state).toMatchObject({ open: false, results: [], status: '' });
  resolve(new Response(JSON.stringify(entries)));
  await vi.waitFor(() => expect(fetch).toHaveResolved());
  expect(subject.state.results).toEqual([]);
  subject.input('install');
  await vi.waitFor(() => expect(subject.state.results).toMatchObject([{ href: '/fr/install/' }]));
  subject.disconnect();
});


it('consumes Enter in the field so focus restoration cannot activate the search trigger again', () => {
  const subject = controller(vi.fn());
  const result = document.createElement('div'); result.dataset.href = '/install/'; result.innerHTML = '<button>Installation</button>';
  document.body.firstElementChild!.append(result);
  const click = vi.fn(); result.querySelector('button')!.addEventListener('click', event => { event.stopPropagation(); click(); });
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  document.querySelector('input')!.dispatchEvent(enter);
  expect(click).toHaveBeenCalledOnce();
  expect(enter.defaultPrevented).toBe(true);
  subject.disconnect();
});

it('listens to canonical search-shell identity when a legacy identity disagrees', () => {
  const subject = controller(vi.fn(), '<div component="other-shell" data-component="ui-search-shell"></div><div component="ui-search-shell" data-component="other-shell"></div>');
  subject.state.open = true;
  document.querySelector('[component="other-shell"]')!.dispatchEvent(new Event('close'));
  expect(subject.state.open).toBe(true);
  document.querySelector('[component="ui-search-shell"]')!.dispatchEvent(new Event('close'));
  expect(subject.state.open).toBe(false);
  subject.disconnect();
});

const hosted: HostedSearch = { appId: 'APP123', apiKey: 'public-key', indexName: 'docs', filters: '', limit: 20, timeout: 5000, debounce: 0,
  language: 'fr', version: 'current', base: '/', home: '/fr/', prefix: '/fr/v/current/', defaultVersion: true, excludedHomes: [], origin: 'https://docs.example' };
const providerResponse = (heading: string) => new Response(JSON.stringify({ results: [{ hits: [{ language: 'fr', version: 'current',
  url: '/fr/install/', hierarchy: { lvl1: heading }, content: 'French catalog' }] }] }));

it('cancels hosted requests and ignores their late completion after a query or scope changes', async () => {
  let resolve!: (value: Response) => void;
  const fetch = vi.fn<typeof window.fetch>().mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }))
    .mockResolvedValueOnce(providerResponse('Newest'));
  const subject = controller(fetch, undefined, hosted);
  subject.input('old'); const signal = fetch.mock.calls[0]![1]!.signal!;
  subject.input('new'); expect(signal.aborted).toBe(true);
  await vi.waitFor(() => expect(subject.state.results).toMatchObject([{ heading: 'Newest' }]));
  subject.changeHosted({ ...hosted, version: 'v1', prefix: '/fr/v/v1/', defaultVersion: false });
  expect(subject.state.results).toEqual([]);
  resolve(providerResponse('Obsolete')); await new Promise(done => setTimeout(done, 0));
  expect(subject.state.results).toEqual([]); subject.disconnect();
});

it('debounces hosted input and releases pending work when closed or disconnected', async () => {
  vi.useFakeTimers();
  try {
    const fetch = vi.fn<typeof window.fetch>().mockResolvedValue(providerResponse('Installation'));
    const subject = controller(fetch, undefined, { ...hosted, debounce: 150 });
    subject.input('ins'); subject.input('install'); expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150); expect(fetch).toHaveBeenCalledTimes(1);
    subject.input('closed'); document.querySelector('[data-component="ui-search-shell"]')!.dispatchEvent(new Event('close'));
    await vi.advanceTimersByTimeAsync(150); expect(fetch).toHaveBeenCalledTimes(1);
    subject.input('disconnected'); subject.disconnect();
    await vi.advanceTimersByTimeAsync(150); expect(fetch).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});

it('retries hosted failures without loading the local index', async () => {
  const fetch = vi.fn<typeof window.fetch>().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(providerResponse('Installation'));
  const subject = controller(fetch, undefined, hosted);
  subject.input('install'); await vi.waitFor(() => expect(subject.state.status).toBe('Search is unavailable.'));
  subject.input('install'); await vi.waitFor(() => expect(subject.state.status).toBe('1 result'));
  expect(fetch.mock.calls.every(([url]) => String(url).startsWith('https://app123-dsn.algolia.net/'))).toBe(true);
  subject.disconnect();
});
