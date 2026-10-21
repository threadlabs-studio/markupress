---
title: VitePress parity audit
type: audit
date: 2026-10-21
---

# VitePress parity audit

Each feature in VitePress's guide and reference at [vitepress.dev](https://vitepress.dev), read on 2026-10-21, checked against Markupress `main` at `75fef03` (after 0.6.4, with the merged 0.7.0 work), the HTMLKit features it uses, and Looma's components. The [1.0 definition](./2026-10-14-markupress-1.0-definition.md) sets the bar: a feature is in 1.0 when VitePress and Docusaurus both ship it by default and a typical documentation site needs it.

Content features are judged against **Expressive Markdown** ([specification](https://nextwebwg.org/expressive-markdown/language), [expressmark README](https://github.com/nextwebwg/expressmark#what-you-can-write)), Markupress's content language. Markupress renders Markdown today with Looma's markdown-it renderer, and 0.8.0 moves it to expressmark's `parse` and `renderHtml`. Where the Expressive Markdown syntax differs from the one Markupress renders today, the notes give both.

| Status | Means |
| --- | --- |
| Has | Markupress has it; the evidence names the source, test or documentation page. |
| Has (Expressive Markdown) | Expressive Markdown expresses it in its own syntax. |
| Partial | Markupress has part of it; the notes say what is missing. |
| Missing | Markupress has no equivalent. |
| Not applicable | VitePress's form belongs to a model Markupress replaces, such as Vue in Markdown (HTML Next components) or markdown-it plugins (Expressive Markdown semantic types, Decision 6). |

Items marked "scratch" were checked by building a page in a scratch site with the merged `main`.

## Markdown extensions

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| Header anchors | Has | Every heading links to its anchor: `src/content.ts` (`heading_open`), `tests/content.test.ts`. |
| Custom anchors `{#id}` | Has (Expressive Markdown) | `## Title {#id}`, an attribute on the heading. `tests/content.test.ts` ("takes a heading id from a trailing {#id} marker"). |
| Links between pages | Has | Relative `.md` links resolve to the target page in the same version and fail the build when missing: `src/markdown.ts` `link()`, `tests/site.test.ts`. |
| Extensionless relative links (`./getting-started`) | Has | A relative path with no extension names a page from the file's folder, number prefixes optional: `tests/site.test.ts` ("resolves extensionless relative links"). |
| Links to a heading on another page | Has | `[x](./page.md#heading)` keeps the fragment, and the link check verifies it (HTMLKit V8). |
| External links get `target="_blank"` and `rel` | Missing | Links stay as written (scratch). |
| Frontmatter | Has (Expressive Markdown) | YAML front matter, validated per field: `src/content.ts` `validFrontMatter`. |
| GitHub tables | Has (Expressive Markdown) | GFM tables, plus Expressive Markdown's list tables. |
| Task lists | Has (Expressive Markdown) | `- [x] Done`: `tests/content.test.ts`, browser proof in `tests/package.test.ts`. |
| Footnotes `[^1]` | Has | Looma Markdown 0.30.8 renders GFM footnotes: `tests/content.test.ts`, browser proof. Footnotes are being added to the Expressive Markdown specification and expressmark. |
| Inline footnotes `^[text]` | Missing | Renders as text (scratch). |
| Emoji shortcodes `:tada:` | Missing | Renders as text (scratch). Expressive Markdown reads `:word` with no label or attributes as text. |
| Table of contents `[[toc]]` | Has (Expressive Markdown) | `::: toc [On this page] {depth=3}`; Markupress renders Looma's `::toc{depth=2}` today: `tests/content.test.ts` ("links ::toc entries"). |
| Containers info, tip, warning, danger | Has (Expressive Markdown) | `::: warning [Title]` renders `ui-callout`. Core types are note, tip, warning and danger; `info`, `important` and `caution` are custom types. Markupress renders `::: warning Title` today: `tests/content.test.ts`, browser proof. |
| `details` container, `{open}` | Has (Expressive Markdown) | `::: details [Title] {open}` renders native `<details>`: `tests/content.test.ts`. |
| Container titles | Has (Expressive Markdown) | `[Title]` after the type. |
| Registered custom containers | Not applicable | Expressive Markdown's open semantic types take their place, with no engine configuration (Decision 6). |
| Nested containers | Has (Expressive Markdown) | A longer outer fence: `tests/content.test.ts` ("nesting with longer markers"). |
| `{no-title}` | Partial | Expressive Markdown leaves an absent title absent. Markupress shows `{no-title}` as the title text (scratch). |
| `raw` container | Not applicable | Raw HTML and HTML Next components are scoped by HTML Next; no isolation container is needed. |
| GitHub alerts `> [!NOTE]` | Partial | Markupress renders alerts as untitled `ui-callout` today (`tests/content.test.ts`); text after the marker is not a title, and `> [!NOTE] Title` renders as a quotation (scratch). Expressive Markdown defines no alert form; colon containers are its callouts. |
| Graded containers | Not applicable | Looma's callout tones carry severity. |
| Syntax highlighting | Has | Shiki at build time, dual theme with `light-dark()`: `src/content.ts`, `tests/content.test.ts`, browser proof. |
| Line highlighting `{1,4,6-8}` | Has (Expressive Markdown) | `{highlight=1,3-4}`; Markupress reads `{1,3-5}` today: `tests/content.test.ts` ("highlights lines from fence meta"). |
| `// [!code highlight]` | Has | Looma code notation: `tests/content.test.ts`. Expressive Markdown keeps annotation comments in the code, so this is renderer behavior. |
| Focus, diff, error and warning notation | Missing | The `[!code focus]`, `[!code --]`, `[!code ++]` and `[!code error]` comments stay in the code (scratch). Plan row C8, 1.1. |
| Line numbers, `:line-numbers`, global option | Has (Expressive Markdown) | `{show-line-numbers}`; Markupress reads `:line-numbers`, `:no-line-numbers` and `lineNumbers` today: `tests/content.test.ts`, `tests/site.test.ts`. |
| `:line-numbers=N` start number | Missing | Numbers start at 1 (scratch). |
| Import code snippets `<<<` | Missing | Plan row C8, 1.1. |
| Code groups `::: code-group` | Has (Expressive Markdown) | Consecutive `::: tab [npm]` containers form a group with shared selection names; Markupress renders `::: code-group` with fence titles today, synced across the page and remembered: browser proof. |
| Code titles ```` ```js [name] ```` | Has (Expressive Markdown) | `{title="deploy.ts"}`; Markupress reads `title="…"` today. |
| Markdown file inclusion `<!--@include-->` | Missing | Plan row C11, 1.1. |
| Math | Missing | Expressive Markdown defines `math` fences and `:math[…]` as extension contracts; plan row C11, 1.1. |
| Image lazy loading | Missing | Images carry no `loading` attribute (scratch). |
| markdown-it configuration | Not applicable | Decision 6. |

## Asset handling

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| Relative assets copied with hashed names | Has | `page.asset()` serves them from `/_htmlkit/files/` with a content hash (scratch); `tests/site.test.ts`. |
| Inlining small images | Missing | Not needed for parity. |
| `public/` directory | Has | Copied to the output root; root-relative image paths resolve from it: `website/docs/01.guide/03.writing/01.pages.md`. |
| Base handling for public paths | Has | Root-relative paths get the base: `tests/site.test.ts` ("resolves root-relative Markdown links … under its base"). |
| `withBase` | Not applicable | Layouts receive `home` and resolved URLs as loader data. |

## Frontmatter

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| `title` | Has | `website/docs/01.guide/03.writing/02.front-matter.md`. |
| `titleTemplate` | Has | `titleTemplate`, `":title \| <title>"` by default: `tests/site.test.ts` ("titles each page with the titleTemplate option"). |
| `description` | Has | `<meta name="description">`. |
| `head` | Has | `head.meta`, `head.og`, `head.canonical`, and `<title>`, `<meta>` and `<link>` in Markdown as head declarations: `tests/site.test.ts`. |
| `dir` | Missing | With i18n, 1.1. |
| `layout` doc, home, page, false | Partial | Default shell, `home`, `false` and named layouts: `tests/site.test.ts`. A `page` layout (the shell with no prose styles) is missing. |
| `hero`, `features` | Has | Read from the home page's Markdown: `website/docs/01.guide/06.theme/02.home-page.md`, `tests/content.test.ts`. |
| `navbar`, `sidebar`, `aside` toggles | Missing | `layout: false` drops all of them. |
| `outline` | Has | `outline: [2, 3]` or `false`. |
| `lastUpdated` | Partial | Always shown when git has a date; no per-page `false` or fixed date. |
| `editLink` | Has | `editLink: false` or a URL: `tests/site.test.ts`. |
| `footer` | Missing | No per-page footer toggle. |
| `pageClass` | Missing | |
| `isHome` | Not applicable | The home layout is chosen by `layout: home`. |
| `prev`, `next` | Missing | The pager follows navigation order; plan row N5 says front matter can drop it, which is not built. |
| Accessing frontmatter in pages | Partial | Layouts receive `page` with the front matter: `website/docs/01.guide/06.theme/03.layouts.md`. A Markdown page's own content has no binding to it. |

## Routing

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| File-based routing, `index.md` | Has | HTMLKit routes each file; a folder's index page is its URL: `tests/site.test.ts`. |
| Source directory | Has | `contentDir`. |
| Linking to non-Markupress pages | Has | Links to files outside the docs stay as written; root-relative file links are public files. |
| Clean URLs | Has | Every page is a folder URL, `/guide/install/`, with no `.html`: `website/docs/01.guide/03.writing/01.pages.md`. |
| `rewrites` | Not applicable | Folders are URLs by decision (Decision 1, no `slug`); `aliases` and HTMLKit `redirects` cover moved pages. |
| Dynamic routes `[pkg].md` with `paths` | Partial | HTMLKit's `[param].html` pages with `entries()` cover HTML pages; Markdown pages have no parameters. |

## Data loading

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| `.data.js` loaders | Partial | HTMLKit loaders (`*.server.ts`) feed HTML pages and layouts; a Markdown page has no loader of its own. |
| `createContentLoader` | Missing | The `markdown()` plugin's `onPage` and HTMLKit's `generate` hook (1.0.0-alpha.68) are the building blocks. |

## Internationalization

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| Locale folders, `locales`, switcher, per-locale theme | Missing | Plan row S8, 1.1 (Decision 5). |
| RTL | Missing | 1.1. Looma's components use logical properties. |
| `lang` | Missing | `<html lang="en">` on every page (scratch); no option sets it. |

## Deploy

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| Build and preview, `--port` | Has | `website/docs/02.reference/02.cli.md`. |
| Base path | Has | `base`, `--base`: `website/docs/01.guide/09.deploy.md`. |
| Relative base `./` | Missing | HTMLKit's `base` starts and ends with `/`. |
| Cache headers | Missing | The deploy guide has no cache-header section. |
| GitHub Pages, Vercel, Netlify, any static host | Has | `website/docs/01.guide/09.deploy.md`; this documentation deploys with the GitHub Pages workflow. |
| Other platforms | Partial | Cloudflare Pages, GitLab Pages, Firebase and the rest follow the static host section. |

## Sitemap

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| `sitemap.xml` with a hostname | Has | `origin` writes it, canonical pages only: `tests/site.test.ts` ("passes origin and robots"). |
| `lastmod` | Missing | HTMLKit writes no `lastmod`. |
| `transformItems` | Partial | A site's own `public/sitemap.xml`, or an HTMLKit plugin's generated one, takes the place of the built-in file. |

## MPA mode

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| No client JavaScript, `<script client>` | Not applicable | HTMLKit renders every page to HTML that reads without JavaScript (browser proof with JavaScript off), and compiled components ship only their own code. |

## Using Vue in Markdown

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| Interpolation, directives | Not applicable | Markdown text is literal; HTML Next components carry expressions: `website/docs/01.guide/03.writing/01.pages.md`. |
| `<script setup>`, `<style>` per page | Not applicable | A component's controller and scoped `<style>`; a page's `<link rel="stylesheet">` styles that page. |
| Importing components | Has | `<link rel="component" href="@/app/components/x.html">`: `website/docs/01.guide/03.writing/06.components.md`, `tests/site.test.ts`. |
| Global components | Missing | Each page links the components it uses. |
| Escaping `v-pre` | Not applicable | Text and code are literal by default. |
| CSS preprocessors | Missing | A component's `@import "./x.less"` fails the build with a CSS syntax error (scratch); component styles are CSS. |
| `<ClientOnly>` | Not applicable | Controllers run in the browser only. |

## Site config

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| `title` | Has | |
| `titleTemplate` | Has | See Frontmatter. |
| `description` (site-wide) | Missing | Per page only. |
| `head` (site-wide) | Has | A site layout's `<defs>` and HTMLKit's `app/head.js`: `website/docs/01.guide/07.security.md`. |
| `lang`, `dir` | Missing | See Internationalization. |
| `base`, `srcDir`, `outDir` | Has | `base`, `contentDir`, `outDir`. |
| `srcExclude` | Partial | Files starting with `_` are not routed. |
| `assetsDir`, `assetsBase`, `cacheDir` | Not applicable | HTMLKit owns `_htmlkit/`. |
| `ignoreDeadLinks` | Has | HTMLKit `linkCheck: "warn"`: `website/docs/02.reference/01.configuration.md`. |
| `appearance` | Partial | Light and dark with a saved toggle and no flash: browser proof. No option to force one theme. |
| `lastUpdated` | Has | Always on in a git checkout: `tests/site.test.ts`. |
| `markdown`, `vite`, `vue` | Not applicable | Decision 6; HTMLKit owns the Vite configuration. |
| `buildEnd`, `transformHead`, `transformHtml`, `transformPageData` | Partial | HTMLKit plugins in `htmlkit.config.ts` add `buildStart`, `buildEnd`, `generate` and page compilers: `website/docs/01.guide/02.project-structure.md`. |
| Typed config | Has | `markupress.config.ts` with `defineConfig`: `tests/config.test.ts`. |

## Runtime API

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| `useData` | Has | A layout declares props and receives them: `website/docs/01.guide/06.theme/03.layouts.md`. |
| `useRoute`, `useRouter` | Not applicable | HTMLKit navigates through the Navigation API. |
| `withBase` | Not applicable | Loader data carries resolved URLs. |
| `<Content />` | Has | `<slot name="page">` in a layout. |
| `$frontmatter`, `$params` | Partial | `page` in layouts; Markdown pages have no parameters. |
| Icons (`useIcon`, `VPIcon`) | Has | Looma's `ui-icon` with Lucide. |

## Default theme configuration

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| `logo` (light and dark) | Has | `public/logo.svg`, `public/logo-dark.svg`, `logo` option: `tests/site.test.ts`. |
| `siteTitle` | Partial | `title`; no way to hide the text beside the logo. |
| `nav` | Has | Sections from top-level folders plus `nav` links. |
| `sidebar` | Has | Generated per section. |
| `aside` | Partial | The outline is on the right; no left or hidden setting. |
| `outline` | Has | Levels per page; the "On this page" label is fixed. |
| `socialLinks` | Has | `nav` links with an `icon`. |
| `footer` | Has | `_footer.md` columns and copyright. |
| `editLink` | Has | The `editLink` option; the label is fixed. |
| `lastUpdated` text and format | Partial | The date is `YYYY-MM-DD` with a fixed label. |
| `algolia` | Missing | Plan row S2, 1.1. |
| `carbonAds` | Missing | See the ranked list. |
| `docFooter` labels and the other UI labels | Missing | Labels are English and fixed; 1.1 with i18n. |
| `externalLinkIcon` | Missing | No icon on external links (scratch). |
| `i18nRouting` | Missing | 1.1 with i18n. |
| `notFound` | Has | `docs/404.md` in the shell: `tests/site.test.ts`. |

## Nav

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| Title and logo | Has | `theme/chrome.html`. |
| Links | Has | |
| Dropdowns | Not applicable | Removed in 0.2.0: sections come from folders, and `nav` adds flat links. |
| `activeMatch` | Has | A link to the page or its section is marked current automatically. |
| `target`, `rel` | Missing | Links stay as written. |
| Social links with icons | Has | `nav` items with `icon`. |
| Component nav items | Partial | A site layout replaces the header. |

## Sidebar

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| Groups and sections | Has | Folders are collapsible groups, and route groups label pages with no URL: `tests/site.test.ts`. |
| Multiple sidebars | Has | One per top-level folder. |
| Collapsible, `collapsed` default | Has | `navigation: collapsed` on a folder's index page: `tests/navigation.test.ts`. |
| Explicit sidebar configuration | Not applicable | Folders, `order` and `navigation` shape every sidebar (0.2.0). |
| Generated folder index | Has | An index page with an empty body lists its folder (VitePress has none). |

## Home page

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| Hero text, tagline, actions | Has | `tests/content.test.ts`, browser proof. |
| Hero name label | Missing | |
| Hero image | Partial | One image; no light and dark pair. |
| Features | Has | `ui-card` per `##` section, holding any Markdown. |
| Feature icon, whole-card link | Partial | A card holds an image and links; the whole card is not one link. |
| Markdown below the features | Partial | Every `##` section becomes a card. |

## Team page

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| `VPTeamMembers`, `VPTeamPage` | Missing | Looma has `ui-avatar` and `ui-card` to build one. |

## Footer

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| Message and copyright | Has | `_footer.md`: link columns and a copyright paragraph. |
| Per-page `footer: false` | Missing | |

## Layout

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| `doc`, `home`, custom, `false` | Has | See Frontmatter. |
| `page` | Missing | |
| Layout slots | Partial | `app/layouts/default.html` replaces the shell and receives all its data; there are no slots to fill. |

## Badge

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| Badge in headings | Partial | `### API :chip[beta]{tone=yellow}` renders a Looma chip in the heading (scratch, Expressive Markdown chips). The heading's anchor is `api`; its outline label includes the chip text, "API beta". |

## Search

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| Local search with keyboard shortcut | Partial | Built on `feat/search`: a per-version JSON index from HTMLKit's `generate` hook and Looma's `ui-search-shell`, opened with `/`, Ctrl+K or Cmd+K. It merges with 0.7.0. |
| `search: false` front matter | Missing | |
| Search i18n, MiniSearch options, custom renderer | Missing | 1.1. |
| Algolia DocSearch | Missing | Plan row S2, 1.1. |

## Prev and next links

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| From navigation order | Has | HTMLKit's `<hk-pager>`: browser proof. |
| Front matter `prev`, `next`, `false` | Missing | Plan row N5 keeps the pager and says front matter can drop it. |

## Edit link

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| Pattern from the file path | Has | `editLink` option plus the file's path: `tests/site.test.ts`. |
| Function form | Not applicable | Front matter `editLink` sets any page's URL. |
| Label text | Missing | Fixed "Edit this page". |
| Per-page `false` | Has | |

## Last updated

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| Date from git | Has | One `git log` per build: `src/git.ts`, `tests/site.test.ts`. |
| Label and `Intl` format | Missing | `YYYY-MM-DD` with a fixed label. |
| Per-page `false` | Missing | |

## Carbon Ads

| VitePress | Status | Evidence and notes |
| --- | --- | --- |
| `carbonAds` | Missing | A site adds an ad script through HTMLKit's `app/head.js` and `csp` option. |

## Ranked gaps

### Needed for 1.0

VitePress and Docusaurus both ship these by default, and a typical site needs them.

1. **S1 local search.** Built on `feat/search`; it merges with 0.7.0 once Looma pins HTML Next 1.0.0-alpha.69.
2. **S7 `redirectFrom` front matter.** Built on `feat/redirect-from`; it merges with 0.7.0.
3. **Extensionless relative links.** `[x](./getting-started)` fails the build with "Missing asset", because `link()` in `src/markdown.ts` reads the `./` prefix as a file extension. Both tools write relative links without `.md`, and migrated content has them.
4. **Title template.** Each document title is "Page \| Site" in both tools; Markupress writes the page title alone.
5. **`lang`.** A site option for `<html lang>`, which both tools set; every Markupress page is `lang="en"`.
6. **Front matter `prev` and `next`.** Both tools let a page change or drop its pager links (Docusaurus `pagination_prev` and `pagination_next`); plan row N5 already says front matter can drop the pager.

### 1.1

1. Code focus, diff, error and warning notation, and code snippet imports (plan row C8).
2. Markdown inclusion, math and diagrams (plan row C11), as Expressive Markdown extension contracts.
3. Internationalization: locale folders, the switcher, `dir` and RTL, and every UI label (plan row S8, Decision 5).
4. Algolia DocSearch (plan row S2), and search's `search: false`, translations and options.
5. Per-page `lastUpdated: false` and a fixed date, and an `Intl` date format with a label.
6. Per-page footer, navbar, sidebar and aside toggles, `pageClass`, and a `page` layout.
7. External link icon in the theme.
8. Image lazy loading.
9. Home page: hero name label, light and dark hero images, and whole-card feature links.
10. Data loading for Markdown: a content loader over compiled pages, built on `onPage` and HTMLKit's `generate` hook, and parameters for Markdown pages.
11. Sitemap `lastmod` from git (HTMLKit).
12. GitHub alert titles (`> [!NOTE] Title`) and `{no-title}`, decided with the Expressive Markdown move in 0.8.0, since Expressive Markdown's callouts are colon containers.
13. `:line-numbers=N`, inline footnotes `^[…]` (with Expressive Markdown footnotes) and emoji shortcodes (an Expressive Markdown language proposal).
14. Chip text left out of a heading's outline label.
15. Global components, linked once for every page, and CSS preprocessors in component styles.
16. A team page from Looma's avatar and card components.
17. Cache-header guidance and more platforms in the deploy guide.
18. A site-wide `description`, hiding the site title beside the logo, and an appearance setting that fixes one theme.
19. Relative `./` base (HTMLKit).

### Won't do, by decision

1. **markdown-it configuration and registered containers.** Expressive Markdown keeps markdown-it internal; content is customized through its open semantic types and attributes (Decision 6).
2. **Vue in Markdown** (interpolation, directives, `<script setup>`, `v-pre`, `<ClientOnly>`). HTML Next components with TypeScript controllers take their place, and Markdown text is literal.
3. **`rewrites`.** Folders are URLs (Decision 1); `aliases` and redirects cover moved pages.
4. **Explicit sidebar configuration and nav dropdowns.** Folders, `order` and `navigation` shape navigation (0.2.0).
5. **MPA mode.** HTMLKit pages are HTML that reads without JavaScript, and compiled components ship only their own code.
6. **Carbon Ads.** An ad script is a site's own, through HTMLKit's `app/head.js` and `csp`; the 1.0 definition leaves the announcement bar (T8) out for the same reason.
