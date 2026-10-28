/// <reference lib="dom" />
import type { ComponentHost } from '@nextwebwg/html-next/runtime';
import { createSearch, type LocalSearchOptions, type SearchEntry } from '../search.js';

const indexes = new Map<string, Promise<ReturnType<typeof createSearch>>>();
/** Each URL, language and matching configuration shares one lazy browser index. */
function load(url: string, window: Window, options: LocalSearchOptions, locale: string): Promise<ReturnType<typeof createSearch>> {
  const key = JSON.stringify([url, locale, options]);
  let index = indexes.get(key);
  if (index === undefined) {
    index = window.fetch(url).then(response => { if (!response.ok) throw new Error(`${url}: ${response.status}`); return response.json() as Promise<SearchEntry[]>; })
      .then(entries => createSearch(entries, options, locale));
    index.catch(() => indexes.delete(key));
    indexes.set(key, index);
  }
  return index;
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
    let scope = JSON.stringify([host.props.index!.value, host.props.options!.value]);
    // MarkupKit keeps this controller across language/version navigation and adopts its new props.
    const unwatch = host.effect(() => {
      const next = JSON.stringify([host.props.index!.value, host.props.options!.value]);
      if (next === scope) return;
      scope = next; ++latest;
      host.state.open = false; host.state.results = []; host.state.selected = ''; host.state.status = '';
    });
    const run = async () => {
      const query = input.value, request = ++latest;
      host.state.results = [];
      host.state.status = '';
      if (query.trim() === '') return;
      host.state.status = 'Searching…';
      try {
        const search = await load(String(host.props.index!.value), window, host.props.options!.value as LocalSearchOptions, document.documentElement.lang);
        if (request !== latest) return;
        const results = search(query);
        host.state.results = results;
        host.state.selected = results[0]?.href ?? '';
        host.state.status = results.length === 0 ? `No results for "${query}"` : `${results.length} result${results.length === 1 ? '' : 's'}`;
      } catch { if (request === latest) { host.state.results = []; host.state.status = 'Search is unavailable.'; } }
    };
    // The opening dialog may focus its field first; the last query is then selected only when focus moves here, so typing never replaces a letter.
    const open = () => { host.state.open = true; void run(); window.requestAnimationFrame(() => { if (document.activeElement !== input) { input.focus(); input.select(); } }); };
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
      if (event.isComposing) return;
      const target = event.target instanceof window.HTMLElement ? event.target : null;
      const typing = target !== null && (target.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey)) {
        event.preventDefault(); open();
      }
      // Keep native button semantics: arrows move focus to results, and Tab/Enter retain their browser behavior.
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-href] button')];
      const at = buttons.indexOf(target as HTMLButtonElement);
      if (buttons.length > 0 && (target === input || at >= 0) && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        const next = at < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1) : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        host.state.selected = buttons[next]!.closest<HTMLElement>('[data-href]')!.dataset.href;
        buttons[next]!.focus(); buttons[next]!.scrollIntoView({ block: 'nearest' });
      }
      // Closing the dialog restores trigger focus; consume Enter so its native action cannot reopen search.
      if (event.key === 'Enter' && target === input) {
        event.preventDefault();
        root.querySelector<HTMLElement>('[data-href] button')?.click();
      }
    };
    // Looma's dialog reports each close, by Escape, the backdrop or the page.
    const close = () => { ++latest; host.state.open = false; };
    const shell = root.querySelector('[data-component="ui-search-shell"]')!;
    input.addEventListener('input', run);
    shell.addEventListener('close', close);
    root.addEventListener('click', click);
    document.addEventListener('keydown', keydown);
    return () => {
      ++latest; unwatch();
      input.removeEventListener('input', run); shell.removeEventListener('close', close);
      root.removeEventListener('click', click); document.removeEventListener('keydown', keydown);
    };
  });
}
