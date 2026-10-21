import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { MarkupressOptions } from './site.js';

/** Types a `markupress.config.ts`: it returns its options unchanged. */
export function defineConfig(options: MarkupressOptions): MarkupressOptions { return options; }

const names = ['markupress.config.ts', 'markupress.config.js', 'markupress.config.json'];
/**
 * The site's configuration: `markupress.config.ts`, `.js` or `.json` in its root, or none. TypeScript and JavaScript load
 * through Vite, as HTMLKit loads `htmlkit.config.ts`, so a config imports its own files by their `.js` names.
 */
export async function loadConfig(root = process.cwd()): Promise<MarkupressOptions> {
  const files = names.map(name => resolve(root, name)).filter(existsSync);
  if (files.length > 1) throw new Error(`Choose one of ${names.join(', ')} in ${resolve(root)}.`);
  const file = files[0];
  if (file === undefined) return {};
  let options: unknown;
  if (file.endsWith('.json')) options = JSON.parse(await readFile(file, 'utf8'));
  else {
    const { createServer } = await import('vite');
    const loader = await createServer({ root: resolve(root), configFile: false, appType: 'custom', logLevel: 'silent',
      server: { middlewareMode: true, watch: null, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
    try { options = (await loader.ssrLoadModule(file)).default; } finally { await loader.close(); }
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new Error(`${file}: the configuration is an object of Markupress options.`);
  return options as MarkupressOptions;
}
