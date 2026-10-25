/// <reference lib="dom" />
import type { ComponentHost } from '@nextwebwg/html-next/runtime';

interface Entry { readonly href: string; readonly page: string; readonly heading: string; readonly text: string; readonly words: string }
// Case and accents never decide a match: "cafe" finds "Café".
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const indexes = new Map<string, Promise<readonly Entry[]>>();
/** The version's search index, read once per page load. */
function load(url: string, window: Window): Promise<readonly Entry[]> {
  let index = indexes.get(url);
  if (index === undefined) {
    index = window.fetch(url).then(response => { if (!response.ok) throw new Error(`${url}: ${response.status}`); return response.json() as Promise<Omit<Entry, 'words'>[]>; })
      .then(entries => entries.map(entry => ({ ...entry, words: fold(`${entry.heading} ${entry.page} ${entry.text}`) })));
    // A failed read is tried again the next time the dialog searches.
    index.catch(() => indexes.delete(url));
    indexes.set(url, index);
  }
  return index;
}

/** Up to 20 sections holding every word of the query, a heading match first, then a page title match. */
function search(entries: readonly Entry[], query: string) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const score = (entry: Entry) => terms.reduce((total, term) =>
    total + (fold(entry.heading).includes(term) ? 10 : 0) + (fold(entry.page).includes(term) ? 3 : 0) + 1, 0);
  return entries.filter(entry => terms.every(term => entry.words.includes(term))).map(entry => ({ entry, score: score(entry) }))
    .sort((a, b) => b.score - a.score).slice(0, 20).map(({ entry }) => ({ href: entry.href, page: entry.heading === entry.page ? '' : entry.page,
      heading: entry.heading, excerpt: excerpt(entry.text, terms[0]!) }));
}
/** About 160 characters of the section's text around the first word of the query. */
function excerpt(text: string, term: string): string {
  const at = Math.max(0, fold(text).indexOf(term) - 60);
  const start = at === 0 ? 0 : text.indexOf(' ', at) + 1;
  return (start > 0 ? '…' : '') + text.slice(start, start + 160) + (start + 160 < text.length ? '…' : '');
}

/**
 * Local search. The button opens Looma's search dialog, as `/` and Ctrl+K or Cmd+K do outside a text field. Typing
 * searches the current version's index, and choosing a result navigates to it.
 */
export default function searchController(host: ComponentHost): void {
  host.on('connect', () => {
    const root = host.root, document = root.ownerDocument, window = document.defaultView!;
    const input = root.querySelector('input')!;
    root.querySelector<HTMLElement>('.trigger')!.hidden = false;
    let latest = 0;
    const run = async () => {
      const query = input.value, request = ++latest;
      try {
        const results = search(await load(String(host.props.index!.value), window), query);
        if (request !== latest) return;
        host.state.results = results;
        host.state.status = query.trim() === '' ? '' : results.length === 0 ? `No results for "${query}"` : `${results.length} result${results.length === 1 ? '' : 's'}`;
      } catch { if (request === latest) host.state.status = 'Search is unavailable.'; }
    };
    // The opening dialog may focus its field first; the last query is then selected only when focus moves here, so typing never replaces a letter.
    const open = () => { host.state.open = true; window.requestAnimationFrame(() => { if (document.activeElement !== input) { input.focus(); input.select(); } }); };
    const click = (event: Event) => {
      const target = event.target instanceof window.Element ? event.target : null;
      if (target?.closest('[data-action="search"]')) { open(); return; }
      const href = target?.closest<HTMLElement>('[data-href]')?.dataset.href;
      if (href === undefined) return;
      host.state.open = false;
      // MarkupKit renders the page in place through the Navigation API, as it does for a followed link.
      window.location.assign(href);
    };
    const keydown = (event: KeyboardEvent) => {
      const target = event.target instanceof window.HTMLElement ? event.target : null;
      const typing = target !== null && (target.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey)) {
        event.preventDefault(); open();
      }
      // Enter in the field opens the first result.
      if (event.key === 'Enter' && target === input) root.querySelector<HTMLElement>('[data-href] button')?.click();
    };
    // Looma's dialog reports each close, by Escape, the backdrop or the page.
    const close = () => { host.state.open = false; };
    const shell = root.querySelector('[data-component="ui-search-shell"]')!;
    input.addEventListener('input', run);
    shell.addEventListener('close', close);
    root.addEventListener('click', click);
    document.addEventListener('keydown', keydown);
    return () => {
      input.removeEventListener('input', run); shell.removeEventListener('close', close);
      root.removeEventListener('click', click); document.removeEventListener('keydown', keydown);
    };
  });
}
