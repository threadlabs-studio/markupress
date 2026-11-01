---
title: Contextual hosted search and final parity evidence
created: 2026-10-31
status: implementation-ready
parent: 2026-10-28-1030-feat-search-internationalization-parity-plan.md
---

# Contextual hosted search and final parity evidence

Documentation sites can query an Algolia-compatible index through their existing search dialog, keep results in the selected language and version, and retain local search without an account. This completes U6 of the search and internationalization plan.

These API choices are engineering interpretations of the user's parity goal, not independently approved requirements. The parent plan explicitly separates hosted-account provisioning from package integration. Authoring improvements remain excluded.

## Evidence and boundaries

- [Algolia's multiple-query API](https://www.algolia.com/doc/rest-api/search/search) accepts an index name and encoded search parameters with public search credentials.
- [Facet filters](https://www.algolia.com/doc/api-reference/api-parameters/facetFilters) combine a flat list with AND and require configured faceting attributes. Context must remain separate from optional application filters.
- [DocSearch's required record configuration](https://docsearch.algolia.com/docs/required-configuration/) defines hierarchy, content, URL, language and version fields. Its record schema is independent of the frontend package version.
- [Docusaurus contextual search](https://docusaurus.io/docs/search) scopes hosted results to the current language and documentation version.
- MarkupKit 0.5.0 already exposes additive CSP source directives. Markupress can add the specific Algolia connection origin while preserving user policy and native navigation. Looma owns the dialog and result controls.

These sources were checked on 31 October 2026. Keep assertions tied to the documented REST protocol instead of introducing a second UI runtime or depending on a vendor frontend SDK.

## Behavior and acceptance

1. `search` remains omitted/local by default and `false` disables it. An explicit Algolia provider accepts `appId`, a public search-only `apiKey`, `indexName`, optional application `filters`, result limit and adjustable request timing. Invalid or mixed local/hosted settings fail clearly.
2. Queries carry both the selected catalog language and version as mandatory facet filters. Optional application filters cannot replace context. Response mapping accepts DocSearch hierarchy/content/URL records, preserves literal text and grapheme boundaries, and discards wrong-context, unsafe or out-of-scope destinations.
3. Search uses the same localized Looma controls and keyboard behavior. Empty/error states, retry, request timeout, rapid queries, context changes, close and disconnect cannot expose stale results or leave work attached to a discarded controller.
4. External requests use only the configured application-specific HTTPS origin. CSP retains existing directives, local navigation/fetch capability and an explicit disabled policy. No vendor script or second component runtime is loaded.
5. Opt-in hosted sites export a deterministic `_algolia.json` snapshot with stable object IDs, contextual URLs, hierarchy, content, language and version. Search exclusions apply, and source-fallback records stay in their selected catalog. Document the required faceting and index replacement/import process.
6. The source owner remains canonical when several versions share one physical folder. Relative source canonical overrides resolve beside that owner. Language alternates identify actual translations and use the same ownership policy.
7. Installed dev and production consumers exercise the actual request boundary with deterministic provider responses, localized keyboard selection, language/version changes and failure recovery. Local configuration remains functional, including on the published site.
8. A representative larger multilingual corpus reports input counts/hashes, index bytes, parsing/index construction and query timings. Validate complete results outside timed sections and retain compact measurements. Do not claim a competitor speed advantage or attribute a performance quota to the user.
9. A final evidence map ties the parent plan's search and internationalization requirements to tests, releases and deployed behavior, with remaining external setup and limitations stated accurately.

## Delivery

Use one bounded single-agent review, focused checks and `verify:inner`, then the required installed/browser-enabled `verify:pr` gate. Qualify release artifacts with `npm pack`, matching the locally owned paired release runner. Publish one coherent PR only after 0.16.0's release/deployment evidence is complete, then pass checks, merge, verify both automatic npm packages and their source provenance, exercise an ordinary registry starter, and verify the deployed site. Execution progress belongs in private records outside this plan.
