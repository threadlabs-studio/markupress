import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createApplication } from '@nextwebwg/htmlkit';
import { expect, it } from 'vitest';
import { markdown } from '../src/markdown.js';

async function write(root: string, file: string, text: string) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), text); }

it('adds Markdown pages to any HTMLKit site without Markupress versions or theme', async () => {
  const root = await mkdtemp(join(tmpdir(), 'markupress-markdown-'));
  try {
    await write(root, 'package.json', '{"type":"module"}');
    await write(root, 'app/pages/index.md', '# Welcome\n\n[Guide](guide.md)');
    await write(root, 'app/pages/guide.md', '---\nsidebarLabel: The guide\n---\n# Guide\n\nPlain {braces} stay text.\n\n```html\n<output>{$count}</output>\n```');
    await write(root, 'app/pages/about.html', '<template component="page-about"><p>HTML pages still route.</p></template>');
    const application = await createApplication({ root, plugins: [markdown()] });
    try {
      expect(application.routes.map(route => route.pattern).sort()).toEqual(['/', '/about/', '/guide/']);
      expect((await application.render('/')).html).toContain('href="/guide/"');
      const guide = (await application.render('/guide/')).html;
      expect(guide).toContain('<title>Guide</title>');
      expect(guide).toContain('Plain {braces} stay text.');
      // Highlighted code renders its braces as text rather than binding {$count}.
      expect(guide.replace(/<[^>]*>/g, '')).toContain('&lt;output&gt;{$count}&lt;/output&gt;');
      expect((await application.navigation()).map(item => item.label)).toEqual(['Welcome', 'about', 'The guide']);
    } finally { await application.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
