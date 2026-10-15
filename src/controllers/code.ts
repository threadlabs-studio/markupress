/// <reference lib="dom" />
import type { ComponentHost } from '@nextwebwg/html-next/runtime';

/**
 * A Markdown page's code block buttons. One delegated listener serves every block; native buttons give
 * keyboard access, and the clipboard API copies the code's text, which excludes CSS line numbers.
 */
export default function code(host: ComponentHost): void {
  host.on('connect', () => {
    const root = host.root;
    const window = root.ownerDocument.defaultView!;
    for (const actions of root.querySelectorAll<HTMLElement>('.code-actions')) actions.hidden = false;
    const click = (event: Event) => {
      const button = event.target instanceof window.Element ? event.target.closest<HTMLButtonElement>('button[data-code-action]') : null;
      const pre = button?.closest('figure.code')?.querySelector('pre');
      if (!button || !pre || !root.contains(button)) return;
      if (button.dataset.codeAction === 'wrap') {
        const wrap = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(wrap));
        pre.classList.toggle('wrap', wrap);
        return;
      }
      void window.navigator.clipboard.writeText(pre.textContent ?? '').then(() => 'Copied', () => 'Copy failed').then(label => {
        button.textContent = label;
        window.setTimeout(() => { button.textContent = 'Copy'; }, 2000);
      });
    };
    root.addEventListener('click', click);
    return () => root.removeEventListener('click', click);
  });
}
