import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const manifestPaths = ['package.json', 'packages/create-markupress/package.json'];
const releaseFiles = [...manifestPaths, 'packages/create-markupress/template/package.json', 'CHANGELOG.md'];
const readJSON = file => JSON.parse(readFileSync(file, 'utf8'));
const writeJSON = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const missing = result => result.status !== 0 && /E404|HTTP 404|release not found/i.test(result.stderr);
function run(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', shell: false });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
const checked = (execute, program, args, root) => {
  const result = execute(program, args, root);
  if (result.status !== 0) throw new Error(`${program} ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
};
const versionParts = version => {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Expected a stable release version: ${version}`);
  const values = version.split('.').map(Number);
  if (!values.every(Number.isSafeInteger)) throw new Error(`Invalid release version: ${version}`);
  return values;
};
const compareParts = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const sourceTag = source => {
  if (!/^[a-f0-9]{40}$/.test(source ?? '')) throw new Error('A full source commit is required.');
  return `release-source-${source}`;
};
const packages = root => manifestPaths.map(file => ({ file, root: resolve(root, file, '..'), manifest: readJSON(join(root, file)) }));

/** Keep reviewed larger bumps; otherwise advance beyond every published paired package. */
export function nextReleaseVersion(declared, published) {
  const desired = versionParts(declared);
  const latest = published.map(versionParts).sort(compareParts).at(-1);
  if (!latest || compareParts(desired, latest) > 0) return declared;
  if (!Number.isSafeInteger(latest[2] + 1)) throw new Error('Patch version overflow.');
  return [latest[0], latest[1], latest[2] + 1].join('.');
}

/** Freeze a source-specific snapshot so retries never choose another version after partial success. */
export function prepareRelease({ root, source, execute = run }) {
  const tag = sourceTag(source);
  const git = (...args) => checked(execute, 'git', args, root);
  if (git('status', '--porcelain')) throw new Error('Release preparation requires a clean checkout.');
  const existing = git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`);
  if (existing) {
    git('fetch', '--no-tags', 'origin', `refs/tags/${tag}`);
    git('checkout', '--detach', 'FETCH_HEAD');
  } else {
    if (git('rev-parse', 'HEAD') !== source) throw new Error('The checkout must match the release source.');
    const candidates = packages(root);
    const declared = candidates[0].manifest.version;
    if (candidates.some(candidate => candidate.manifest.version !== declared)) throw new Error('Markupress and its starter must declare the same version.');
    const latest = candidates.map(({ manifest }) => JSON.parse(checked(execute, 'npm', ['view', manifest.name, 'version', '--json'], root)));
    const version = nextReleaseVersion(declared, latest);
    for (const candidate of candidates) writeJSON(join(root, candidate.file), { ...candidate.manifest, version });
    const template = join(root, 'packages/create-markupress/template/package.json');
    const starter = readJSON(template); starter.dependencies.markupress = '^' + version; writeJSON(template, starter);
    const changelog = join(root, 'CHANGELOG.md');
    const text = readFileSync(changelog, 'utf8');
    if (!text.split('\n').some(line => line === `## ${version}`)) {
      const position = text.search(/^## /m);
      if (position < 0) throw new Error('CHANGELOG.md must contain a release heading.');
      if (/^## Next release$/m.test(text)) writeFileSync(changelog, text.replace(/^## Next release$/m, `## ${version}`));
      else writeFileSync(changelog, text.slice(0, position) + `## ${version}\n\n- Release the verified changes merged in ${source}.\n\n` + text.slice(position));
    }
    git('add', '--', ...releaseFiles);
    if (git('diff', '--cached', '--name-only')) {
      git('-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', `chore: prepare ${version} from ${source}`, '--', ...releaseFiles);
    }
  }
  return { tag, commit: git('rev-parse', 'HEAD'), version: readJSON(join(root, 'package.json')).version };
}

/** Publish only verified snapshots, checking immutable registry integrity on every retry. */
export function publishRelease({ root, source, execute = run }) {
  const tag = sourceTag(source);
  const commit = checked(execute, 'git', ['rev-parse', 'HEAD'], root);
  if (checked(execute, 'git', ['status', '--porcelain'], root)) throw new Error('The verified release snapshot has uncommitted changes.');
  checked(execute, 'git', ['push', 'origin', `${commit}:refs/tags/${tag}`], root);
  for (const candidate of packages(root)) {
    const id = `${candidate.manifest.name}@${candidate.manifest.version}`;
    const packed = JSON.parse(checked(execute, 'npm', ['pack', '--json'], candidate.root))[0];
    if (!packed?.integrity || !packed.filename) throw new Error(`npm pack did not report integrity for ${id}.`);
    const latest = JSON.parse(checked(execute, 'npm', ['view', candidate.manifest.name, 'version', '--json'], candidate.root));
    const historical = compareParts(versionParts(candidate.manifest.version), versionParts(latest)) < 0;
    const observed = execute('npm', ['view', id, 'dist.integrity', '--json'], candidate.root);
    if (observed.status === 0) {
      if (JSON.parse(observed.stdout) !== packed.integrity) throw new Error(`Immutable registry conflict for ${id}.`);
    } else if (missing(observed)) {
      checked(execute, 'npm', ['publish', packed.filename, '--provenance', '--access', 'public', '--tag', historical ? `release-${candidate.manifest.version}` : 'latest'], candidate.root);
    } else throw new Error(`Registry state is unknown for ${id}: ${observed.stderr}`);
    const released = execute('gh', ['release', 'view', id], root);
    if (released.status === 0) continue;
    if (!missing(released)) throw new Error(`Source release state is unknown for ${id}: ${released.stderr}`);
    checked(execute, 'gh', ['release', 'create', id, '--generate-notes', '--target', commit, ...(historical ? ['--latest=false'] : [])], root);
    console.log(`Released ${id} from ${commit}.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REPOSITORY !== 'threadlabs-studio/markupress') throw new Error('Releases run only through this repository’s GitHub Actions workflow.');
  const input = { root: resolve('.'), source: process.env.GITHUB_SHA };
  if (process.argv[2] === 'prepare') {
    const prepared = prepareRelease(input);
    if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `MARKUPRESS_RELEASE_COMMIT=${prepared.commit}\n`);
    console.log(`Prepared ${prepared.version} at ${prepared.commit}.`);
  } else if (process.argv[2] === 'publish') {
    const actual = checked(run, 'git', ['rev-parse', 'HEAD'], input.root);
    if (!process.env.MARKUPRESS_RELEASE_COMMIT || process.env.MARKUPRESS_RELEASE_COMMIT !== actual) throw new Error('The verified release snapshot changed before publication.');
    publishRelease(input);
  } else throw new Error('Choose prepare or publish.');
}
