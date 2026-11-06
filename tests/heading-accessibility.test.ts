import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { renderMarkdown } from '../src/content.js';

it.skipIf(process.env.MARKUPRESS_BROWSER_TEST !== '1')('names headings once while retaining authored links and keyboard permalinks', async () => {
  const rendered = await renderMarkdown('# Install [**package**](https://example.com/package) &amp; run()\n\n## Configure', { file: '/docs/install.md' });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(rendered.html);
    expect(await page.getByRole('heading', { level: 1, name: 'Install package & run()', exact: true }).count()).toBe(1);
    expect(await page.getByRole('heading', { level: 2, name: 'Configure', exact: true }).count()).toBe(1);
    expect(await page.getByRole('link', { name: 'package', exact: true }).getAttribute('href')).toBe('https://example.com/package');
    const permalink = page.locator('h1 .heading-anchor');
    expect(await permalink.getAttribute('aria-label')).toBe('Install package & run()');
    await permalink.focus();
    expect(await permalink.evaluate(link => link === document.activeElement)).toBe(true);
    expect(await permalink.getAttribute('href')).toBe('#install-package-run');
  } finally { await browser.close(); }
});
