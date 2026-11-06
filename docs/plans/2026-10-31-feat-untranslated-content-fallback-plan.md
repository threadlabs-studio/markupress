---
title: Untranslated content fallback
created: 2026-10-31
status: implementation-ready
parent: 2026-10-28-1030-feat-search-internationalization-parity-plan.md
---

# Untranslated content fallback

Readers can open a missing translation in the selected locale and version, read the default-language source with a translated notice, and continue navigating in that locale. This completes the source-content fallback portion of the search and internationalization parity goal.

This is an engineering interpretation of parity, not an individually approved API contract. [Starlight's fallback content](https://starlight.astro.build/guides/i18n/#fallback-content) serves default-language content at the missing translation's URL with an untranslated-content notice, allowing progressive translation. The behavior was checked on 31 October 2026.

## Behavior and acceptance

- `localeFallback: 'source'` enables default-locale fallback inside the same documentation version. Omission and `'home'` preserve the current locale-home behavior. Sites without configured locales retain their routes.
- A missing French or Arabic identity receives a native source alias beneath that locale's base and version. Its source article keeps its actual language and direction; surrounding controls, code actions, notices, dates, branding and document title use the selected interface locale.
- A real translation wins by document identity, including when its filename differs. No duplicate fallback is generated for that identity. Language and version switching preserve the selected identity whenever either a real translation or fallback exists.
- Fallback links resolve physical documents, assets and component imports relative to the original source. Document targets select the matching translated identity or fallback in the current locale and version. Authored code examples remain literal.
- Navigation, breadcrumbs, pager and search include available fallback pages at their selected-locale URLs. Search results remain inside the selected locale/version and page exclusions still apply.
- Fallback pages show a translated untranslated-content notice. Their canonical URL identifies the source page; hreflang and the sitemap list actual translations and owning pages, excluding fallback copies.
- Adding, renaming or deleting a translation during development recomputes fallback routes, identities, links and metadata without a stale compiled page.

## Ownership and implementation

MarkupKit owns routing and page-resource identity. Its directory aliases currently compile one physical file once, which cannot express locale-specific links or labels. First add opt-in page compilation scopes and pre-compilation source selection in MarkupKit, with independent tests for scoped URLs, immutable source catalogs, original-file imports/assets, canonical ownership, filtered aliases and build/development behavior. Existing unscoped mounts retain their current behavior. Exact native API names are implementation decisions.

Markupress owns locale and identity policy. After the native extension is published, select fallback mounts from source identities and compile their presentation in the selected locale. Use the native source catalog and URL resolver rather than adding a router or copying the source tree. Reuse Looma for the notice presentation.

## Verification and delivery

Prove missing and renamed translations across English, French and Arabic, two versions and a non-root base. Include an original relative asset/component, a literal code example, fallback search, reciprocal metadata and translation add/remove recovery. Exercise installed development, production and JavaScript-disabled consumers, including Arabic mobile layout and mixed content direction.

Run focused tests and `verify:inner`, then the full browser-enabled `verify:pr`. Review the owned diff once. Each owner or consumer PR must pass its checks, merge, publish through its trusted workflow and verify its deployed site before the next PR opens. Execution progress belongs in private records, outside this plan.
