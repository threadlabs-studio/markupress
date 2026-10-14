---
title: Markupress 1.0 definition
type: feat
date: 2026-10-14
artifact_contract: ce-unified-plan/v1
execution: code
---

# Markupress 1.0 definition

## Goal Capsule

- **Objective:** Markupress 1.0 is a documentation tool a VitePress or Docusaurus
  user can adopt without missing the essentials. It adds what they don't have:
  native HTML Next components in Markdown, and versions.
- **Means:** Markdown on HTMLKit, with a Looma theme. Callouts and other styled
  blocks share one vocabulary with LoomaEditor and Knit.
- **Order:** Looma's documentation site (Docusaurus 3.9 today) is the first real
  consumer. Its staged migration decides what is built first, so the tool gets
  used while it grows.
- **Authority:** owner direction (2026-10-14); this repository's AGENTS.md; the
  [platform plan](./2026-10-04-1830-feat-markupress-platform-plan.md), whose
  R1–R12 this builds on; the
  [HTMLKit 1.0 definition](https://github.com/nextwebwg/html-next/blob/main/docs/plans/2026-10-14-htmlkit-1.0-definition.md)
  for platform features.

## What 1.0 means

A feature is in 1.0 when VitePress 1.6 and Docusaurus 3.10 both ship it by default
or in their main guide, and a typical open-source documentation site needs it.
Local search is also in, because VitePress, Starlight and Nextra all ship it.
"Today" describes `origin/main` (`5b2656a`, package 0.0.2, which depends on HTMLKit
alpha.41).

### Content

| # | Feature | Today | 1.0 |
|---|---|---|---|
| C1 | GFM: tables, task lists, strikethrough, autolinks, footnotes | Partial (no footnotes; task lists unverified) | **In** |
| C2 | Front matter: `title`, `description`, `sidebarLabel`, `sidebarPosition`, `sidebarHidden`, `id`, `aliases`, `layout`, `toc` (false or a heading range), `head` (meta, og, canonical), `editLink` | Partial | **In** |
| C3 | Heading anchors and `{#id}` | Present | Keep; add a visible anchor link on hover and focus |
| C4 | Callouts: note, tip, info, important, warning, danger (`caution` is an alias), with a custom title. `::: tip Title … :::` and GitHub `> [!NOTE]` alerts render the shared Looma blocks (see "Shared block vocabulary"). | Partial (an unstyled `<div>`) | **In** |
| C5 | Collapsible details (`::: details Title`) | Missing | **In** (shared vocabulary) |
| C6 | Tabs and code groups (`::: tabs`, `::: code-group`), with selection synced across the page and remembered | Missing | **In**: Looma's Examples/API tabs and install tabs need it |
| C7 | Code blocks: Shiki (dual theme), titles, line highlighting `{1,3-5}` and `// [!code highlight]`, line numbers, a copy button, word wrap | Partial (Shiki and titles only) | **In** |
| C8 | Diff and focus markers, and code imports (`<<< ./file{lines}`) | Missing | Out: 1.1 |
| C9 | Native HTML Next components in Markdown, with TypeScript controllers | Present | Keep (headline feature) |
| C10 | Images and assets (relative paths, `public/`, hashed) | Present | Keep; fix root-relative links ignoring `base` |
| C11 | Includes, math, Mermaid | Missing | Out: 1.1, through the Markdown extension hook (D5) |

### Navigation

| # | Feature | Today | 1.0 |
|---|---|---|---|
| N1 | Sidebar generated from the file tree, ordered by `01.` | Present (flat) | Keep |
| N2 | Sidebar groups: labeled, collapsible, ordered by a folder's `_category` metadata, or by HTMLKit route groups | Missing | **In** |
| N3 | One sidebar per section (`/components/`, `/editor/`), with an optional explicit sidebar in config | Missing | **In** |
| N4 | Top navigation: logo, title, links, dropdowns, version badge, social links | Missing | **In** |
| N5 | Breadcrumbs and the previous/next pager | Present (HTMLKit) | Keep; front matter can drop the pager |
| N6 | Right-hand "on this page" outline, with the active heading tracked | Missing | **In** |
| N7 | Mobile navigation drawer | Partial (an inline toggle, open by default) | **In** |
| N8 | "Edit this page" link | Missing | **In** |
| N9 | Last-updated date from git | Missing | **In** |
| N10 | Themed 404, rendered in the site shell (HTMLKit R7) | Partial (bare HTML) | **In** |

### Theme

| # | Feature | Today | 1.0 |
|---|---|---|---|
| T1 | Default Looma theme: accessible landmarks, skip link, responsive, light and dark | Present (sparse) | Polish: inline code, blockquotes, tables, prose rhythm |
| T2 | Dark mode with no flash | Present | Keep |
| T3 | Customization through Looma `--ui-*` tokens and a documented Markupress token set | Partial (undocumented) | **In** |
| T4 | A layout override: a site layout can replace the shell and still receive Markupress's loader data (navigation, crumbs, pager, outline, page metadata) | Missing | **In**: nextwebwg.org needs its own design |
| T5 | Home layout (`layout: home`): hero (title, tagline, image, actions) and feature cards | Missing | **In** |
| T6 | Footer: links in columns, plus copyright | Missing | **In** |
| T7 | Logo (light and dark) and favicon config | Missing | **In** |
| T8 | Announcement bar | Missing | Out |

### Search and site

| # | Feature | Today | 1.0 |
|---|---|---|---|
| S1 | Local full-text search: a build-time index plus a search dialog with keyboard shortcut and per-version filtering | Missing | **In** |
| S2 | Algolia DocSearch | Missing | Out: 1.1 config option |
| S3 | Versioning: snapshots, a switcher, document identity | Present | Keep (headline feature) |
| S4 | Sitemap (HTMLKit S2) and per-page SEO head (front matter `head`, `description`, canonical) | Missing | **In** |
| S5 | Base path and clean URLs | Present | Keep |
| S6 | Broken-link and anchor check at build (HTMLKit V8, plus Markdown `.md` targets) | Partial (`.md` targets only) | **In** |
| S7 | Redirects: `redirects` config and front matter `redirectFrom`, emitted as static redirect pages (HTMLKit R9). `aliases` keep serving the same content, with a canonical link. | Partial (`aliases` only) | **In**: Looma's old flat URLs need it |
| S8 | i18n: locale folders, a locale switcher, RTL | Missing | Out: 1.1. Neither the Looma docs nor nextwebwg.org need it. |
| S9 | Blog and RSS | Missing | Out |

### Developer experience

| # | Feature | Today | 1.0 |
|---|---|---|---|
| D1 | `npm create markupress@latest`: a starter site with a home page, guide pages, a component and the config | Missing | **In** |
| D2 | `dev`, `build`, `preview`, `snapshot` | Present | Keep; document the flags |
| D3 | Typed config: `markupress.config.ts` with `defineConfig`. JSON stays accepted. | Missing (JSON only) | **In** |
| D4 | One config path: the `markupress` CLI also reads an `htmlkit.config.ts`, so plugins compose | Missing | **In** |
| D5 | Markdown extension hook (Marked extensions and Shiki transformers) | Missing | **In** |
| D6 | Published release on npm with current HTMLKit, HTML Next and Looma, with Looma and HTML Next as peer dependencies | Missing (0.0.2 predates #7) | **In** |
| D7 | Deploy guides: GitHub Pages, Vercel, Netlify, and any static host with a base path | Missing | **In** |

### Documentation

| # | Page | 1.0 |
|---|---|---|
| G1 | A Markupress documentation site, built with Markupress and deployed by CI (dogfood). `examples/site` becomes a test fixture, built in CI. | **In** |
| G2 | Getting started: `create`, project structure, dev, build, preview | **In** |
| G3 | Writing: front matter reference, Markdown syntax, callouts and blocks, code blocks, components in Markdown, links and assets | **In** |
| G4 | Navigation: sidebar, groups and sections, top navigation, outline, aliases | **In** |
| G5 | Versions: snapshots, `versions.json`, the switcher and its fallback | **In** |
| G6 | Theme: tokens, the home layout, overriding the layout, the footer and logo | **In** |
| G7 | Search, SEO and deployment | **In** |
| G8 | Reference: config options and defaults, CLI, programmatic API (`markupress()`, `markdown()`, `buildSite`, `snapshotVersion`, `compileMarkdown`) | **In** |
| G9 | Migrating from Docusaurus and VitePress: syntax, sidebars, front matter keys | **In** |

### Docs corrections to land first (audit, 2026-10-14)

- **README:**
  - "only reserves the name" is stale; say what is published.
  - Separate "use Markupress" from "build from source".
  - State the defaults: `base /`, `outDir site`, `contentDir docs`, the title,
    and the "Current" label.
  - Document `markdown()`'s `publicDir` and `onPage`.
- **CHANGELOG:** add the 0.0.2 entry, and keep later work under the next version.
- **The 2026-10-04 plan:** correct prefixes from hyphens to dots, `<hk-nav>` (not
  `htmlkit-navigation`), page-tag derivation, and the source layout. Mark R1–R10
  done and R11 and R12 partial.
- **AGENTS.md:** remove `docs/solutions` or create it; fix the stale ownership path
  `tests/index.test.ts`.

## Shared block vocabulary

Owner direction, 2026-10-14: callouts and other styled blocks are one vocabulary,
shared by Markupress's Markdown, LoomaEditor's slash commands, Looma's components
and Knit. One block looks identical everywhere, and a new block type reaches every
platform at once.

| Block | Looma component | Markdown | LoomaEditor |
|---|---|---|---|
| Callout: note, tip, info, important, warning, danger (`caution` is an alias), optional title | `ui-callout` with `tone` and a title slot | `::: tip Title` … `:::`, and `> [!TIP]` | Callout node rendered as `ui-callout`; a slash command per tone; Markdown import and export |
| Details | a disclosure component (or native `<details>` styled by Looma) | `::: details Title` | The existing expand node, given its Markdown form |
| Tabs and code group | a tabs component that syncs selection across the page | `::: tabs` / `::: code-group` with `== Label` panels | Out of the editor's 1.0 |

**Today:**
- `ui-callout` has the tones info, neutral, note, warning, success and danger,
  and no title slot.
- The editor's callout node renders its own `aside[data-looma-callout]`, with the
  tones info, note and warning only.
- The editor imports Markdown on paste only, with no `:::` handling and no export.

**Ownership:**
- **Looma** owns the components and the editor work.
- **Markupress** maps Markdown onto those components.
- **Knit** inherits everything through LoomaEditor.

The Looma pieces are briefed to a Looma session; Markupress C4–C6 depend on them.

## Order of work: Looma's staged migration

Each stage is a side-by-side build at a preview URL (for example `/looma-next/`),
not a cutover. Docusaurus keeps serving `/looma/` until stage 6 passes.

1. **Stage 1: foundations, getting started and one component page** (`layout/ui-stack`).
   - **Content:** 8 pure Markdown pages (`architecture`, `conventions`, `tokens`,
     and others), `getting-started.md`, and one component page.
   - **Needs:**
     - Markupress: D6 (current dependencies), C2, C7 (copy and word wrap), N2/N3
       (two sidebars), N4, N6, N7, N10, T4/T6/T7, C6 (Examples/API tabs), and D4
       (plugins compose).
     - HTMLKit: R5 nested layouts, R7 the 404, V7 the pre-build hook (Looma's
       `generate:api`), and V9 the manifest.
     - Looma: decouple the API generator from the `apps/docs/docs` layout.
   - **Exit:** page text matches Docusaurus, and pages render with JS off.
2. **Stage 2: all 54 component pages and 11 parts.**
   - Folder-shaped URLs with static redirect pages from the 77 old flat URLs
     (S7, HTMLKit R9).
   - Autogenerated sidebar categories (N2, HTMLKit R4 route groups).
   - Live examples at scale, the popup preview runtime (a second bundle through
     V7), and the code-mode switch (C6 sync and memory).
   - Looma: a build-time example loader, and a re-skin onto `--ui-*` tokens.
3. **Stage 3: the catalog.** Sidebar data exposed to a page (N3), plus the catalog
   component's lazy mount, filters and `/` shortcut (Looma).
4. **Stage 4: the editor guide.** LoomaEditor as an HTML Next component (Looma
   work, see Decisions), embedded like any other component, plus anchor links
   within the base path.
5. **Stage 5: the home page** (T5, `layout: home`, `toc: false`).
6. **Stage 6: parity gates.**
   - The link and anchor check (S6, HTMLKit V8) over all 85 routes; the manifest
     replaces `docs-coverage.mjs`'s `.docusaurus` reads.
   - A sitemap diff (S4).
   - Ports of the release-docs, reader-journey and interactive-guide tests to
     stable `data-*` hooks.
   - A re-baselined visual audit in the pinned image.
   - Then switch the Pages workflow.

**Not required by Looma but still in 1.0:**
- **Search (S1):** Looma has no search today, but its 404 copy promises one.
- **Callouts (C4/C5).**
- **`create` (D1).**
- **Typed config (D3).**
- **Extensions (D5).**
- **Deploy guides (D7).**
- **The docs site (G1).**

These follow stage 1 in parallel. Search comes right after stage 2, because a
component library this size needs it.

## Acceptance examples

- **AE1 (C4, shared vocabulary):** `::: warning Breaking` and `> [!WARNING]` both render
  `ui-callout tone="warning"` titled "Breaking". The same callout created by
  LoomaEditor's `/warning` command exports to `::: warning Breaking`.
- **AE2 (C6, C7):** In a `::: code-group`, choosing "pnpm" switches every group on
  the page, and the choice survives a reload. Code blocks show highlighted lines,
  line numbers, and a working copy button.
- **AE3 (N2, N3, N6):** `docs/components/` with `_category` folders gives the
  `/components/` section its own grouped, collapsible sidebar. The outline tracks
  the heading in view.
- **AE4 (S1):** Searching from any page finds a heading on another page, and filters
  to the current version.
- **AE5 (T4):** A site layout replaces the shell and still receives `navigation`,
  `crumbs`, `pager`, `outline` and the page's front matter.
- **AE6 (D1):** `npm create markupress@latest docs && cd docs && npm run dev` serves a
  home page and a guide page, and `npm run build` succeeds.
- **AE7 (stage 1):** Looma's stage-1 pages build at `/looma-next/` from the same
  Markdown, and their text matches the Docusaurus pages.

## Decisions

Owner, 2026-10-14:
1. **Looma's docs move to folder-shaped URLs** (`/components/forms/ui-button/`), with
   static redirect pages from the 77 old flat URLs (S7). Markupress needs no `slug`
   key.
2. **Visual baselines are re-recorded under Markupress**; no pixel parity with
   Docusaurus. The Storywright gate stays the PR visual gate, and the docs visual
   audit stays on demand.
3. **LoomaEditor becomes an HTML Next component**, translated automatically into
   Vue, React and Svelte, rather than staying Vue-only. This hardens the HTML Next
   proposal and its implementation, and lets the editor guide (stage 4) embed it
   like any other component. This is Looma work; stage 4 waits for it.

Defaults, kept unless the owner changes them:
4. **The 18 Looma pages in no sidebar** (11 parts, 7 editor components) get sidebar
   entries under their sections, since folder-shaped URLs already group them.
5. **i18n moves to 1.1** (S8). Neither consumer needs it.
