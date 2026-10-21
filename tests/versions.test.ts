import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createApplication } from '@nextwebwg/htmlkit';
import { siteOptions } from '../src/site.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { buildApplication } from '@nextwebwg/htmlkit';
import { freezeRootPaths, versionLinks } from '../src/versions.js';
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
    await writeFile(join(root, 'docs/index.md'), '# Frozen\n\n![Shared image](../shared.svg)\n\n<link rel="component" href="@/components/counter.html">\n\n<demo-counter></demo-counter>\n\n```html\n<link rel="component" href="@/components/counter.html">\n```\n\nInline `href="@/components/counter.html"` too.');
    await writeFile(join(root, 'shared.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(join(root, 'components/counter.html'), '<template component="demo-counter" controller="@/components/counter.js"><button>Frozen demo</button><style>@import "@/components/counter.css";</style></template>');
    await writeFile(join(root, 'components/counter.ts'), 'import { value } from "@/components/value.js"; export default function(host) { host.root.dataset.value = value; }');
    await writeFile(join(root, 'components/value.ts'), 'export const value = "frozen";');
    await writeFile(join(root, 'components/counter.css'), 'button { color: rgb(20,30,40); }');
    await mkdir(join(root, 'public')); await writeFile(join(root, 'public/logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const version = await snapshotVersion('v1', { root });
    // The snapshot keeps the project's layout.
    expect(version).toEqual({ id: 'v1', directory: 'versions/v1/docs', publicDir: 'versions/v1/public' });
    expect(await readFile(join(root, 'versions/v1/public/logo.svg'), 'utf8')).toContain('<svg');
    const frozen = await readFile(join(root, version.directory, 'index.md'), 'utf8');
    expect(frozen).toContain('# Frozen');
    // The snapshot's @/ links name its own copies; code examples stay as written.
    expect(frozen).toContain('<link rel="component" href="@/versions/v1/components/counter.html">\n\n<demo-counter>');
    expect(frozen).toContain('```html\n<link rel="component" href="@/components/counter.html">\n```');
    expect(frozen).toContain('Inline `href="@/components/counter.html"` too.');
    expect(await readFile(join(root, 'versions/v1/components/counter.html'), 'utf8')).toContain('controller="@/versions/v1/components/counter.js"><button>Frozen demo</button><style>@import "@/versions/v1/components/counter.css";');
    expect(await readFile(join(root, 'versions/v1/components/counter.ts'), 'utf8')).toContain('from "@/versions/v1/components/value.js"');
    expect(await readFile(join(root, version.directory, '../components/value.ts'), 'utf8')).toContain('frozen');
    expect(await readFile(join(root, version.directory, '../components/counter.css'), 'utf8')).toContain('20,30,40');
    expect(await readFile(join(root, version.directory, '../shared.svg'), 'utf8')).toContain('<svg');
    // The live component changes; the snapshot renders its frozen copy, and the current version the change.
    await writeFile(join(root, 'components/counter.html'), '<template component="demo-counter"><button>Live demo</button></template>');
    const built = await buildApplication({ ...siteOptions({ root }), outDir: join(root, 'site') });
    expect(await readFile(join(built.outDir, 'v/v1/index.html'), 'utf8')).toContain('Frozen demo');
    expect(await readFile(join(built.outDir, 'index.html'), 'utf8')).toContain('Live demo');
    await writeFile(join(root, 'docs/index.md'), '# Changed');
    await expect(snapshotVersion('v1', { root })).rejects.toThrow(/already exists/);
    expect(await readFile(join(root, version.directory, 'index.md'), 'utf8')).toBe(frozen);
    // No staging folder, lock or manifest is left behind; the folders are the list.
    expect((await readdir(join(root, 'versions'))).sort()).toEqual(['v1']);
    // Discovery reads only the folders, so further versions need no snapshot build (each one validates a full build).
    for (const id of ['v2', 'v10']) { await mkdir(join(root, `versions/${id}/docs`), { recursive: true }); await writeFile(join(root, `versions/${id}/docs/index.md`), `# ${id}`); }
    // A crashed snapshot's staging folder is no version.
    await mkdir(join(root, 'versions/.v3-pending/docs'), { recursive: true }); await writeFile(join(root, 'versions/.v3-pending/docs/index.md'), '# Partial');
    const application = await createApplication(siteOptions({ root }));
    try {
      // Snapshots follow the current version, highest number first, each labelled by its folder name.
      const html = (await application.render('/')).html;
      expect(/Versions.*?<\/nav>/s.exec(html)![0].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).toBe('Versions Current v10 v2 v1');
    } finally { await application.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);

it('freezes only the @/ specifiers whose files a snapshot copies, and warns about the rest', async () => {
  const warnings: string[] = [];
  const warn = (warning: Error) => warnings.push(warning.message);
  process.on('warning', warn);
  try {
    const copied = new Set(['app/components/card.html', 'app/components/card.ts']);
    expect(freezeRootPaths('<link rel="component" href="@/app/components/card.html"><template component="x-y" controller="@/app/components/card.js"></template>' +
      '<link rel="component" href="@/app/shared/live.html">', 'docs/page.md', 'v2', copied))
      .toBe('<link rel="component" href="@/versions/v2/app/components/card.html"><template component="x-y" controller="@/versions/v2/app/components/card.js"></template>' +
        '<link rel="component" href="@/app/shared/live.html">');
    expect(freezeRootPaths("import { a } from '@/app/components/card.js';\n@import url(\"@/app/components/card.html?raw\");", 'app/x.ts', 'v2', copied))
      .toBe("import { a } from '@/versions/v2/app/components/card.js';\n@import url(\"@/versions/v2/app/components/card.html?raw\");");
    await new Promise(resolve => setImmediate(resolve));
    expect(warnings).toEqual(['docs/page.md: @/app/shared/live.html is outside version v2, so the snapshot reads the project\'s current file.']);
  } finally { process.off('warning', warn); }
});
