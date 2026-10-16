import { execFile } from 'node:child_process';

/**
 * The date (YYYY-MM-DD, the author date) of the last commit touching each file in `paths`, keyed by the file's path
 * relative to `root` with `/` separators. One `git log` reads the whole history of those paths, newest first, so the
 * first date seen for a file is its last change. Outside a git checkout, or without git, the map is empty. A shallow
 * clone dates every file from its oldest fetched commit, so a build that shows dates fetches the full history.
 */
export function lastUpdated(root: string, paths: readonly string[]): Promise<ReadonlyMap<string, string>> {
  return new Promise(done => execFile('git', ['log', '-z', '--format=%x01%as', '--name-only', '--no-renames', '--relative', '--', ...paths],
    { cwd: root, maxBuffer: 1 << 30 }, (error, stdout) => {
      const dates = new Map<string, string>();
      if (error) { done(dates); return; }
      // -z ends each name with NUL. A commit's header is \x01 and its date; its first name follows a newline.
      let date = '';
      for (const entry of stdout.split('\0')) {
        const name = entry.replace(/^\n/, '');
        if (name.startsWith('\x01')) date = name.slice(1);
        else if (name && !dates.has(name)) dates.set(name, date);
      }
      done(dates);
    }));
}
