/// <reference lib="dom" />
import type { ComponentHost } from '@nextwebwg/html-next/runtime';

/**
 * Marks the outline link of the heading being read with aria-current="location". An IntersectionObserver
 * watches the page's headings: the current one is the last heading that has reached the top fifth of the
 * viewport, and none is current above the first. The outline is plain fragment links, so without JavaScript only this marking is missing.
 */
export default function outline(host: ComponentHost): void {
  host.on('connect', () => {
    const document = host.root.ownerDocument;
    const window = document.defaultView!;
    let observer: IntersectionObserver | undefined;
    const observe = () => {
      observer?.disconnect();
      const links = [...host.root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
      const headings = links.map(link => document.getElementById(decodeURIComponent(link.hash.slice(1)))).filter(heading => heading !== null);
      const reached = new Set<Element>();
      const mark = () => {
        const current = headings.filter(heading => reached.has(heading)).at(-1);
        for (const link of links) {
          if (link.hash.slice(1) === current?.id) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        }
      };
      observer = new window.IntersectionObserver(entries => {
        for (const entry of entries) {
          // In the band, or gone out through its top edge; a heading below the band is not reached yet.
          if (entry.isIntersecting || entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0)) reached.add(entry.target);
          else reached.delete(entry.target);
        }
        mark();
      }, { rootMargin: '0px 0px -80% 0px' });
      for (const heading of headings) observer.observe(heading);
    };
    observe();
    // MarkupKit swaps pages in place through the Navigation API; the outline then lists the new page's headings.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    navigation?.addEventListener('navigatesuccess', observe);
    return () => { observer?.disconnect(); navigation?.removeEventListener('navigatesuccess', observe); };
  });
}
