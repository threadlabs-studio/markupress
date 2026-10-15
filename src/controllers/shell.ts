/// <reference lib="dom" />
import type { ComponentHost } from '@nextwebwg/html-next/runtime';

/**
 * Native controls and storage own interaction; HTML Next owns reactive state and cleanup. The drawer is a
 * native popover and the dropdowns are native details, which open without this controller. HTMLKit keeps
 * the shell across client navigation, so a followed link here closes the drawer and any open dropdown, as a
 * document load would.
 */
export default function shell(host: ComponentHost): void {
  host.on('connect', () => {
    const document = host.root.ownerDocument;
    const window = document.defaultView!;
    // The plugin's head script chose the theme before first paint.
    host.state.dark = document.documentElement.dataset.theme === 'dark';
    const close = (except?: Element) => {
      for (const open of host.root.querySelectorAll('header details[open]')) if (!open.contains(except ?? null)) open.removeAttribute('open');
    };
    const click = (event: Event) => {
      const target = event.target;
      if (!(target instanceof window.Element)) return;
      if (target.closest('[data-action="theme"]')) {
        host.state.dark = !host.state.dark;
        const theme = host.state.dark ? 'dark' : 'light';
        document.documentElement.dataset.theme = theme;
        try { window.localStorage.setItem('markupress:theme', theme); } catch { /* Theme still applies for this page. */ }
      }
      const link = target.closest('a[href]');
      close(link ? undefined : target);
      if (link) host.root.querySelector<HTMLElement>('#documentation-navigation:popover-open')?.hidePopover();
    };
    // The page sits inside the shell, so this sees every click: one outside a dropdown closes it.
    host.root.addEventListener('click', click);
    return () => host.root.removeEventListener('click', click);
  });
}
