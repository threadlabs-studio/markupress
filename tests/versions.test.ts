import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

it('records immutable snapshots and discovers their explicit version descriptors', async () => {
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
    const version = await snapshotVersion('v1', { root });
    const frozen = await readFile(join(root, version.directory, 'index.md'), 'utf8');
    expect(frozen).toContain('# Frozen');
    expect(await readFile(join(root, version.directory, '../components/value.ts'), 'utf8')).toContain('frozen');
    expect(await readFile(join(root, version.directory, '../components/counter.css'), 'utf8')).toContain('20,30,40');
    expect(await readFile(join(root, version.directory, '../shared.svg'), 'utf8')).toContain('<svg');
    await writeFile(join(root, 'docs/index.md'), '# Changed');
    await expect(snapshotVersion('v1', { root })).rejects.toThrow(/already exists/);
    expect(await readFile(join(root, version.directory, 'index.md'), 'utf8')).toBe(frozen);
    expect(JSON.parse(await readFile(join(root, 'versioned_docs/versions.json'), 'utf8'))).toEqual([version]);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
