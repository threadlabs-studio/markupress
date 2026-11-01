import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { compileMarkdown } from '../dist/content.js';
import { createSearch } from '../dist/search.js';

// Deterministic synthetic documentation, not a competitor comparison or a speed gate.
const pages = 500, versions = ['current', 'v1'];
const samples = {
  en: ['Installation', 'Configure the package and documentation navigation. Café résumé and literal examples 👩🏽‍💻.'],
  fr: ['Installation française', 'Configurer le paquet et la navigation de documentation. Café résumé et exemples 👩🏽‍💻.'],
  ar: ['التثبيت', 'تهيئة الحزمة والتنقل في الوثائق مع أمثلة واضحة ولغات متعددة. 👩🏽‍💻'],
  zh: ['安装指南', '如何安装软件和配置项目。文档导航与多语言搜索，以及完整的示例。👩🏽‍💻'],
};
const hash = value => createHash('sha256').update(value).digest('hex');
const measured = async operation => { const start = performance.now(); const result = await operation(); return { result, ms: performance.now() - start }; };
const catalogs = [];
for (const [language, [title, body]] of Object.entries(samples)) {
  const sources = Array.from({ length: pages }, (_, page) => `# ${title} ${page}\n\n${body.repeat(5)}\n\n` +
    [1, 2, 3].map(section => `## ${title} ${page} ${section}\n\n${body.repeat(5)}\n\ncorpus${page}section${section}\n`).join('\n'));
  const compiled = await measured(async () => {
    const result = [];
    for (const [page, source] of sources.entries()) result.push(await compileMarkdown(source, { file: `/corpus/${language}/${page}.md`, pageName: `corpus-${language}-${page}` }));
    return result;
  });
  // Validate all extracted sections outside timing. Each page has one title and three subheadings.
  assert.equal(compiled.result.length, pages);
  for (const [page, document] of compiled.result.entries()) {
    assert.equal(document.sections.length, 4);
    assert.equal(document.title, `${title} ${page}`);
    assert(document.sections.every(section => section.text.includes(body)));
    for (const section of [1, 2, 3]) assert(document.sections.some(entry => entry.text.includes(`corpus${page}section${section}`)));
  }
  for (const version of versions) {
    const entries = compiled.result.flatMap((document, page) => document.sections.map(section => ({
      href: `/manual/${language}/v/${version}/page-${page}/#${section.id}`, page: document.title, heading: section.heading, text: section.text,
    })));
    const json = JSON.stringify(entries), parsed = await measured(() => JSON.parse(json));
    assert.deepEqual(parsed.result, entries);
    const built = await measured(() => createSearch(parsed.result, {}, language));
    const queries = ['corpus0section1', 'corpus249section2', 'corpus499section3', language === 'zh' ? '软件' : language === 'ar' ? 'الحزمة' : 'cafe'];
    const expected = queries.map(query => built.result(query));
    for (const [index, results] of expected.entries()) {
      assert(results.length > 0);
      for (const result of results) {
        assert(result.href.startsWith(`/manual/${language}/v/${version}/`));
        assert(entries.some(entry => entry.href === result.href && entry.heading === result.heading));
        assert(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(result.excerpt));
      }
      if (index < 3) assert(results[0].excerpt.includes(queries[index]));
    }
    const times = [];
    for (let iteration = 0; iteration < 25; iteration++) for (const query of queries) {
      const start = performance.now(); built.result(query); times.push(performance.now() - start);
    }
    // Revalidate deterministic complete output after measurement, never in the timed region.
    assert.deepEqual(queries.map(query => built.result(query)), expected);
    times.sort((a, b) => a - b);
    catalogs.push({ language, version, pages, sections: entries.length, sourceSHA256: hash(sources.join('\0')), indexSHA256: hash(json),
      jsonBytes: Buffer.byteLength(json), gzipBytes: gzipSync(json).byteLength, markdownCompileMs: compiled.ms,
      jsonParseMs: parsed.ms, indexBuildMs: built.ms, querySamples: times.length, queryMedianMs: times[Math.floor(times.length / 2)],
      queryP95Ms: times[Math.floor(times.length * .95)], validatedResultsSHA256: hash(JSON.stringify(expected)) });
  }
}
const report = { node: process.version, cpu: cpus()[0]?.model, generatedAt: new Date().toISOString(),
  kind: 'deterministic synthetic corpus; Node timings, no browser or competitor speed claim',
  pages: pages * Object.keys(samples).length * versions.length, sections: catalogs.reduce((sum, catalog) => sum + catalog.sections, 0), catalogs };
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
