import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { ApplicationServer } from '@nextwebwg/htmlkit';

async function chooseAppearance(page: Page, choice: 'automatic' | 'light' | 'dark') {
  const button = page.getByRole('button', { name: /^Appearance:/ });
  const desired = `Appearance: ${choice.charAt(0).toUpperCase()}${choice.slice(1)}`;
  for (let step = 0; step < 3; step++) {
    const before = await button.getAttribute('aria-label');
    if (before === desired) return;
    await button.click();
    await expect.poll(() => button.getAttribute('aria-label')).not.toBe(before);
  }
  expect(await button.getAttribute('aria-label')).toBe(desired);
}

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
  mkdirSync(join(workspace, 'docs/01.guide'), { recursive: true }); mkdirSync(join(workspace, 'components')); mkdirSync(join(workspace, 'public'));
  // Conventions supply the logo (public/logo.svg) and footer (docs/_footer.md); config adds only extra links.
  // A typed config, which the installed package's defineConfig types.
  write('markupress.config.ts', `import { defineConfig } from 'markupress';\n\nexport default defineConfig(${JSON.stringify({ title: 'Example docs with a deliberately long product title', headerNotice: 'Custom theme', base: '/manual/', nav: [{ label: 'Outline', href: '/guide/outline/' }], editLink: 'https://example.com/edit/' })});\n`);
  // The site's own page-wide stylesheet sets a Markupress theme token.
  mkdirSync(join(workspace, 'app'));
  write('app/site.css', ':root { --markupress-sidebar-width: 17rem; }');
  write('htmlkit.config.js', 'export default { css: ["app/site.css"] };');
  write('public/mark.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="teal"/></svg>');
  write('public/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle r="20" cx="20" cy="20" fill="teal"/></svg>');
  write('docs/_footer.md', '## Docs\n\n- [Home](/)\n\nCopyright Example.\n');
  write('docs/01.index.md', '# Welcome\n\n[Installation](01.guide/02.install.md#install)\n\n![Mark](/mark.svg)');
  write('docs/01.guide/02.install.md', `---\ntitle: Installation\nid: install\naliases: [/getting-started/]\n---\n# Install\n\n<link rel="component" href="@/components/counter.html">\n\n<demo-counter></demo-counter>\n\n## Install\n\n\`\`\`html\n<template component="fake-page"><p>{count}</p></template>\n<link rel="component" href="missing.html">\n\`\`\`\n\n\`\`\`less\n@color: #123;\n.box { color: @color; }\n\`\`\`\n\n\`\`\`css\n.box { color: red; }\n\`\`\`\n\n\`\`\`js\nconst count = 1;\n\`\`\`\n\n\`\`\`ts\nconst count: number = 1;\n\`\`\`\n`);
  write('components/counter.html', '<template component="demo-counter" controller="./counter.js"><defs><state name="count" type="number" value="0"></state></defs><div><button aria-label="Increment example">Increment</button><output>{$count}</output></div><style>@import "./counter.css";</style></template>');
  write('components/counter.css', 'button { border: 2px solid rgb(20, 30, 40); }');
  write('components/counter.ts', 'import type { ComponentHost } from "@nextwebwg/html-next/runtime"; import { increment } from "./value.js"; export default function(host: ComponentHost) { host.on("connect", () => { const button = host.root.querySelector("button")!; const click = () => { host.state.count = Number(host.state.count) + increment; }; button.addEventListener("click", click); return () => button.removeEventListener("click", click); }); }');
  write('components/value.ts', 'export const increment = 1;');
  // The nav option's Outline link is a page of every version, v1 included, so the build's link check passes.
  write('docs/01.guide/05.outline.md', '# Outline\n\n' + ['First', 'Second', 'Third'].map(name => `## ${name}\n\n${'Paragraph text that fills the screen. '.repeat(80)}\n\n`).join(''));
  run(process.execPath, [cli, 'snapshot', 'v1']);
  write('components/value.ts', 'export const increment = 2;');
  // A stylesheet link in Markdown becomes an @import in the page's own <style>.
  write('components/page.css', 'h1 { letter-spacing: 2px; }');
  write('docs/01.guide/03.new.md', '<link rel="stylesheet" href="@/components/page.css">\n\n# New document');
  // The current version's home is a home page; v1 keeps the plain one.
  write('docs/01.index.md', '---\nlayout: home\n---\n# Welcome\n\nExample documentation.\n\n![Mark](/mark.svg)\n\n[Installation](01.guide/02.install.md#install) [Reference](02.reference/index.md)\n\n' +
    '## Components\n\nNative components in Markdown.\n\n## Versions\n\nEvery snapshot stays readable.\n');
  write('docs/03.about.md', '# About');
  mkdirSync(join(workspace, 'docs/workspace'));
  write('docs/workspace/index.md', '---\nsidebar: false\n---\n# Workspace');
  write('docs/workspace/edit.md', '# Edit workspace');
  mkdirSync(join(workspace, 'docs/02.reference'));
  write('docs/02.reference/index.md', '---\ntitle: Reference\ndescription: Every option.\n---\n');
  write('docs/02.reference/01.options.md', '---\ndescription: Configure the site.\n---\n# Options');
  write('docs/404.md', '# Nothing here\n\n[Home](01.index.md)');
  write('docs/01.guide/04.blocks.md', '# Blocks\n\n::toc{depth=2}\n\n```ts {1} :line-numbers title="example.ts"\nconst first = 1;\nconst second = {braces}; // [!code highlight]\nconst third = "a long line that wraps when the reader turns wrapping on, so it never needs a horizontal scroll bar";\n```\n\n::: warning Breaking {x}\nBack up first.\n:::\n\n> [!CAUTION]\n> Alerts too.\n\n::: details More\nHidden text\n:::\n\n' +
    '::: code-group\n```sh title="pnpm"\npnpm add markupress\n```\n\n```sh title="npm"\nnpm install markupress\n```\n:::\n\n::: code-group\n```sh title="pnpm"\npnpm markupress build\n```\n\n```sh title="npm"\nnpx markupress build\n```\n:::\n\n' +
    '## Über uns\n\nStatus :chip[Ready]{tone=green}, by @[Ada]#u1, with a note[^1].\n\n- [x] Read the changelog\n- [ ] Run the migration\n\n::: figure The *mark*\n![Mark](/mark.svg){width=40 placement=center}\n:::\n\n[^1]: The footnote.\n');
  run(process.execPath, [cli, 'build']);
}, 150_000);
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

it('builds an installed Markdown site with frozen resource imports, owned metadata and literal migration examples', () => {
  const html = readFileSync(join(workspace, 'site/v/current/guide/install/index.html'), 'utf8');
  expect(html).toContain('<title data-component-head="">Installation | Example docs with a deliberately long product title</title>'); expect(html).toContain('id="install-1"');
  // HTMLKit's generated policy comes before any script, and allows the theme script by its hash.
  expect(html).toMatch(/<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src 'self' 'sha256-[^']+'; object-src 'none'; base-uri 'none'"><script>/);
  expect(html).toContain('href="/manual/v/current/guide/install/" aria-current="page"');
  expect(html.replace(/<[^>]*>/g, '')).toContain('&lt;template component="fake-page"&gt;&lt;p&gt;{count}'); expect(html).not.toContain('data-component="fake-page"');
  for (const lang of ['html', 'less', 'css', 'js', 'ts']) expect(html).toContain(`language-${lang}`);
  expect(html).toContain('<pre class="shiki shiki-themes github-light-default github-dark-default"');
  // Whitespace inside <pre> survives rendering, so each highlighted line stays on its own line.
  expect(html).toMatch(/<\/span><\/span>\n<span class="line">/);
  expect(html).not.toContain('controller="');
  // The editLink option links each page to its file; outside a git checkout no page has a date.
  expect(html).toContain('<a href="https://example.com/edit/docs/01.guide/02.install.md">Edit this page</a>');
  expect(html).not.toContain('Last updated');
  expect(readFileSync(join(workspace, 'site/v/current/getting-started/index.html'), 'utf8')).toContain('<title data-component-head="">Installation | Example docs with a deliberately long product title</title>');
  // An index page with an empty body lists its folder's pages with their descriptions.
  expect(readFileSync(join(workspace, 'site/v/current/reference/index.html'), 'utf8').replace(/<!--[^>]*-->| data-[\w-]+="[^"]*"/g, ''))
    .toContain('<ul class="contents"><li><a href="/manual/v/current/reference/options/">Options</a><p>Configure the site.</p></li></ul>');
  expect(run(process.execPath, ['--input-type=module', '--eval', "import('markupress').then(() => process.stdout.write('ok'))"])).toBe('ok');
});

it('creates a starter site from the packed create-markupress, at the shared version, that builds with the installed package', () => {
  const created = mkdtempSync(join(tmpdir(), 'markupress-create-'));
  try {
    const own = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string; peerDependencies: Record<string, string>; devDependencies: Record<string, string> };
    const creator = join(root, 'packages/create-markupress');
    expect((JSON.parse(readFileSync(join(creator, 'package.json'), 'utf8')) as { version: string }).version).toBe(own.version);
    const packed = execFileSync('npm', ['pack', '--pack-destination', created], { cwd: creator, encoding: 'utf8', shell }).trim().split('\n').at(-1)!;
    execFileSync('tar', ['-xzf', join(created, packed), '-C', created], { shell });
    const create = (folder: string) => execFileSync(process.execPath, [join(created, 'package/index.js'), folder], { cwd: created, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    expect(create('my-docs')).toContain('npm run dev');
    const site = join(created, 'my-docs');
    const starter = JSON.parse(readFileSync(join(site, 'package.json'), 'utf8')) as { name: string; dependencies: Record<string, string> };
    // The starter pins the same concrete HTML Next and Looma releases qualified by this package.
    expect(starter.name).toBe('my-docs');
    expect(starter.dependencies).toEqual({ '@nextwebwg/html-next': own.devDependencies['@nextwebwg/html-next'], '@threadlabs/looma': own.devDependencies['@threadlabs/looma'], markupress: `^${own.version}` });
    expect(readFileSync(join(site, '.gitignore'), 'utf8')).toContain('node_modules/');
    // A folder with files is refused.
    expect(() => create('my-docs')).toThrow(/already has files/);
    symlinkSync(join(workspace, 'node_modules'), join(site, 'node_modules'), shell ? 'junction' : 'dir');
    execFileSync(process.execPath, [cli, 'build'], { cwd: site, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });
    expect(readFileSync(join(site, 'site/index.html'), 'utf8')).toContain('My project');
    expect(readFileSync(join(site, 'site/guide/getting-started/index.html'), 'utf8')).toContain('Getting started');
    expect(readFileSync(join(site, 'site/guide/writing/index.html'), 'utf8')).toContain('data-component="demo-counter"');
  } finally { rmSync(created, { recursive: true, force: true }); }
}, 150_000);

it('accepts maintained TypeScript controllers and rejects an invalid lifecycle callback', () => {
  const compiler = join(root, 'node_modules/typescript/bin/tsc');
  const args = ['--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2023', '--module', 'NodeNext', '--lib', 'ES2023,DOM', 'components/counter.ts'];
  run(process.execPath, [compiler, ...args]);
  run(process.execPath, [compiler, ...args.slice(0, -1), 'markupress.config.ts']);
  write('components/invalid.ts', 'import type { ComponentHost } from "@nextwebwg/html-next/runtime"; export default function(host: ComponentHost) { host.on("connect", "invalid"); }');
  expect(() => run(process.execPath, [compiler, ...args.slice(0, -1), 'components/invalid.ts'])).toThrow();
});

it.skipIf(process.env.MARKUPRESS_BROWSER_TEST !== '1')('runs installed dev and production controllers, keyboard navigation, themes and version fallbacks', async () => {
  const product = await import(pathToFileURL(join(workspace, 'node_modules/markupress/dist/index.js')).href) as typeof import('../src/index.js');
  const browser = await chromium.launch({ headless: true });
  let server: ApplicationServer | undefined;
  try {
    for (const mode of ['preview', 'dev'] as const) {
      server = await product[mode === 'preview' ? 'previewSite' : 'devSite']({ ...await product.loadConfig(workspace), root: workspace, port: 0 });
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      // Every Content Security Policy violation fails the proof.
      const violations: string[] = [];
      await context.exposeFunction('reportViolation', (violation: string) => violations.push(violation));
      // Records the theme in the first frame that shows the theme button, any transition the button runs while loading,
      // and the pending bar each time a page renders in place.
      await context.addInitScript(() => {
        const load = { theme: undefined as string | undefined, transitions: [] as string[], pending: [] as string[] };
        Object.assign(window, { load });
        document.addEventListener('securitypolicyviolation', event => (window as unknown as { reportViolation(text: string): void })
          .reportViolation(`${location.pathname}: ${event.violatedDirective} ${event.blockedURI || 'inline'} ${event.sample}`));
        new MutationObserver(() => { if (document.documentElement.hasAttribute('data-hk-navigating')) load.pending.push(getComputedStyle(document.body, '::before').blockSize); })
          .observe(document, { subtree: true, attributeFilter: ['data-hk-navigating'] });
        const record = () => {
          if (document.querySelector('[data-action="theme"]')) load.theme = document.documentElement.dataset.theme;
          else requestAnimationFrame(record);
        };
        requestAnimationFrame(record);
        document.addEventListener('transitionrun', event => { if (event.target instanceof Element && event.target.closest('[data-action="theme"]')) load.transitions.push(event.propertyName); }, true);
      });
      const page = await context.newPage(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      const logged: string[] = []; page.on('console', message => { if (['error', 'warning'].includes(message.type())) logged.push(`${message.type()}: ${message.text()}`); });
      await page.goto(server.url + 'v/current/guide/install/');
      expect(await page.locator('[data-component="markupress-shell"]').evaluate(element => getComputedStyle(element).fontFamily)).toContain('system-ui');
      // On a wide screen the sidebar is in the page, and the shell's style hides the drawer's Navigation button it projects into the header.
      expect(await page.getByRole('button', { name: 'Navigation', exact: true }).isVisible()).toBe(false);
      // The site's stylesheet sizes the sidebar through --markupress-sidebar-width.
      expect(await page.locator('#documentation-navigation').evaluate(element => element.getBoundingClientRect().width)).toBe(272);
      // Looma's tokens and theme are page-wide, so they reach :root, the shell, and the page component's prose styles.
      const surfaces = () => page.evaluate(() => ({ scheme: getComputedStyle(document.documentElement).colorScheme,
        shell: getComputedStyle(document.querySelector('[data-component="markupress-shell"]')!).backgroundColor,
        code: getComputedStyle(document.querySelector('.markupress-prose pre')!).backgroundColor }));
      expect(await surfaces()).toEqual({ scheme: 'light', shell: 'rgb(250, 251, 249)', code: 'rgb(239, 243, 238)' });
      await expect.poll(() => page.getByRole('button', { name: /^Appearance:/ }).getAttribute('aria-label')).toBe('Appearance: Automatic');
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark');
      await page.emulateMedia({ colorScheme: 'light' });
      await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('light');
      // Navigation uses Looma rows; HTMLKit supplies the breadcrumbs and pager.
      expect(await page.locator('#documentation-navigation [data-component~="markupress-nav-items"]').first().evaluate(element => getComputedStyle(element).listStyleType)).toBe('none');
      expect(await page.locator('[data-component="hk-breadcrumbs"] a').allTextContents()).toEqual(['Welcome', 'Installation']);
      expect(await page.locator('[data-component="hk-breadcrumbs"] ol').evaluate(element => getComputedStyle(element).display)).toBe('flex');
      expect(await page.locator('[data-component="hk-pager"] a[rel="prev"]').getAttribute('href')).toBe('/manual/v/current/');
      await page.getByRole('button', { name: 'Increment example' }).click();
      await expect.poll(() => page.locator('output').textContent()).toBe('2');
      // Navigation has a full selectable row, with the same public theme roles as controls.
      const selectedNavigation = page.locator('#documentation-navigation [data-component~="ui-nav-item"][aria-current="page"]');
      expect(await selectedNavigation.evaluate(element => getComputedStyle(element).textDecorationLine)).toBe('none');
      expect(await selectedNavigation.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(32);
      const scopes = await page.evaluate(() => {
        const outer = document.createElement('section'); outer.dataset.theme = 'dark';
        const inner = document.createElement('section'); inner.dataset.theme = 'light';
        const nested = document.createElement('section'); nested.dataset.theme = 'dark';
        for (const node of [outer, inner, nested]) node.style.cssText = 'background:var(--ui-surface);color:var(--ui-text)';
        outer.append(inner); inner.append(nested); document.body.append(outer);
        const read = (node: Element) => { const style = getComputedStyle(node); return { background: style.backgroundColor, color: style.color, scheme: style.colorScheme }; };
        const result = [outer, inner, nested].map(read); outer.remove(); return result;
      });
      expect(scopes).toEqual([
        { background: 'rgb(25, 34, 31)', color: 'rgb(237, 244, 237)', scheme: 'dark' },
        { background: 'rgb(250, 251, 249)', color: 'rgb(36, 52, 44)', scheme: 'light' },
        { background: 'rgb(25, 34, 31)', color: 'rgb(237, 244, 237)', scheme: 'dark' },
      ]);
      // Highlighted code follows the theme's color-scheme through light-dark().
      const token = page.locator('pre.shiki span[style]').first(); const color = () => token.evaluate(element => getComputedStyle(element).color);
      const light = await color();
      await chooseAppearance(page, 'dark');
      await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark');
      await expect.poll(surfaces).toEqual({ scheme: 'dark', shell: 'rgb(25, 34, 31)', code: 'rgb(19, 28, 24)' });
      await expect.poll(color).not.toBe(light);
      await expect.poll(() => page.getByRole('button', { name: /^Appearance:/ }).getAttribute('aria-label')).toBe('Appearance: Dark');
      await page.reload(); await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark');
      await expect.poll(() => page.getByRole('button', { name: /^Appearance:/ }).getAttribute('aria-label')).toBe('Appearance: Dark');
      // A saved theme is applied before first paint, so nothing fades out of the default theme.
      expect(await page.evaluate(() => (window as unknown as { load: object }).load)).toEqual({ theme: 'dark', transitions: [], pending: [] });
      // An explicit choice ignores the system, while Automatic clears that choice and follows it again.
      await page.emulateMedia({ colorScheme: 'light' });
      await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark');
      await chooseAppearance(page, 'automatic');
      await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('light');
      expect(await page.evaluate(() => localStorage.getItem('markupress:theme'))).toBeNull();
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark');
      await page.reload();
      await expect.poll(() => page.getByRole('button', { name: /^Appearance:/ }).getAttribute('aria-label')).toBe('Appearance: Automatic');
      await chooseAppearance(page, 'dark');
      const versions = page.getByRole('navigation', { name: 'Documentation versions' });
      await expect.poll(() => versions.getByRole('link', { name: 'v1', exact: true }).getAttribute('href')).toBe('/manual/v/v1/guide/install/');
      await versions.getByRole('link', { name: 'v1', exact: true }).focus();
      expect(await versions.getByRole('link', { name: 'v1', exact: true }).evaluate(element => element === element.ownerDocument.activeElement)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      logged.length = 0;
      await Promise.all([page.waitForURL(server.url + 'v/v1/guide/install/'), page.keyboard.press('Enter')]);
      // HTMLKit commits the URL before the page arrives. v1's counter has its own controller, which this
      // document cannot also define, so HTMLKit loads v1 as a document, at its top, without logging; wait for it before clicking.
      await expect.poll(() => versions.getByRole('link', { name: 'v1', exact: true }).getAttribute('aria-current'), { timeout: 30_000 }).toBe('page');
      await page.waitForLoadState();
      expect(logged).toEqual([]); expect(await page.evaluate(() => window.scrollY)).toBe(0);
      // The document load takes the place of the committed entry, so back returns to the current version's page once,
      // and forward shows v1's page again under its URL, as soon as each document starts.
      await page.goBack(); await expect.poll(() => page.url()).toBe(server.url + 'v/current/guide/install/');
      await expect.poll(() => versions.getByRole('link', { name: 'Current', exact: true }).getAttribute('aria-current'), { timeout: 30_000 }).toBe('page');
      await page.goForward(); await expect.poll(() => page.url()).toBe(server.url + 'v/v1/guide/install/');
      await expect.poll(() => versions.getByRole('link', { name: 'v1', exact: true }).getAttribute('aria-current'), { timeout: 30_000 }).toBe('page');
      await page.waitForLoadState(); expect(page.url()).toBe(server.url + 'v/v1/guide/install/'); expect(logged).toEqual([]);
      await page.getByRole('button', { name: 'Increment example' }).click();
      await expect.poll(() => page.locator('output').textContent()).toBe('1');
      await page.reload(); expect(page.url()).toContain('/manual/v/v1/guide/install/');
      // Shared blocks hydrate after client navigation: Looma's callout and tabs, and native details.
      await page.goto(server.url + 'v/current/guide/new/');
      // The page's imported stylesheet styles its own heading.
      expect(await page.locator('main h1').evaluate(element => getComputedStyle(element).letterSpacing)).toBe('2px');
      await page.locator('[data-component="hk-pager"] a[rel="next"]').click();
      await expect.poll(() => page.locator('h1').textContent(), { timeout: 30_000 }).toBe('Blocks');
      // The page rendered in place, and the theme drew its pending bar while it did.
      expect(await page.evaluate(() => (window as unknown as { load: { pending: string[] } }).load.pending)).toContain('3px');
      // Code blocks: build-time highlighted lines and numbers, and keyboard-operable copy and wrap buttons.
      const example = page.locator('figure.code').filter({ hasText: 'example.ts' });
      expect(await example.locator('.line.highlighted').allTextContents()).toEqual(['const first = 1;', 'const second = {braces};']);
      expect(await example.locator('.line.highlighted').first().evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
      expect(await example.locator('.line').first().evaluate(element => getComputedStyle(element, '::before').content)).toBe('counter(line)');
      await example.getByRole('button', { name: 'Copy' }).focus(); await page.keyboard.press('Enter');
      await expect.poll(() => example.getByRole('button', { name: 'Copied' }).count()).toBe(1);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('const first = 1;\nconst second = {braces};\nconst third = "a long line that wraps when the reader turns wrapping on, so it never needs a horizontal scroll bar";');
      const scrolls = () => example.locator('pre').evaluate(element => element.scrollWidth > element.clientWidth);
      expect(await scrolls()).toBe(true);
      await example.getByRole('button', { name: 'Wrap' }).focus(); await page.keyboard.press(' ');
      await expect.poll(() => example.getByRole('button', { name: 'Wrap' }).getAttribute('aria-pressed')).toBe('true');
      expect(await scrolls()).toBe(false);
      const callout = page.getByRole('note').filter({ hasText: 'Breaking {x}' });
      expect(await callout.getAttribute('data-ui-callout-prop-tone')).toBe('warning');
      const surface = (tone: string) => page.locator(`[data-component="ui-callout"][data-ui-callout-prop-tone="${tone}"]`).evaluate(element => getComputedStyle(element).backgroundColor);
      expect(await surface('warning')).not.toBe(await surface('danger'));
      expect(await surface('warning')).not.toBe('rgba(0, 0, 0, 0)');
      const details = page.locator('main details');
      await page.locator('main summary').focus(); await page.keyboard.press('Enter');
      await expect.poll(() => details.evaluate(element => (element as HTMLDetailsElement).open)).toBe(true);
      const groups = page.locator('[data-component="ui-tabs"]');
      const selected = (group: number, name: string) => groups.nth(group).getByRole('tab', { name, exact: true }).getAttribute('aria-selected');
      await expect.poll(() => groups.nth(1).getByRole('tab').count()).toBe(2);
      expect(await groups.nth(1).getByRole('tabpanel').textContent()).toContain('pnpm markupress build');
      // The theme's global block styles reach the Markdown projected into Looma's components.
      expect(await groups.nth(1).locator('pre').first().evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(19, 28, 24)');
      await groups.first().getByRole('tab', { name: 'npm', exact: true }).click();
      await expect.poll(() => selected(1, 'npm')).toBe('true');
      expect(await groups.nth(1).getByRole('tabpanel').textContent()).toContain('npx markupress build');
      await groups.nth(1).getByRole('tab', { name: 'npm', exact: true }).focus(); await page.keyboard.press('ArrowLeft');
      await expect.poll(() => selected(0, 'pnpm')).toBe('true');
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => selected(0, 'npm')).toBe('true');
      // The group's choice survives a reload.
      await page.reload();
      await expect.poll(() => selected(1, 'npm')).toBe('true');
      expect(await groups.first().getByRole('tabpanel').textContent()).toContain('npm install markupress');
      // Looma Markdown's newer forms: ::toc links reach their headings, a chip takes its hue, and task items are checkboxes.
      expect(await page.locator('main nav[data-looma-toc] a').evaluateAll(links => links.map(link =>
        (link.getRootNode() as Document).getElementById(decodeURIComponent((link as HTMLAnchorElement).hash.slice(1)))?.textContent))).toEqual(['Blocks', 'Über uns']);
      expect(await page.locator('main [data-looma-chip][data-color="green"]').evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
      expect(await page.locator('main ul[data-type="taskList"] input[type="checkbox"]').count()).toBe(2);
      // A footnote reference links to its note, whose section heading is only for assistive technology.
      expect(await page.locator('main .footnotes h2').evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
      await page.locator('main [data-footnote-ref]').click();
      await expect.poll(() => page.url()).toContain('#fn:1');
      expect(await page.locator('main [id="fn:1"]').textContent()).toContain('The footnote.');
      const blocksAudit = await new AxeBuilder({ page }).analyze(); expect(blocksAudit.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target).join(', ')}`)).toEqual([]);
      if (process.env.MARKUPRESS_SCREENSHOTS) await page.screenshot({ path: join(process.env.MARKUPRESS_SCREENSHOTS, `markupress-${mode}-blocks.png`), fullPage: true });
      if (mode === 'preview') {
        // Without JavaScript the blocks still read: the callout is server-rendered, details is native, and every tab panel shows.
        const still = await browser.newContext({ javaScriptEnabled: false }); const plain = await still.newPage();
        await plain.goto(server.url + 'v/current/guide/blocks/');
        expect(await plain.getByRole('note').filter({ hasText: 'Breaking {x}' }).isVisible()).toBe(true);
        expect(await plain.getByText('npx markupress build').isVisible()).toBe(true);
        expect(await plain.getByText('pnpm markupress build').isVisible()).toBe(true);
        // Without JavaScript a code block is only its code.
        expect(await plain.locator('.code-actions').first().isVisible()).toBe(false);
        expect(await plain.getByText('const first = 1;').isVisible()).toBe(true);
        // Without JavaScript the outline still links its headings, and the narrow-screen drawer still opens.
        await plain.goto(server.url + 'v/current/guide/outline/');
        expect(await plain.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Third' }).getAttribute('href')).toBe('#third');
        await plain.setViewportSize({ width: 390, height: 844 });
        await plain.getByRole('button', { name: 'Navigation', exact: true }).click();
        expect(await plain.getByRole('navigation', { name: 'Documentation', exact: true }).isVisible()).toBe(true);
        await still.close();
      }
      await page.goto(server.url + 'v/current/guide/new/');
      expect(await versions.getByText(/unavailable in v1/).textContent()).toContain('documentation home');
      await versions.getByRole('link', { name: 'v1', exact: true }).click(); await expect.poll(() => page.url()).toBe(server!.url + 'v/v1/');
      expect(await page.locator('main img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(40);
      await page.getByRole('link', { name: 'Skip to content' }).focus(); await page.keyboard.press('Enter');
      expect(await page.locator('main').evaluate(element => element === element.ownerDocument.activeElement)).toBe(true);
      const audit = await new AxeBuilder({ page }).analyze(); expect(audit.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target).join(', ')}`)).toEqual([]);
      // The outline tracks the heading in view, and its links stay plain fragment links.
      await page.goto(server.url + 'v/current/guide/outline/');
      const outline = page.getByRole('navigation', { name: 'On this page' });
      expect(await outline.getByRole('link').allTextContents()).toEqual(['First', 'Second', 'Third']);
      await page.locator('#second').evaluate(element => element.scrollIntoView());
      await expect.poll(() => outline.getByRole('link', { name: 'Second' }).getAttribute('aria-current')).toBe('location');
      expect(await outline.locator('[aria-current]').count()).toBe(1);
      // Search: / opens Looma's search dialog, typing finds a heading on another page, and Enter opens it.
      await page.goto(server.url + 'v/current/guide/install/');
      const dialog = page.getByRole('dialog', { name: 'Search the documentation' });
      await page.getByRole('button', { name: 'Search' }).waitFor();
      await page.keyboard.press('/');
      await expect.poll(() => dialog.isVisible()).toBe(true);
      // The dialog's field takes focus as it opens.
      await expect.poll(() => page.getByRole('searchbox').evaluate(element => element === element.ownerDocument.activeElement)).toBe(true);
      await page.keyboard.type('secnd');
      await expect.poll(() => dialog.getByRole('status').textContent()).toBe('No results for "secnd"');
      await page.getByRole('searchbox').fill('second');
      await expect.poll(() => dialog.locator('[data-href]').first().getAttribute('data-href')).toBe('/manual/v/current/guide/outline/#second');
      expect(await dialog.locator('[data-href]').first().textContent()).toContain('Outline');
      const searchAudit = await new AxeBuilder({ page }).include('[data-component="ui-search-shell"]').analyze();
      expect(searchAudit.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target).join(', ')}`)).toEqual([]);
      await page.keyboard.press('Enter');
      await expect.poll(() => page.url(), { timeout: 30_000 }).toBe(server.url + 'v/current/guide/outline/#second');
      await expect.poll(() => dialog.isVisible()).toBe(false);
      // Ctrl+K opens it too, Escape closes it, and each version searches its own pages: v1 has no "New document".
      await page.goto(server.url + 'v/v1/guide/install/');
      await page.getByRole('button', { name: 'Search' }).waitFor();
      await page.keyboard.press('Control+k');
      await expect.poll(() => dialog.isVisible()).toBe(true);
      await page.getByRole('searchbox').fill('new document');
      await expect.poll(() => dialog.getByRole('status').textContent()).toBe('No results for "new document"');
      // v1's results are v1's pages.
      await page.getByRole('searchbox').fill('second');
      await expect.poll(() => dialog.locator('[data-href]').first().getAttribute('data-href')).toBe('/manual/v/v1/guide/outline/#second');
      await page.keyboard.press('Escape');
      await expect.poll(() => dialog.isVisible()).toBe(false);
      await page.goto(server.url + 'v/current/guide/outline/');
      // The top navigation links each section folder with an index page, then the configured links; the logo and footer come from conventions.
      const main = page.getByRole('navigation', { name: 'Main' });
      expect(await main.getByRole('link').allTextContents()).toEqual(['Reference', 'Workspace', 'Outline']);
      expect(await main.getByRole('link', { name: 'Outline' }).getAttribute('aria-current')).toBe('page');
      expect(await page.locator('header img.logo-light').getAttribute('src')).toBe('/manual/logo.svg');
      const baselineDelta = await page.locator('[data-component~="markupress-header"]').evaluate(header => {
        const probes = [header.querySelector('.brand-title')!, header.querySelector('.top a')!].map(label => {
          const probe = document.createElement('span'); probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'; label.append(probe); return probe;
        });
        const delta = Math.abs(probes[0]!.getBoundingClientRect().top - probes[1]!.getBoundingClientRect().top); probes.forEach(probe => probe.remove()); return delta;
      });
      expect(baselineDelta).toBeLessThan(1);
      await page.evaluate(() => { (window as unknown as {noticeDismissed:boolean}).noticeDismissed=false; window.addEventListener('markupress-header-notice-dismiss',()=>{ (window as unknown as {noticeDismissed:boolean}).noticeDismissed=true; document.documentElement.style.setProperty('--markupress-header-notice-display','none'); }); });
      expect(await page.getByRole('button',{name:'Remove Custom theme',exact:true}).locator('svg').count()).toBe(1);
      await page.getByRole('button',{name:'Remove Custom theme',exact:true}).click();
      expect(await page.evaluate(() => (window as unknown as {noticeDismissed:boolean}).noticeDismissed)).toBe(true);
      await expect.poll(() => page.getByRole('button',{name:'Search',exact:true}).evaluate(el => el === document.activeElement)).toBe(true);

      expect(await page.locator('footer').textContent()).toContain('Copyright Example.');
      // A generated folder index is a page of links, which navigate like any other.
      await main.getByRole('link', { name: 'Reference' }).click();
      await expect.poll(() => page.locator('main h1').textContent(), { timeout: 30_000 }).toBe('Reference');
      await expect.poll(() => main.getByRole('link', { name: 'Reference' }).getAttribute('aria-current')).toBe('page');
      expect(await page.locator('ul.contents p').textContent()).toBe('Configure the site.');
      const indexAudit = await new AxeBuilder({ page }).analyze(); expect(indexAudit.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target).join(', ')}`)).toEqual([]);
      await page.locator('ul.contents').getByRole('link', { name: 'Options' }).click();
      await expect.poll(() => page.locator('main h1').textContent(), { timeout: 30_000 }).toBe('Options');
      // An unknown path renders the 404 page in the shell.
      expect((await page.goto(server.url + 'v/current/nowhere/'))!.status()).toBe(404);
      expect(await page.locator('h1').textContent()).toBe('Nothing here');
      expect(await page.getByRole('navigation', { name: 'Documentation', exact: true }).count()).toBe(1);
      // The home page reads its hero and feature cards from its Markdown, between the top navigation and footer, with no sidebar.
      await page.goto(server.url + 'v/current/');
      expect(await page.locator('[data-component="markupress-home"] .hero h1').textContent()).toBe('Welcome');
      expect(await page.locator('.hero-image img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(40);
      expect(await page.locator('.features [data-component="ui-card"] h2').allTextContents()).toEqual(['Components', 'Versions']);
      expect(await page.getByRole('navigation', { name: 'Main' }).getByRole('link').allTextContents()).toEqual(['Reference', 'Workspace', 'Outline']);
      expect(await page.locator('footer').textContent()).toContain('Copyright Example.');
      expect(await page.locator('#documentation-navigation, [data-component="hk-pager"]').count()).toBe(0);
      // Audited in both themes: the saved dark theme, then light.
      for (const theme of ['dark', 'light']) {
        // A reload settles the theme, so no color is caught mid-transition.
        if (theme === 'light') { await chooseAppearance(page, 'light'); await page.reload(); }
        await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe(theme);
        const homeAudit = await new AxeBuilder({ page }).analyze(); expect(homeAudit.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target).join(', ')}`)).toEqual([]);
      }
      // Its actions are links: the first leads to the guide, in the shell.
      await page.getByRole('link', { name: 'Installation' }).click();
      await expect.poll(() => page.url(), { timeout: 30_000 }).toBe(server!.url + 'v/current/guide/install/#install');
      await expect.poll(() => page.locator('[data-component="markupress-shell"]').count(), { timeout: 30_000 }).toBe(1);
      if (process.env.MARKUPRESS_SCREENSHOTS) { await page.goto(server.url + 'v/current/'); await page.screenshot({ path: join(process.env.MARKUPRESS_SCREENSHOTS, `markupress-${mode}-home.png`), fullPage: true }); }
      await page.goto(server.url + 'v/current/about/');
      const group = page.locator('#documentation-navigation [data-component~="ui-disclosure"]').filter({ has: page.getByRole('button', { name: 'guide', exact: true }) });
      const trigger = group.getByRole('button', { name: 'guide', exact: true });
      await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('true');
      expect((await group.getByRole('link').allTextContents()).map(text => text.trim())).toEqual(['Installation', 'New document', 'Blocks', 'Outline']);
      expect(await trigger.locator('svg').count()).toBeGreaterThan(0);
      await trigger.click(); await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('false');
      await trigger.press('Enter'); await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('true');
      const linkedGroup = page.getByRole('button', { name: 'Reference', exact: true });
      expect(await linkedGroup.evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(40);
      expect(await page.getByRole('link', { name: 'Reference overview', exact: true }).getAttribute('href')).toContain('/reference/');
      await page.goto(server.url + 'v/v1/');
      // On a narrow screen the sidebar is a closed popover drawer; following a link in it closes it.
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.locator('html').evaluate(element => element.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.getByRole('button',{name:'Remove Custom theme',exact:true}).locator('svg').count()).toBe(1);
      if(process.env.MARKUPRESS_SCREENSHOTS) await page.screenshot({path:join(process.env.MARKUPRESS_SCREENSHOTS,`markupress-${mode}-mobile-notice.png`)});
      await page.locator('html').evaluate(element=>element.style.setProperty('--markupress-header-notice-display','none'));
      expect(await page.locator('[data-component~="markupress-header"]').evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(68);
      const brand = page.getByRole('link', { name: 'Example docs with a deliberately long product title', exact: true });
      expect(await brand.locator('.brand-title').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
      for (const label of ['Navigation', 'Search']) expect(await page.getByRole('button', { name: label, exact: true }).isVisible()).toBe(true);
      expect(await page.getByRole('button', { name: /^Appearance:/ }).count()).toBe(1);
      // Invisible targets fit their own cells; the shared comfort preference remains adjustable.
      const searchAction = page.getByRole('button', { name: 'Search', exact: true });
      const appearanceAction = page.getByRole('button', { name: /^Appearance:/ });
      const assertSeparateTargets = async () => {
        const searchBox = (await searchAction.boundingBox())!;
        const appearanceBox = (await appearanceAction.boundingBox())!;
        const preferred = await appearanceAction.evaluate(element => parseFloat(getComputedStyle(element).getPropertyValue('--ui-control-min-block-size')));
        const searchTarget = Math.max(searchBox.width, preferred), appearanceTarget = Math.max(appearanceBox.width, preferred);
        expect((appearanceBox.x + appearanceBox.width / 2) - (searchBox.x + searchBox.width / 2)).toBeGreaterThanOrEqual((searchTarget + appearanceTarget) / 2 - .5);
      };
      expect(await page.locator('html').evaluate(el=>el.scrollWidth <= innerWidth)).toBe(true);
      await assertSeparateTargets();
      const actionWidth = await page.locator('[data-component~="markupress-header"] > .actions').evaluate(element => element.getBoundingClientRect().width);
      await page.evaluate(() => document.documentElement.style.setProperty('--ui-control-min-block-size', '30px'));
      await assertSeparateTargets();
      expect(await page.locator('[data-component~="markupress-header"] > .actions').evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(actionWidth);
      await page.evaluate(() => document.documentElement.style.removeProperty('--ui-control-min-block-size'));

      const sidebar = page.getByRole('navigation', { name: 'Documentation', exact: true });
      await expect.poll(() => sidebar.isVisible()).toBe(false);
      await page.getByRole('button', { name: 'Navigation', exact: true }).click();
      await expect.poll(() => sidebar.isVisible()).toBe(true);
      expect(await page.getByRole('navigation', { name: 'Sections', exact: true }).isVisible()).toBe(true);
      await page.keyboard.press('Escape');
      await expect.poll(() => sidebar.isVisible()).toBe(false);
      await page.getByRole('button', { name: 'Navigation', exact: true }).click();
      await sidebar.getByRole('link', { name: 'Installation' }).click();
      await expect.poll(() => page.url()).toBe(server!.url + 'v/v1/guide/install/');
      await expect.poll(() => sidebar.isVisible()).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (process.env.MARKUPRESS_SCREENSHOTS) await page.screenshot({ path: join(process.env.MARKUPRESS_SCREENSHOTS, `markupress-${mode}-mobile.png`), fullPage: true });
      // Workspace pages retain a mobile section menu without duplicating documentation navigation.
      await page.goto(server.url + 'v/current/workspace/edit/');
      expect(await page.getByRole('navigation', { name: 'Documentation', exact: true }).count()).toBe(0);
      await page.getByRole('button', { name: 'Navigation', exact: true }).click();
      expect(await page.getByRole('navigation', { name: 'Sections', exact: true }).isVisible()).toBe(true);
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1440, height: 1000 });
      expect(await page.locator('#documentation-navigation').isVisible()).toBe(false);
      await page.goto(server.url + 'v/current/guide/outline/');
      const outlineTitle = page.getByText('On this page', { exact: true });
      const header = page.locator('[data-component="markupress-header"]');
      expect((await outlineTitle.boundingBox())!.y).toBeGreaterThan((await header.boundingBox())!.y + (await header.boundingBox())!.height + 10);
      await page.locator('html').evaluate(element => element.style.setProperty('--markupress-header-height', '96px'));
      await page.evaluate(() => scrollTo(0, 500));
      await expect.poll(async () => (await outlineTitle.boundingBox())!.y).toBeGreaterThanOrEqual(106);
      await page.locator('html').evaluate(element => element.style.removeProperty('--markupress-header-height'));
      await page.setViewportSize({ width: 390, height: 844 });
      // The home page fits a narrow screen too.
      await page.goto(server.url + 'v/current/');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (mode === 'preview') {
        const noScript = await browser.newContext({ javaScriptEnabled: false });
        try {
          const plain = await noScript.newPage(); await plain.goto(server.url + 'v/current/about/');
          const fallback = plain.locator('.native details').filter({ has: plain.locator('summary', { hasText: 'guide' }) });
          expect(await fallback.isVisible()).toBe(true);
          await fallback.locator('summary').click();
          expect(await fallback.getAttribute('open')).toBe(null);
          expect(await plain.locator('.enhanced').isVisible()).toBe(false);
        } finally { await noScript.close(); }
      }
      expect(errors).toEqual([]); expect(violations).toEqual([]); await context.close(); await server.close(); server = undefined;
    }
  } finally { await server?.close(); await browser.close(); }
}, 90_000);
