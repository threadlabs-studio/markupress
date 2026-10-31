import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const { nextReleaseVersion, prepareRelease, publishRelease } = await import(pathToFileURL(join(process.cwd(), 'scripts/release.mjs')).href);
const command = (program: string, args: string[], cwd: string) => {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
};

describe('merge releases', () => {
  it('advances published versions and preserves a larger version declared by the PR', () => {
    expect(nextReleaseVersion('0.8.0', ['0.8.0', '0.8.0'])).toBe('0.8.1');
    expect(nextReleaseVersion('0.9.0', ['0.8.3', '0.8.3'])).toBe('0.9.0');
    expect(nextReleaseVersion('0.8.0', ['0.8.3', '0.8.2'])).toBe('0.8.4');
    expect(() => nextReleaseVersion('0.9.0-beta.1', ['0.8.0'])).toThrow(/stable/);
  });

  it.each(['lost-response', 'missing-older'])('freezes a paired snapshot and resumes partial publication (%s)', failure => {
    const directory = mkdtempSync(join(tmpdir(), 'markupress-release-'));
    const root = join(directory, 'project');
    const remote = join(directory, 'remote.git');
    mkdirSync(join(root, 'packages/create-markupress/template'), { recursive: true });
    const json = (file: string, value: unknown) => writeFileSync(join(root, file), JSON.stringify(value, null, 2) + '\n');
    json('package.json', { name: 'markupress', version: '0.8.0', devDependencies: { '@nextwebwg/html-next': '>=1.0.0-alpha.71' }, peerDependencies: { '@threadlabs/looma': '>=0.44.0' } });
    json('packages/create-markupress/package.json', { name: 'create-markupress', version: '0.8.0' });
    json('packages/create-markupress/template/package.json', { private: true, dependencies: { markupress: '^0.8.0' } });
    writeFileSync(join(root, 'CHANGELOG.md'), '# Changelog\n\n## Next release\n\nNew behavior.\n\n## 0.8.0\n\nFirst release.\n');
    const git = (...args: string[]) => {
      const result = command('git', args, root);
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    const published = new Set<string>();
    const releases = new Set<string>();
    let publishCount = 0;
    const tags: string[] = [];
    let latest = '0.8.0';
    let corrupt = false;
    const execute = (program: string, args: string[], cwd: string) => {
      if (program === 'npm') {
        if (args[0] === 'pack') return { status: 0, stdout: JSON.stringify([{ filename: 'package.tgz', integrity: 'sha512-reviewed' }]), stderr: '' };
        if (args[0] === 'view' && args[2] === 'version') return { status: 0, stdout: JSON.stringify(latest), stderr: '' };
        if (args[0] === 'view') return published.has(args[1]!) ? { status: 0, stdout: JSON.stringify(corrupt ? 'sha512-conflict' : 'sha512-reviewed'), stderr: '' } : { status: 1, stdout: '', stderr: 'E404' };
        if (args[0] === 'publish') {
          const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
          publishCount++; tags.push(args[args.indexOf('--tag') + 1]!);
          if (publishCount === 2 && failure === 'missing-older') return { status: 1, stdout: '', stderr: 'temporary outage' };
          published.add(`${manifest.name}@${manifest.version}`);
          if (publishCount === 2) return { status: 1, stdout: '', stderr: 'temporary outage' };
          return { status: 0, stdout: '', stderr: '' };
        }
      }
      if (program === 'gh') {
        if (args[1] === 'view') return { status: releases.has(args[2]!) ? 0 : 1, stdout: '', stderr: 'release not found' };
        releases.add(args[2]!); return { status: 0, stdout: '', stderr: '' };
      }
      return command(program, args, cwd);
    };
    try {
      git('init', '--initial-branch=main');
      git('config', 'user.name', 'Release fixture'); git('config', 'user.email', 'fixture@example.test');
      git('add', 'package.json', 'packages', 'CHANGELOG.md'); git('commit', '-m', 'Initial source');
      git('init', '--bare', remote); git('remote', 'add', 'origin', remote); git('push', '-u', 'origin', 'main');
      const source = git('rev-parse', 'HEAD');
      const prepared = prepareRelease({ root, source, execute });
      expect(prepared.version).toBe('0.8.1');
      expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toContain('## 0.8.1');
      expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).not.toContain('## Next release');
      expect(JSON.parse(readFileSync(join(root, 'packages/create-markupress/template/package.json'), 'utf8')).dependencies.markupress).toBe('>=0.8.1');
      expect(JSON.parse(readFileSync(join(root, 'packages/create-markupress/template/package.json'), 'utf8')).dependencies).toMatchObject({ '@nextwebwg/html-next': '>=1.0.0-alpha.71', '@threadlabs/looma': '>=0.44.0' });
      expect(() => publishRelease({ root, source, execute })).toThrow(/temporary outage/);
      latest = failure === 'missing-older' ? '0.8.2' : '0.8.1';
      git('checkout', 'main');
      const resumed = prepareRelease({ root, source, execute });
      expect(resumed.commit).toBe(prepared.commit);
      expect(resumed.version).toBe('0.8.1');
      publishRelease({ root, source, execute });
      expect(publishCount).toBe(failure === 'missing-older' ? 3 : 2);
      expect(releases.size).toBe(2);
      if (failure === 'missing-older') expect(tags.at(-1)).toBe('release-0.8.1');
      corrupt = true;
      expect(() => publishRelease({ root, source, execute })).toThrow(/Immutable registry conflict/);
      expect(publishCount).toBe(failure === 'missing-older' ? 3 : 2);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('publishes from verified main pushes without a per-release approval input', () => {
    const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
    expect(workflow).toMatch(/push:\n\s+branches: \[main\]/);
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('node scripts/release.mjs prepare');
    expect(workflow.indexOf('pnpm verify:release')).toBeLessThan(workflow.indexOf('node scripts/release.mjs publish'));
    expect(workflow).not.toContain('inputs.approve');
  });
});
