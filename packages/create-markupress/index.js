#!/usr/bin/env node
// @ts-check
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies the starter site into a new folder: `npm create markupress@latest <folder>`. The starter's package.json depends
 * on the Markupress release this package shares its version with, and on the required HTML Next artifact and compatible Looma versions.
 */
const template = fileURLToPath(new URL('./template', import.meta.url));
const folder = process.argv[2] ?? 'docs';
const target = resolve(folder);
if (existsSync(target) && readdirSync(target).length > 0) {
  process.stderr.write(`${target} already has files. Choose a new or empty folder: npm create markupress@latest my-docs\n`);
  process.exit(1);
}
cpSync(template, target, { recursive: true });
// npm leaves .gitignore files out of a package, so the starter's is stored as _gitignore.
renameSync(join(target, '_gitignore'), join(target, '.gitignore'));
const manifest = join(target, 'package.json');
const name = basename(target).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+/, '') || 'docs';
writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('"name": "markupress-site"', `"name": ${JSON.stringify(name)}`));
const where = relative(process.cwd(), target) || '.';
process.stdout.write(`Created a Markupress site in ${where}.\n\n  cd ${where}\n  npm install\n  npm run dev\n\n`);
