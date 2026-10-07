import { expect, it } from 'vitest';
import { stylesheet } from '../src/styles.js';

it('resolves CSS imports and asset URLs without changing comments, remote URLs or data URLs', () => {
  const parsed = stylesheet('/* url(fake.svg) */ @import "./nested.css" screen; .demo { background: url("./image.svg#mark"); mask: url(data:image/svg+xml,test); color: red; }', '/project/docs/demo.md', true);
  expect(parsed.files).toEqual(['/project/docs/nested.css', '/project/docs/image.svg']);
  expect(parsed.css).toContain('file:///project/docs/nested.css');
  expect(parsed.css).toContain('file:///project/docs/image.svg#mark');
  expect(parsed.css).toContain('/* url(fake.svg) */');
  expect(parsed.css).toContain('data:image/svg+xml,test');
});
