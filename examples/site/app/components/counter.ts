import type { ComponentHost } from '@nextwebwg/html-next/runtime';
export default function counter(host: ComponentHost): void {
  host.on('connect', () => {
    const button = host.root.querySelector('button')!;
    const click = () => { host.state.count = Number(host.state.count) + 1; };
    button.addEventListener('click', click);
    return () => button.removeEventListener('click', click);
  });
}
