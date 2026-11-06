# Search and internationalization acceptance evidence

Markupress supports local typo-tolerant search, contextual Algolia search, versioned locale routes, translated reader controls, RTL layouts and optional source-content fallback. The acceptance contract is the [search and internationalization plan](../plans/2026-10-28-1030-feat-search-internationalization-parity-plan.md). Its requirements are an engineering interpretation of documentation-site parity.

## Comparison scope

Official documentation checked on 31 October 2026 establishes the comparison:

| Reference | Documentation-site capability used in the acceptance contract |
| --- | --- |
| [VitePress 1.6.4 search](https://vuejs.github.io/vitepress/v1/reference/default-theme-search) and [i18n](https://vuejs.github.io/vitepress/v1/guide/i18n) | MiniSearch local matching, optional Algolia, exclusions, locale routing and translated theme strings |
| [Docusaurus 3.10.2 search](https://docusaurus.io/docs/search) | First-class Algolia and contextual language/version filtering; local alternatives are community integrations |
| [Starlight search](https://starlight.astro.build/guides/site-search/) and [i18n](https://starlight.astro.build/guides/i18n/) | Default local indexing, exclusions, optional DocSearch, locale routes, source fallback and RTL |

Parity here means the reader and site-configuration behaviors below. It does not imply identical APIs, ranking, vendor UI features, search analytics or automatic translation. Account provisioning and hosted-index import remain explicit site operations. The [search guide](../../website/docs/en/01.guide/08.search.md) specifies the supported provider contract and setup.

## Requirement evidence

| Requirement | Implemented behavior | Regression and installed-consumer evidence |
| --- | --- | --- |
| R1 | Prefix/typo search, title/heading boosts, original-text snippets | [Matching tests](../../tests/search.test.ts); installed keyboard search in [package tests](../../tests/package.test.ts) |
| R2 | Page/subtree exclusions, search disable, validated matching/result settings | [Content tests](../../tests/content.test.ts), [site tests](../../tests/site.test.ts), [configuration tests](../../tests/search-config.test.ts); hosted export exclusions in [hosted-site tests](../../tests/hosted-site.test.ts) |
| R3 | Native result buttons, arrow/Enter selection, shortcuts, localized idle/empty/error status, retry and stale-response suppression | [Controller tests](../../tests/search-controller.test.ts), [provider tests](../../tests/algolia.test.ts); installed local/hosted browser flows and accessibility checks in package tests |
| R4 | Language/version isolation beneath non-root bases, accent folding, native CJK segmentation | Matching, site, provider and installed locale/hosted tests; [reproducible corpus](search-corpus.json) |
| R5 | Opt-in Algolia REST requests with public search-only credentials, mandatory context facets, safe URL/text mapping and explicit export/import | Provider, [policy](../../tests/search-policy.test.ts), hosted-site and installed dev/production network tests; local browser flows remain in the same package gate |
| R6 | Default locale at root, prefixed translations, version-specific discovery, unchanged unlocalized routing | Site tests and installed locale consumers |
| R7 | Identity-based language/version switching, renamed routes, explanatory locale-home fallback or opt-in source content | [Fallback tests](../../tests/fallback.test.ts), [version tests](../../tests/versions.test.ts), installed locale and source-fallback flows |
| R8 | English/French/Arabic defaults, partial dictionaries, plural search status, code/appearance labels and locale dates | [Translation tests](../../tests/i18n.test.ts), controller/site tests, installed multilingual code actions and dates |
| R9 | Source canonical ownership, real-only reciprocal language alternates, language/direction metadata, local branding/navigation | Site/fallback tests include shared-folder versions and relative canonical overrides; installed language switching and no-JavaScript pages |
| R10 | RTL reading edge, mirrored navigation, logical focus order, isolated code, responsive locale controls | [Style tests](../../tests/styles.test.ts); installed Arabic desktop/mobile, drawer and keyboard checks; owning Looma regressions |
| R11 | Focused checks, inner/PR gates, packed dev/production/browser consumers, paired merge-triggered release | [CI](../../.github/workflows/ci.yml), [browser proof](../../.github/workflows/browser.yml), [release runner](../../scripts/release.mjs), [release regressions](../../tests/release.test.ts) |
| R12 | Public configuration, limits, fallback and provider setup describe delivered behavior | Search, [languages](../../website/docs/en/01.guide/09.languages.md), [configuration](../../website/docs/en/02.reference/01.configuration.md) and [API](../../website/docs/en/02.reference/03.api.md) guides |

Local search shipped in [PR 95](https://github.com/threadlabs-studio/markupress/pull/95), locale routes in [PR 96](https://github.com/threadlabs-studio/markupress/pull/96), reader internationalization in [PR 103](https://github.com/threadlabs-studio/markupress/pull/103), and source fallback in [PR 104](https://github.com/threadlabs-studio/markupress/pull/104). Their paired package versions are 0.13.0, 0.14.0, 0.15.0 and 0.16.0 respectively. Hosted search and the shared-folder canonical correction are the 0.17.0 acceptance increment. Registry provenance identifies each automatic publication's exact source commit; workflow and deployment results remain the delivery authority.

## Reproduce the corpus measurement

Run `corepack pnpm build`, then `node scripts/search-corpus.mjs docs/verification/search-corpus.json`. The deterministic synthetic corpus contains 500 pages per language/version, four sections per page, English/French/Arabic/Chinese and two versions: 4,000 contextual pages and 16,000 sections overall. Each language/version remains its own browser index. The corpus repeats template prose with unique section probes, so its gzip sizes are smaller than a similarly sized collection of varied real prose.

The script validates every extracted section and JSON round trip outside timing regions, records source/index SHA-256 values and checks complete query result snapshots before and after timing. It reports UTF-8 and gzip bytes, Markdown compilation, JSON parsing, index construction, median and 95th-percentile warm-query times. The compact report includes the Node version and CPU. Raw synthetic content is regenerated rather than retained.

These are Node measurements of a synthetic workload. Browser startup, device memory, network transfer and hosted-service latency require measurement on the site's content and reader devices. There is no competitor speed comparison or universal performance threshold.
