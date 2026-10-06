#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildSite, devSite, previewSite, type MarkupressOptions } from './site.js';
import { snapshotVersion } from './versions.js';

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    root: { type: 'string' }, base: { type: 'string' }, port: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) { process.stdout.write('Usage: markupress build|dev|preview [--root directory] [--base /docs/] [--port 3000]\n       markupress snapshot <version-id> [--root directory]\nConfiguration: markupress.config.json\n'); return; }
  const root = resolve(values.root ?? process.cwd());
  let config: MarkupressOptions = {};
  try { config = JSON.parse(await readFile(resolve(root, 'markupress.config.json'), 'utf8')) as MarkupressOptions; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const options: MarkupressOptions = { ...config, root, ...(values.base === undefined ? {} : { base: values.base }),
    ...(values.port === undefined ? {} : { port: Number(values.port) }) };
  const command = positionals[0] ?? 'dev';
  if (command === 'snapshot') {
    if (!positionals[1]) throw new Error('snapshot requires a version id.');
    const version = await snapshotVersion(positionals[1], options); process.stdout.write(`Recorded ${version.id} in ${version.directory}\n`); return;
  }
  if (command === 'build') {
    const built = await buildSite(options); process.stdout.write(`Generated ${built.routes.length} pages in ${built.outDir}\n`); return;
  }
  if (command !== 'dev' && command !== 'preview') throw new Error(`Unknown command: ${command}. Use build, dev, or preview.`);
  const server = await (command === 'dev' ? devSite(options) : previewSite(options));
  process.stdout.write(`Markupress ${command}: ${server.url}\n`);
  const close = () => { void server.close().then(() => process.exit(0)); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
void main().catch(error => { process.stderr.write(`${String(error)}\n`); process.exitCode = 1; });
