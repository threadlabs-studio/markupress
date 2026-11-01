import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { createApplication } from '@threadlabs/markupkit';
import { siteOptions } from '../src/site.js';
import { linkDependencies } from './fixture.js';
import type { AlgoliaRecord } from '../src/search-records.js';

it('exports scoped records, fallback and exclusions and supplies hosted props and CSP through native compilation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'markupress-hosted-'));
  const write = async (file: string, text: string) => { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), text); };
  try {
    await write('package.json', '{"type":"module"}'); await linkDependencies(root);
    await write('docs/en/index.md', '# Home'); await write('docs/fr/index.md', '# Accueil');
    await write('docs/en/install.md', '---\nid: setup\n---\n# Install\n\nCafé installation.\n\n<div data-search-ignore>ignoredsecret</div>');
    await write('docs/en/hidden.md', '---\nsearch: false\n---\n# Excluded secret');
    const app = await createApplication(siteOptions({ root, base: '/manual/', origin: 'https://docs.example',
      locales: { en: { label: 'English' }, fr: { label: 'Français' } }, localeFallback: 'source',
      versions: [{ id: 'current', directory: 'docs' }, { id: 'old', directory: 'docs' }],
      search: { provider: 'algolia', appId: 'APP123', apiKey: 'public-key', indexName: 'docs', filters: 'audience:public' } }));
    try {
      const html = (await app.render('/manual/fr/v/old/install/')).html;
      expect(html).toContain("connect-src 'self' https://app123-dsn.algolia.net");
      expect(html).toContain('data-markupress-search-prop-hosted=');
      expect(html).toContain('Algolia</a>');
      const records = JSON.parse(String(app.generated.get('/manual/_algolia.json')!.contents)) as AlgoliaRecord[];
      expect(records.some(record => record.language === 'fr' && record.version === 'old' && record.url_without_anchor === 'https://docs.example/manual/fr/v/old/install/')).toBe(true);
      expect(records.some(record => record.language === 'en' && record.version === 'current' && record.url_without_anchor === 'https://docs.example/manual/install/')).toBe(true);
      expect(JSON.stringify(records)).not.toMatch(/ignoredsecret|Excluded secret/);
      expect(new Set(records.map(record => record.objectID)).size).toBe(records.length);
      expect(records.map(record => record.objectID)).toEqual(records.map(record => record.objectID).sort());
      expect(app.generated.has('/manual/fr/v/old/_search.json')).toBe(true);
    } finally { await app.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
