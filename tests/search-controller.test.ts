// @vitest-environment jsdom
/// <reference lib="dom" />
import { expect, it, vi } from 'vitest';
import type { ComponentHost } from '@nextwebwg/html-next/runtime';
import searchController from '../src/controllers/search.js';

let identity = 0;
function controller(fetch: typeof window.fetch) {
  const root = document.createElement('div');
  root.innerHTML = '<span class="trigger" hidden></span><input><div data-component="ui-search-shell"></div>';
  document.body.replaceChildren(root);
  window.fetch = fetch;
  let connect!: () => (() => void);
  const state: Record<string, unknown> = { results: [], status: '' };
  searchController({ root, state, props: { index: { value: `/index-${++identity}.json` }, options: { value: {} } },
    on(_event: string, callback: () => (() => void)) { connect = callback; } } as unknown as ComponentHost);
  const disconnect = connect();
  const input = (query: string) => { root.querySelector('input')!.value = query; root.querySelector('input')!.dispatchEvent(new Event('input')); };
  return { state, input, disconnect };
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
