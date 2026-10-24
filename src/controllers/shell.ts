/// <reference lib="dom" />
import type { ComponentHost } from '@nextwebwg/html-next/runtime';

/**
 * Native controls and storage own interaction; HTML Next owns reactive state and cleanup. The drawer is a
 * native popover, which opens without this controller. HTMLKit keeps the shell across client navigation, so a
 * followed link here closes the drawer, as a document load would.
 */
export default function shell(host: ComponentHost): void {
  host.on('connect', () => {
    const document = host.root.ownerDocument;
    const window = document.defaultView!;
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    let explicit = false;
    try { explicit = ['light', 'dark'].includes(window.localStorage.getItem('markupress:theme') ?? ''); } catch { /* System mode works without storage. */ }
    const followSystem = () => {
      if (explicit) return;
      host.state.dark = system.matches;
      document.documentElement.dataset.theme = system.matches ? 'dark' : 'light';
    };
    system.addEventListener('change', followSystem);
    // The plugin's head script chose the theme before first paint.
    host.state.dark = document.documentElement.dataset.theme === 'dark';
    const click = (event: Event) => {
      const target = event.target;
      if (!(target instanceof window.Element)) return;
      if (target.closest('[data-action="theme"]')) {
        explicit = true;
        host.state.dark = !host.state.dark;
        const theme = host.state.dark ? 'dark' : 'light';
        document.documentElement.dataset.theme = theme;
        try { window.localStorage.setItem('markupress:theme', theme); } catch { /* Theme still applies for this page. */ }
      }
      if (target.closest('a[href]')) host.root.querySelector<HTMLElement>('#documentation-navigation:popover-open')?.hidePopover();
    };
    // The page sits inside the shell, so this sees every click.
    host.root.addEventListener('click', click);
    return () => { host.root.removeEventListener('click', click); system.removeEventListener('change', followSystem); };
  });
}
