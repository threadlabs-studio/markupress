import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createApplication, devApplication } from '@threadlabs/markupkit';
import { buildSite, siteOptions, type MarkupressOptions } from '../src/site.js';
import { linkDependencies } from './fixture.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function write(root: string, file: string, source: string) {
  await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), source);
}
async function fixture(withSnapshot = false) {
  const root = await mkdtemp(join(tmpdir(), 'markupress-fallback-')); roots.push(root);
  await write(root, 'package.json', '{"type":"module"}'); await linkDependencies(root);
  for (const folder of withSnapshot ? ['docs', 'versions/v1/docs'] : ['docs']) {
    for (const [locale, title] of [['en', 'Home'], ['fr', 'Accueil'], ['ar', 'البداية']]) await write(root, `${folder}/${locale}/index.md`, '# ' + title);
    await write(root, `${folder}/en/start.md`, '---\nid: setup\n---\n# Install\n\nSource installation');
    await write(root, `${folder}/en/fallback.md`, '---\nid: fallback\naliases: [/old-fallback/]\n---\n# Source reference\n\n[Install](./start.md)\n\n![Mark](./mark.svg)\n\n```text\n{literal} <source-card>\n```\n\n<link rel="component" href="./_parts/card.html">\n<source-card></source-card>');
    await write(root, `${folder}/en/_parts/card.html`, '<template component="source-card"><p>Original component</p></template>');
    await write(root, `${folder}/en/mark.svg`, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await write(root, `${folder}/en/private.md`, '---\nsearch: false\n---\n# Unlisted reference');
  }
  await write(root, 'docs/fr/demarrer.md', '---\nid: setup\n---\n# Installation française');
  return root;
}
function options(root: string, localeFallback?: 'source' | 'home'): MarkupressOptions {
  return { root, base: '/manual/', origin: 'https://docs.example', ...(localeFallback === undefined ? {} : { localeFallback }),
    locales: { en: { label: 'English' }, fr: { label: 'Français', title: 'Documentation française' }, ar: { label: 'العربية' } },
    defaultLocale: 'en' };
}
const visible = (html: string) => html.replace(/<!--[^>]*-->|<\?[^>]*\?>/g, '');

it('keeps locale-home behavior unless source fallback is enabled', async () => {
  const root = await fixture();
  for (const policy of [undefined, 'home'] as const) {
    const app = await createApplication(siteOptions(options(root, policy)));
    try { expect((await app.render('/manual/fr/fallback/')).status).toBe(404); }
    finally { await app.close(); }
  }
}, 30_000);

it('serves source content with selected-locale chrome, original dependencies and scoped document identities', async () => {
  const root = await fixture(true);
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['add', 'docs', 'versions'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'Documentation'],
    { cwd: root, env: { ...process.env, GIT_AUTHOR_DATE: '2026-10-28T12:00:00Z', GIT_COMMITTER_DATE: '2026-10-28T12:00:00Z' } });
  const app = await createApplication(siteOptions(options(root, 'source')));
  try {
    const french = visible((await app.render('/manual/fr/fallback/')).html);
    expect(french).toContain('<html lang="fr" dir="ltr">');
    expect(french).toMatch(/<article[^>]*lang="en"[^>]*dir="ltr"/);
    expect(french).toContain('Source reference | Documentation française');
    expect(french).toContain('Ce contenu n’est pas encore disponible en Français.');
    expect(french).toContain('>Copier</button>');
    expect(french).toContain('datetime="2026-10-28">28 octobre 2026</time>');
    expect(french).toContain('href="/manual/fr/v/current/demarrer/"');
    expect(french).toContain('Original component'); expect(french).toContain('{literal} &lt;source-card&gt;');
    expect(french).toMatch(/src="\/manual\/_markupkit\/files\/[a-f0-9]{16}-mark\.svg"/);
    expect(french).toContain('rel="canonical" href="https://docs.example/manual/fallback/"');
    expect(french).not.toMatch(/<link[^>]*rel="alternate"[^>]*hreflang="(?:fr|ar)"/);
    const arabic = visible((await app.render('/manual/ar/fallback/')).html);
    expect(arabic).toContain('<html lang="ar" dir="rtl">'); expect(arabic).toMatch(/<article[^>]*lang="en"[^>]*dir="ltr"/);
    expect(arabic).toContain('>نسخ</button>'); expect(arabic).toContain('href="/manual/ar/v/current/start/"');
    expect((await app.render('/manual/fr/old-fallback/')).status).toBe(200);
    expect((await app.render('/manual/fr/start/')).status).toBe(404);
    expect((await app.render('/manual/fr/v/v1/start/')).html).toContain('Source installation');
    const search = JSON.stringify(app.generated.get('/manual/fr/_search.json')?.contents);
    expect(search).toContain('Source reference'); expect(search).toContain('/manual/fr/fallback/');
    expect(search).not.toContain('/manual/fallback/'); expect(search).not.toContain('Unlisted reference');
    expect(app.routes.find(route => route.pattern === '/fr/fallback/')).toMatchObject({ aliasOf: '/fallback/' });
  } finally { await app.close(); }
}, 30_000);

it('reselects a fallback when its translation is added, renamed and deleted during development', async () => {
  const root = await fixture(), server = await devApplication({ ...siteOptions(options(root, 'source')), port: 0 });
  const get = async (path: string) => { const response = await fetch(server.url + path); return { status: response.status, html: await response.text() }; };
  try {
    expect((await get('fr/fallback/')).html).toContain('Source reference');
    await write(root, 'docs/fr/reference.md', '---\nid: fallback\n---\n# Référence traduite');
    await expect.poll(async () => (await get('fr/reference/')).html, { timeout: 10_000 }).toContain('Référence traduite');
    expect((await get('fr/fallback/')).status).toBe(404);
    await rename(join(root, 'docs/fr/reference.md'), join(root, 'docs/fr/renommee.md'));
    await expect.poll(async () => (await get('fr/renommee/')).html, { timeout: 10_000 }).toContain('Référence traduite');
    await rm(join(root, 'docs/fr/renommee.md'));
    await expect.poll(async () => (await get('fr/fallback/')).html, { timeout: 10_000 }).toContain('Source reference');
  } finally { await server.close(); }
}, 30_000);

it('builds fallback aliases with source canonicals while listing only real translations in the sitemap', async () => {
  const root = await fixture(), built = await buildSite(options(root, 'source'));
  const sitemap = await readFile(join(built.outDir, 'sitemap.xml'), 'utf8');
  expect(sitemap).toContain('https://docs.example/manual/fallback/');
  expect(sitemap).toContain('https://docs.example/manual/fr/demarrer/');
  expect(sitemap).not.toContain('/manual/fr/fallback/');
  const html = await readFile(join(built.outDir, 'ar/fallback/index.html'), 'utf8');
  expect(html).toContain('<html lang="ar" dir="rtl">');
  expect(html).toContain('rel="canonical" href="https://docs.example/manual/fallback/"');
}, 60_000);

it('allows a locale to begin without a translated folder, including a source home layout', async () => {
  const root = await fixture();
  await rm(join(root, 'docs/fr'), { recursive: true });
  await write(root, 'docs/en/index.md', '---\nlayout: home\n---\n# Source home');
  const app = await createApplication(siteOptions(options(root, 'source')));
  try {
    const html = visible((await app.render('/manual/fr/')).html);
    expect(html).toContain('Source home'); expect(html).toContain('Ce contenu n’est pas encore disponible en Français.');
    expect(html).toContain('<html lang="fr" dir="ltr">');
  } finally { await app.close(); }
}, 30_000);

it('resolves a fallback canonical beside its source while retaining an authored article language', async () => {
  const root = await fixture();
  await write(root, 'docs/en/fallback.md', '---\nid: fallback\nlang: de\nhead: { canonical: ../source-owner/ }\n---\n# Source reference');
  const app = await createApplication(siteOptions(options(root, 'source')));
  try {
    const html = (await app.render('/manual/fr/fallback/')).html;
    expect(html).toContain('<html lang="fr" dir="ltr">');
    expect(html).toMatch(/<article[^>]*lang="de"[^>]*dir="ltr"/);
    expect(html).toContain('rel="canonical" href="https://docs.example/manual/source-owner/"');
    expect(html).toContain('hreflang="en" href="https://docs.example/manual/source-owner/"');
  } finally { await app.close(); }
}, 30_000);
