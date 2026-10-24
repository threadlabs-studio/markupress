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
    let appearance = 'automatic';
    try { const saved = window.localStorage.getItem('markupress:theme'); if (saved === 'light' || saved === 'dark') appearance = saved; } catch { /* System mode works without storage. */ }
    const apply = () => {
      host.state.appearance = appearance;
      document.documentElement.dataset.theme = appearance === 'automatic' ? (system.matches ? 'dark' : 'light') : appearance;
    };
    system.addEventListener('change', apply);
    apply();
    const ready = window.requestAnimationFrame(() => { host.state.appearanceReady = true; });
    // The header can grow with typography, wrapping, or a customized control scale.
    const header = host.root.querySelector<HTMLElement>('[data-component="markupress-header"]');
    const measureHeader = () => { if (header) (host.root as HTMLElement).style.setProperty('--_markupress-header-height', `${header.getBoundingClientRect().height}px`); };
    const observer = new window.ResizeObserver(measureHeader);
    if (header) observer.observe(header);
    measureHeader();
    const click = (event: Event) => {
      const target = event.target;
      if (!(target instanceof window.Element)) return;
      const choice = target.closest<HTMLElement>('[data-action="theme"]')?.dataset.themeChoice;
      if (choice === 'automatic' || choice === 'light' || choice === 'dark') {
        appearance = choice;
        apply();
        try { if (choice === 'automatic') window.localStorage.removeItem('markupress:theme'); else window.localStorage.setItem('markupress:theme', choice); } catch { /* Theme still applies for this page. */ }
      }
      if (target.closest('a[href]')) host.root.querySelector<HTMLElement>('#documentation-navigation:popover-open')?.hidePopover();
    };
    // The page sits inside the shell, so this sees every click.
    host.root.addEventListener('click', click);
    return () => { host.root.removeEventListener('click', click); system.removeEventListener('change', apply); observer.disconnect(); window.cancelAnimationFrame(ready); };
  });
}
