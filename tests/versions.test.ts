import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createApplication } from '@nextwebwg/htmlkit';
import { siteOptions } from '../src/site.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { versionLinks } from '../src/versions.js';
import { linkDependencies } from './fixture.js';

it('retains logical document identity across versions and explains landing-page fallbacks', () => {
  const documents = [
    { id: 'index', version: '1', pathname: '/v/1/' },
    { id: 'install', version: '1', pathname: '/v/1/start/' },
    { id: 'index', version: '2', pathname: '/v/2/' },
    { id: 'install', version: '2', pathname: '/v/2/guide/install/' },
    { id: 'index', version: 'legacy', pathname: '/v/legacy/' },
  ];
  expect(versionLinks(documents, [{ id: '2', label: 'Latest' }, { id: '1' }, { id: 'legacy' }], 'install', '2', '/docs/')).toEqual([
    { href: '/docs/v/2/guide/install/', label: 'Latest', current: 'page', note: '' },
    { href: '/docs/v/1/start/', label: '1', current: 'false', note: '' },
    { href: '/docs/v/legacy/', label: 'legacy', current: 'false', note: 'This document is unavailable in legacy; open its documentation home.' },
  ]);
});

it('records immutable snapshots in versions/ and discovers them from its folders', async () => {
  const { snapshotVersion } = await import('../src/versions.js');
  const root = await mkdtemp(join(tmpdir(), 'markupress-versions-'));
  try {
    await mkdir(join(root, 'docs')); await writeFile(join(root, 'docs/index.md'), '# Frozen');
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await linkDependencies(root);
    await mkdir(join(root, 'components'));
    await writeFile(join(root, 'docs/index.md'), '# Frozen\n\n![Shared image](../shared.svg)\n\n<link rel="component" href="../components/counter.html">\n\n<demo-counter></demo-counter>');
    await writeFile(join(root, 'shared.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(join(root, 'components/counter.html'), '<template component="demo-counter" controller="./counter.js"><button>Frozen demo</button><style>@import "./counter.css";</style></template>');
    await writeFile(join(root, 'components/counter.ts'), 'import { value } from "./value.js"; export default function(host) { host.root.dataset.value = value; }');
    await writeFile(join(root, 'components/value.ts'), 'export const value = "frozen";');
    await writeFile(join(root, 'components/counter.css'), 'button { color: rgb(20,30,40); }');
    await mkdir(join(root, 'public')); await writeFile(join(root, 'public/logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const version = await snapshotVersion('v1', { root });
    // The snapshot keeps the project's layout.
    expect(version).toEqual({ id: 'v1', directory: 'versions/v1/docs', publicDir: 'versions/v1/public' });
    expect(await readFile(join(root, 'versions/v1/public/logo.svg'), 'utf8')).toContain('<svg');
    const frozen = await readFile(join(root, version.directory, 'index.md'), 'utf8');
    expect(frozen).toContain('# Frozen');
    expect(await readFile(join(root, version.directory, '../components/value.ts'), 'utf8')).toContain('frozen');
    expect(await readFile(join(root, version.directory, '../components/counter.css'), 'utf8')).toContain('20,30,40');
    expect(await readFile(join(root, version.directory, '../shared.svg'), 'utf8')).toContain('<svg');
    await writeFile(join(root, 'docs/index.md'), '# Changed');
    await expect(snapshotVersion('v1', { root })).rejects.toThrow(/already exists/);
    expect(await readFile(join(root, version.directory, 'index.md'), 'utf8')).toBe(frozen);
    // No staging folder, lock or manifest is left behind; the folders are the list.
    expect((await readdir(join(root, 'versions'))).sort()).toEqual(['v1']);
    await snapshotVersion('v2', { root });
    await snapshotVersion('v10', { root });
    const application = await createApplication(siteOptions({ root }));
    try {
      // Snapshots follow the current version, highest number first, each labelled by its folder name.
      const html = (await application.render('/')).html;
      expect(/Versions.*?<\/nav>/s.exec(html)![0].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).toBe('Versions Current v10 v2 v1');
    } finally { await application.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
