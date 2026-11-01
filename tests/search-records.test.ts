import { expect, it } from 'vitest';
import { algoliaRecords } from '../src/search-records.js';

it('exports stable contextual DocSearch records and preserves complete Unicode content inside the provider size limit', () => {
  const entry = { document: 'setup', section: 'install', href: '/manual/fr/setup/#install', page: 'Installation', heading: 'Installer', text: '"Café" 👩🏽‍💻 العربية\n'.repeat(1200) };
  const records = algoliaRecords([entry], 'fr', 'current', 'https://docs.example');
  expect(records.length).toBeGreaterThan(1);
  expect(records.map(record => record.content).join('')).toBe(entry.text);
  expect(records.every(record => Buffer.byteLength(JSON.stringify(record)) <= 10_000)).toBe(true);
  expect(records[0]).toMatchObject({ url: 'https://docs.example/manual/fr/setup/#install', language: 'fr', version: 'current' });
  expect(algoliaRecords([{ ...entry, href: '/manual/fr/renamed/#install' }], 'fr', 'current', 'https://docs.example').map(record => record.objectID))
    .toEqual(records.map(record => record.objectID));
  expect(new Set(records.map(record => record.objectID)).size).toBe(records.length);
});
