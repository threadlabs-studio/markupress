import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { ApplicationServer } from '@nextwebwg/htmlkit';

const root = fileURLToPath(new URL('..', import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), 'markupress-consumer-'));
const cli = join(workspace, 'node_modules/markupress/dist/cli.js');
const write = (file: string, text: string) => writeFileSync(join(workspace, file), text);
const shell = process.platform === 'win32';
const run = (command: string, args: string[]) => execFileSync(command, args, { cwd: workspace, encoding: 'utf8', shell, timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });

beforeAll(() => {
  const packed = execFileSync('corepack', ['pnpm', 'pack', '--pack-destination', workspace], { cwd: root, encoding: 'utf8', shell }).trim().split('\n').at(-1)!;
  const tarball = isAbsolute(packed) ? packed : join(workspace, packed);
  write('package.json', '{"name":"markupress-consumer","private":true,"type":"module"}');
  const platform = JSON.parse(process.env.MARKUPRESS_PLATFORM_TARBALLS ?? '[]') as string[];
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball, ...platform]);
  mkdirSync(join(workspace, 'docs/01-guide'), { recursive: true }); mkdirSync(join(workspace, 'components')); mkdirSync(join(workspace, 'public'));
  write('markupress.config.json', '{"title":"Example docs","base":"/manual/"}');
  write('public/mark.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="teal"/></svg>');
  write('docs/01-index.md', '# Welcome\n\n[Installation](01-guide/02-install.md#install)\n\n![Mark](/mark.svg)');
  write('docs/01-guide/02-install.md', `---\ntitle: Installation\nid: install\naliases: [/getting-started/]\n---\n# Install\n\n<link rel="component" href="../../components/counter.html">\n\n<demo-counter></demo-counter>\n\n<template component="inline-example"><p>Inline component</p><style>@import "../../components/counter.css"; :host { border-color: teal; }</style></template>\n\n<inline-example></inline-example>\n\n## Install\n\n\`\`\`html\n<template component="fake-page"><p>{count}</p></template>\n<link rel="component" href="missing.html">\n\`\`\`\n\n\`\`\`less\n@color: #123;\n.box { color: @color; }\n\`\`\`\n\n\`\`\`css\n.box { color: red; }\n\`\`\`\n\n\`\`\`js\nconst count = 1;\n\`\`\`\n\n\`\`\`ts\nconst count: number = 1;\n\`\`\`\n`);
  write('components/counter.html', '<template component="demo-counter" controller="./counter.js"><defs><state name="count" type="number" value="0"></state></defs><div><button aria-label="Increment example">Increment</button><output $value="count"></output></div><style>@import "./counter.css";</style></template>');
  write('components/counter.css', 'button { border: 2px solid rgb(20, 30, 40); }');
  write('components/counter.ts', 'import type { ComponentHost } from "@nextwebwg/html-next/runtime"; import { increment } from "./value.js"; export default function(host: ComponentHost) { host.on("connect", () => { const button = host.root.querySelector("button")!; const click = () => { host.state.count = Number(host.state.count) + increment; }; button.addEventListener("click", click); return () => button.removeEventListener("click", click); }); }');
  write('components/value.ts', 'export const increment = 1;');
  run(process.execPath, [cli, 'snapshot', 'v1']);
  write('components/value.ts', 'export const increment = 2;');
  write('docs/01-guide/03-new.md', '# New document');
  run(process.execPath, [cli, 'build']);
}, 150_000);
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

it('builds an installed Markdown site with frozen resource imports, owned metadata and literal migration examples', () => {
  const html = readFileSync(join(workspace, 'site/v/current/guide/install/index.html'), 'utf8');
  expect(html).toContain('<title>Installation</title>'); expect(html).toContain('id="install-1"');
  expect(html).toContain('href="/manual/v/current/guide/install/" aria-current="page"');
  expect(html).toContain('&lt;template'); expect(html).not.toContain('data-component="fake-page"');
  for (const lang of ['html', 'less', 'css', 'js', 'ts']) expect(html).toContain(`language-${lang}`);
  expect(html).not.toContain('controller="');
  expect(readFileSync(join(workspace, 'site/v/current/getting-started/index.html'), 'utf8')).toContain('<title>Installation</title>');
  expect(run(process.execPath, ['--input-type=module', '--eval', "import('markupress').then(() => process.stdout.write('ok'))"])).toBe('ok');
});

it('accepts maintained TypeScript controllers and rejects an invalid lifecycle callback', () => {
  const compiler = join(root, 'node_modules/typescript/bin/tsc');
  const args = ['--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2023', '--module', 'NodeNext', '--lib', 'ES2023,DOM', 'components/counter.ts'];
  run(process.execPath, [compiler, ...args]);
  write('components/invalid.ts', 'import type { ComponentHost } from "@nextwebwg/html-next/runtime"; export default function(host: ComponentHost) { host.on("connect", "invalid"); }');
  expect(() => run(process.execPath, [compiler, ...args.slice(0, -1), 'components/invalid.ts'])).toThrow();
});

it.skipIf(process.env.MARKUPRESS_BROWSER_TEST !== '1')('runs installed dev and production controllers, keyboard navigation, themes and version fallbacks', async () => {
  const product = await import(pathToFileURL(join(workspace, 'node_modules/markupress/dist/index.js')).href) as typeof import('../src/index.js');
  const browser = await chromium.launch({ headless: true });
  let server: ApplicationServer | undefined;
  try {
    for (const mode of ['preview', 'dev'] as const) {
      server = await product[mode === 'preview' ? 'previewSite' : 'devSite']({ root: workspace, base: '/manual/', port: 0 });
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
      await context.addInitScript(() => {
        const record = () => {
          const button = document.querySelector('[data-action="theme"]');
          if (button && document.documentElement.dataset.theme === 'dark') (window as unknown as { firstDarkColor?: string }).firstDarkColor ??= getComputedStyle(button).color;
          else requestAnimationFrame(record);
        };
        requestAnimationFrame(record);
      });
      const page = await context.newPage(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(server.url + 'v/current/guide/install/');
      expect(await page.locator('[data-component="markupress-shell"]').evaluate(element => getComputedStyle(element).fontFamily)).toContain('system-ui');
      expect(await page.locator('[data-component="markupress-shell"]').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
      await page.getByRole('button', { name: 'Increment example' }).click();
      await expect.poll(() => page.locator('output').textContent()).toBe('2');
      await page.getByRole('button', { name: 'Dark theme' }).click();
      await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark');
      await expect.poll(() => page.getByRole('button', { name: 'Dark theme' }).getAttribute('aria-pressed')).toBe('true');
      await page.reload(); await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark');
      await expect.poll(() => page.getByRole('button', { name: 'Dark theme' }).getAttribute('aria-pressed')).toBe('true');
      // A saved theme applies after first paint; its first dark frame must not fade out of the default theme.
      const settledDark = await page.getByRole('button', { name: 'Dark theme' }).evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); return getComputedStyle(element).color; });
      expect(await page.evaluate(() => (window as unknown as { firstDarkColor?: string }).firstDarkColor)).toBe(settledDark);
      const versions = page.getByRole('navigation', { name: 'Documentation versions' });
      await expect.poll(() => versions.getByRole('link', { name: 'v1', exact: true }).getAttribute('href')).toBe('/manual/v/v1/guide/install/');
      await versions.getByRole('link', { name: 'v1', exact: true }).focus();
      expect(await versions.getByRole('link', { name: 'v1', exact: true }).evaluate(element => element === element.ownerDocument.activeElement)).toBe(true);
      await Promise.all([page.waitForURL(server.url + 'v/v1/guide/install/'), page.keyboard.press('Enter')]);
      await page.getByRole('button', { name: 'Increment example' }).click();
      await expect.poll(() => page.locator('output').textContent()).toBe('1');
      await page.reload(); expect(page.url()).toContain('/manual/v/v1/guide/install/');
      await page.goto(server.url + 'v/current/guide/new/');
      expect(await versions.getByText(/unavailable in v1/).textContent()).toContain('documentation home');
      await versions.getByRole('link', { name: 'v1', exact: true }).click(); await expect.poll(() => page.url()).toBe(server!.url + 'v/v1/');
      expect(await page.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(40);
      await page.getByRole('link', { name: 'Skip to content' }).focus(); await page.keyboard.press('Enter');
      expect(await page.locator('main').evaluate(element => element === element.ownerDocument.activeElement)).toBe(true);
      const audit = await new AxeBuilder({ page }).analyze(); expect(audit.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target).join(', ')}`)).toEqual([]);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Navigation', exact: true }).click();
      await expect.poll(() => page.getByRole('navigation', { name: 'Documentation', exact: true }).count()).toBe(0);
      await expect.poll(() => page.getByRole('button', { name: 'Navigation', exact: true }).getAttribute('aria-expanded')).toBe('false');
      await page.getByRole('button', { name: 'Navigation', exact: true }).click();
      await expect.poll(() => page.getByRole('navigation', { name: 'Documentation', exact: true }).count()).toBe(1);
      await expect.poll(() => page.getByRole('button', { name: 'Navigation', exact: true }).getAttribute('aria-expanded')).toBe('true');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (process.env.MARKUPRESS_SCREENSHOTS) await page.screenshot({ path: join(process.env.MARKUPRESS_SCREENSHOTS, `markupress-${mode}-mobile.png`), fullPage: true });
      expect(errors).toEqual([]); await context.close(); await server.close(); server = undefined;
    }
  } finally { await server?.close(); await browser.close(); }
}, 90_000);
