/// <reference lib="dom" />
import type { ComponentHost } from '@nextwebwg/html-next/runtime';

/** Native controls and storage own interaction; HTML Next owns reactive state and cleanup. */
export default function shell(host: ComponentHost): void {
  host.on('connect', () => {
    const document = host.root.ownerDocument;
    const window = document.defaultView!;
    let saved: string | null = null;
    try { saved = window.localStorage.getItem('markupress:theme'); } catch { /* Storage can be disabled while native controls remain usable. */ }
    host.state.dark = saved === 'dark' || (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const actions = host.root.querySelector(':scope > header > .actions')!;
    const applyTheme = () => {
      document.documentElement.dataset.theme = host.state.dark ? 'dark' : 'light';
    };
    applyTheme();
    // HTMLKit head metadata admits no script, so a saved theme lands after first paint. Settle it
    // at once instead of animating controls out of the default theme; user toggles still animate.
    for (const transition of document.getAnimations()) if (transition instanceof window.CSSTransition) transition.finish();
    const click = (event: Event) => {
      const target = event.target;
      if (!(target instanceof window.Element)) return;
      if (!actions.contains(target)) return;
      const action = target.closest('[data-action]')?.getAttribute('data-action');
      if (action === 'theme') {
        host.state.dark = !host.state.dark;
        applyTheme();
        const theme = host.state.dark ? 'dark' : 'light';
        try { window.localStorage.setItem('markupress:theme', theme); } catch { /* Theme still applies for this page. */ }
      }
      if (action === 'menu') {
        host.state.menu = !host.state.menu;
      }
    };
    host.root.addEventListener('click', click);
    return () => host.root.removeEventListener('click', click);
  });
}
