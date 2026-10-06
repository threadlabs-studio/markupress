/// <reference lib="dom" />
import type { ComponentHost } from '@nextwebwg/html-next/runtime';

/** Native controls and storage own interaction; HTML Next owns reactive state and cleanup. */
export default function shell(host: ComponentHost): void {
  host.on('connect', () => {
    const document = host.root.ownerDocument;
    const window = document.defaultView!;
    let saved: string | null = null;
    try { saved = window.localStorage.getItem('markupress:theme'); } catch { /* Storage can be disabled while native controls remain usable. */ }
    let dark = saved === 'dark' || (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const actions = host.root.querySelector(':scope > header > .actions')!;
    const themeButton = actions.querySelector('[data-action="theme"]')!;
    const menuButton = actions.querySelector('[data-action="menu"]')!;
    // ARIA belongs to the lowered native buttons, alongside document-wide theme state.
    // HTMLKit's current SSR adoption skips parent invocation bindings on lowered children.
    const applyTheme = () => {
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      themeButton.setAttribute('aria-pressed', String(dark));
    };
    applyTheme();
    const click = (event: Event) => {
      const target = event.target;
      if (!(target instanceof window.Element)) return;
      if (!actions.contains(target)) return;
      const action = target.closest('[data-action]')?.getAttribute('data-action');
      if (action === 'theme') {
        dark = !dark;
        applyTheme();
        const theme = dark ? 'dark' : 'light';
        try { window.localStorage.setItem('markupress:theme', theme); } catch { /* Theme still applies for this page. */ }
      }
      if (action === 'menu') {
        host.state.menu = !host.state.menu;
        menuButton.setAttribute('aria-expanded', String(host.state.menu));
      }
    };
    host.root.addEventListener('click', click);
    return () => host.root.removeEventListener('click', click);
  });
}
