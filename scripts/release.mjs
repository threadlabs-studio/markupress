import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function packages(root) {
  const paths = [join(root, 'package.json')];
  const workspace = join(root, 'packages');
  if (existsSync(workspace)) {
    for (const entry of readdirSync(workspace, { withFileTypes: true })) {
      const path = join(workspace, entry.name, 'package.json');
      if (entry.isDirectory() && existsSync(path)) paths.push(path);
    }
  }
  return paths.map((path) => ({ root: dirname(path), manifest: JSON.parse(readFileSync(path)) }))
    .filter(({ manifest }) => manifest.private !== true && manifest.name && manifest.version);
}

function missing(result) {
  return result.status !== 0 && /E404|HTTP 404|release not found/i.test(result.stderr);
}

const root = resolve('.');
for (const candidate of packages(root)) {
  const id = candidate.manifest.name + '@' + candidate.manifest.version;
  const packed = run('npm', ['pack', '--json'], candidate.root);
  if (packed.status !== 0) throw new Error('Cannot inspect ' + id + ': ' + packed.stderr);
  const packageFile = JSON.parse(packed.stdout)[0];
  const expected = packageFile?.integrity;
  if (!expected || !packageFile.filename) throw new Error('npm pack did not report integrity for ' + id);

  const observed = run('npm', ['view', id, 'dist.integrity', '--json'], candidate.root);
  if (observed.status === 0) {
    const actual = JSON.parse(observed.stdout);
    if (actual !== expected) throw new Error('Immutable registry conflict for ' + id);
  } else if (missing(observed)) {
    const published = run(
      'npm',
      ['publish', packageFile.filename, '--provenance', '--access', 'public'],
      candidate.root,
    );
    if (published.status !== 0) throw new Error('Publication failed for ' + id + ': ' + published.stderr);
  } else {
    throw new Error('Registry state is unknown for ' + id + ': ' + observed.stderr);
  }

  const safeName = candidate.manifest.name.replace(/^@/, '').replaceAll('/', '-');
  const tag = safeName + '@' + candidate.manifest.version;
  const release = run('gh', ['release', 'view', tag], root);
  if (release.status === 0) continue;
  if (!missing(release)) throw new Error('Source release state is unknown for ' + tag);
  const created = run(
    'gh',
    ['release', 'create', tag, '--generate-notes', '--target', process.env.GITHUB_SHA ?? 'HEAD'],
    root,
  );
  if (created.status !== 0) throw new Error('Source release failed for ' + tag + ': ' + created.stderr);
}
