/// <reference lib="dom" />
import type { ComponentHost } from '@nextwebwg/html-next/runtime';
import { english, formatMessage, searchResultCount, type Translations } from '../i18n.js';
import type { createSearch, LocalSearchOptions, SearchEntry } from '../search.js';
import { searchAlgolia, type HostedSearch } from '../algolia.js';

const indexes = new Map<string, Promise<ReturnType<typeof createSearch>>>();
/** Each URL, language and matching configuration shares one lazy browser index. */
function load(url: string, window: Window, options: LocalSearchOptions, locale: string): Promise<ReturnType<typeof createSearch>> {
  const key = JSON.stringify([url, locale, options]);
  let index = indexes.get(key);
  if (index === undefined) {
    index = window.fetch(url).then(response => { if (!response.ok) throw new Error(`${url}: ${response.status}`); return response.json() as Promise<SearchEntry[]>; })
      .then(async entries => (await import('../search.js')).createSearch(entries, options, locale));
    index.catch(() => indexes.delete(key));
    indexes.set(key, index);
  }
  return index;
}

/**
 * Documentation search. The button opens Looma's search dialog, as `/` and Ctrl+K or Cmd+K do outside a text field. Typing
 * searches the current version's index, and choosing a result navigates to it.
 */
export default function searchController(host: ComponentHost): void {
  host.on('connect', () => {
    const root = host.root, document = root.ownerDocument, window = document.defaultView!;
    const input = root.querySelector('input')!;
    root.querySelector<HTMLElement>('.trigger')!.hidden = false;
    let latest = 0, pending: number | undefined, active: AbortController | undefined;
    const cancel = () => { if (pending !== undefined) window.clearTimeout(pending); pending = undefined; active?.abort(); active = undefined; };
    const currentScope = () => JSON.stringify([host.props.index!.value, host.props.options!.value, host.props.lang?.value, host.props.ui?.value, host.props.hosted?.value]);
    let scope = currentScope();
    // MarkupKit keeps this controller across language/version navigation and adopts its new props.
    const unwatch = host.effect(() => {
      const next = currentScope();
      if (next === scope) return;
      scope = next; ++latest; cancel();
      host.state.open = false; host.state.results = []; host.state.selected = ''; host.state.status = '';
    });
    const run = () => {
      const query = input.value, request = ++latest;
      cancel();
      const ui = (host.props.ui?.value as Translations | undefined) ?? english;
      const lang = String(host.props.lang?.value ?? (document.documentElement.lang || 'en'));
      const hosted = host.props.hosted?.value as HostedSearch | null | undefined;
      host.state.results = []; host.state.selected = ''; host.state.status = '';
      if (query.trim() === '') return;
      host.state.status = ui.searching;
      const execute = async () => {
        pending = undefined;
        const controller = hosted ? new AbortController() : undefined;
        active = controller;
        try {
          const results = hosted ? await searchAlgolia(hosted, query, { fetch: window.fetch.bind(window), origin: window.location.origin, signal: controller!.signal })
            : (await load(String(host.props.index!.value), window, host.props.options!.value as LocalSearchOptions, lang))(query);
          if (request !== latest) return;
          host.state.results = results;
          host.state.selected = results[0]?.href ?? '';
          host.state.status = results.length === 0 ? formatMessage(ui.noResults, { query }) : searchResultCount(ui, results.length, lang);
        } catch { if (request === latest) { host.state.results = []; host.state.status = ui.searchUnavailable; } }
        finally { if (active === controller) active = undefined; }
      };
      if (hosted?.debounce) pending = window.setTimeout(() => { void execute(); }, hosted.debounce);
      else void execute();
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
    const close = () => { ++latest; cancel(); host.state.open = false; };
    const shell = root.querySelector(':is([component="ui-search-shell"], [data-component="ui-search-shell"]:not([component]))')!;
    input.addEventListener('input', run);
    shell.addEventListener('close', close);
    root.addEventListener('click', click);
    document.addEventListener('keydown', keydown);
    return () => {
      ++latest; cancel(); unwatch();
      input.removeEventListener('input', run); shell.removeEventListener('close', close);
      root.removeEventListener('click', click); document.removeEventListener('keydown', keydown);
    };
  });
}
