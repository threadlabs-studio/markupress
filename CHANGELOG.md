# Changelog

All notable changes to this project will be documented in this file.

## Next release

- Keep the desktop sidebar background and border continuous to the footer, with its navigation scrolling in a separate sticky panel.
- Support `navigation: overview` for a route group’s overview page, preserving flat child URLs and avoiding a duplicate overview sub-link.

- Add `sidebarNavigation: 'sections'`: keep category links visible, opening the overview or first page, and list only the current category's pages without disclosure controls. Server rendering and native links support the same navigation without JavaScript.

- Supply a native section-navigation drawer on home pages, keeping the shared site header compact and its logo visible on mobile. Close the home section drawer after following a link.

- Use Looma SiteHeader for the responsive site banner, branding, navigation and action alignment. Markupress supplies documentation content, routes and drawer behavior. Requires Looma 0.41.2 for the shared header’s mobile sizing and separate adjustable action targets; home-page action links use its href-driven native link contract.

- Keep header content vertically centered while preserving the wordmark/navigation text baseline. Give home actions an explicit accent and preserve their spacing across component boundaries. Use the text-safe accent for prose links.
- Allow a home page to place live content beside its story by marking a top-level element `data-hero-media`.
- Allow compatible later pre-1.0 minor releases of Threadlabs dependencies instead of restricting consumers to individual minor versions. Lockfiles retain the tested versions.

- Use MarkupKit 0.2 for routing and rendering, with `mk:` metadata, `mk-` navigation components, and `data-mk-` browser controls throughout the theme and starter.

- Align header brand and navigation text on their baseline, increase navigation spacing, and allow a removable status chip before search with an application-owned dismissal action.

- Replace the three appearance controls with one Looma CycleButton using standard state icons. Automatic is the default; explicit choices persist across navigation and reload. The theme and starter now require Looma 0.37.1 or newer on the supported 0.37 line.

- Accept Looma 0.37 in strict peer-dependency installs, including its document-root theme scale.

- Accept Looma 0.36 in strict peer-dependency installs so its documentation generator can use Markupress with relational theme controls.

- Add page and section sidebar visibility so workspace pages can supply contextual tools without a second documentation sidebar.
- Offer Automatic, Light and Dark appearance choices with standard icons, and keep the outline below the measured header.

- Render section navigation with Looma Disclosure and Nav Item controls, including shared chevrons, spacing, selected state, focus and pointer feedback. Linked groups expose a separate overview link, so expanding a section does not navigate away.

- Merges to main automatically publish verified paired Markupress and starter releases. Immutable source snapshots allow retries after a partial publication without choosing a new version.

## 0.8.0

- Use Looma 0.33 with HTML Next 1.0.0-alpha.69. The starter pins 0.33.0; the peer accepts compatible 0.33 patch releases, including consumers that ship Looma’s documentation generator.

Breaking changes from 0.7.0:

- Mentions follow Looma 0.33’s canonical Expressive Markdown spelling, such as `@[Ada]#u1`. Replace the former `:mention[Ada]{id=u1}` spelling in authored pages.

- A Markdown page links its components with `<link rel="component" href="@/…">`. A `<template component>` written in a page's Markdown is raw HTML under CommonMark's HTML block rules, as any other tag is; component definitions live in component files such as `app/components/counter.html`.

## 0.7.0

- Markupress depends on MarkupKit and HTML Next 1.0.0-alpha.69, and its Looma peer is exactly 0.31.4, the Looma release built with HTML Next 1.0.0-alpha.69. A site's own Looma dependency moves to exactly 0.31.4, and `create-markupress`'s starter depends on both.

Breaking changes from 0.6.4:

- A site's own Looma dependency moves to exactly 0.31.4, which pins HTML Next 1.0.0-alpha.69.
- Each page's document `<title>` is its title and the site title, `Installation | My site`, from the `titleTemplate` option, `":title | <title>"` by default. `false` gives the page's title alone, and a template without `:title` fails with the option's value. A version's home page is titled with the site title, and an explicit `<title>` in Markdown takes the page's place.
- A snapshot freezes its `@/` links. `markupress snapshot <id>` rewrites a `@/` path in an `href`, `src` or `controller`, an `@import` or a module import, in each Markdown, HTML, CSS, TypeScript or JavaScript file it copies, to `@/versions/<id>/…` when the snapshot holds that file, so the version reads its frozen copy. Markdown code stays as written, and a `@/` path to a file outside the snapshot keeps naming the project's file, with a warning naming the file.

Added:

- Local search. The Search button in the top navigation, `/`, Ctrl+K and Cmd+K open Looma's search dialog (`ui-search-shell`, a native modal `<dialog>`), which searches the pages of the version being read, by heading, with arrow keys between results, Enter to open one and Escape to close. A query matches a section holding every one of its words, whatever their case or accents, headings first. MarkupKit's `generate` hook writes each version's index, `/v/<id>/_search.json`, and the default version's at the root, from the compiled pages, in builds and after each edit in development. A replacement layout receives the index URL as its `search` prop.
- `redirectFrom` front matter lists a page's old URLs, relative to its version, such as `[/setup/]`. Each is MarkupKit's `mk:redirect-from`: the old URL answers 308 to the page in `dev` and `preview`, in the root and under `/v/<id>/`, and a build writes a redirect page there and lists it in the manifest.
- `npm create markupress@latest <folder>` starts a site from `create-markupress`, a package in `packages/create-markupress` that shares Markupress's version and releases with it: a home page, two guide pages, a component in `app/components/` linked with `@/`, a footer and `markupress.config.ts`. Its `package.json` depends on this Markupress release and the HTML Next and Looma releases Markupress pins, and a folder that already has files is refused. A test packs it, creates a site and builds it with the installed package.
- `markupress.config.ts`, or `markupress.config.js`, configures a site in place of `markupress.config.json`, which stays accepted. `defineConfig` from `markupress` types its options. Vite loads a TypeScript or JavaScript configuration, as MarkupKit loads `markupkit.config.ts`, so it imports its own files by their `.js` names. A site with more than one of the three files fails with their names. `loadConfig(root)` returns the options the `markupress` command reads.
- `Text[^1]` and a `[^1]: The note.` definition render a footnote: a numbered superscript link to the note, and GFM's notes section at the end of the page, with a link back from each note to its reference. The theme sets the notes below a rule, in smaller type, and keeps their "Footnotes" heading for assistive technology only.
- The `lang` option, a language tag such as `fr` or `pt-BR`, is every page's `<html lang>`, in each version, alias and the not-found page, and a page's `lang` front matter takes its place. Markupress sets it through the layout loader's MarkupKit `head.lang`. An invalid tag fails with its value.
- `previous` and `next` front matter change a page's pager links: `false` drops the link, and `{ label, href }` relabels or retargets it, with `href` resolved as a link in the page's Markdown, such as `../install.md`. A layout's `previous` and `next` props follow them.
- Six Markupress theme tokens size the layout and set its font: `--markupress-font`, `--markupress-page-width`, `--markupress-content-width`, `--markupress-sidebar-width`, `--markupress-outline-width` and `--markupress-home-width`, with the theme's sizes as their defaults. A site sets them, and Looma's `--ui-*` tokens, in its own stylesheet from MarkupKit's `css` option. The README lists both token sets.
- The Markupress documentation site is in `website/`, built by Markupress itself and published at https://threadlabs-studio.github.io/markupress/: a guide (getting started, project structure, writing, navigation, versions, theme, the Content Security Policy and SEO) and a reference (configuration, the command line and the API). The README introduces Markupress and links to it.

Fixed:

- On a wide screen the drawer's Navigation button is hidden: a component's styles reach the content it projects into another component's slot (HTML Next 1.0.0-alpha.69). The browser proof checks it.
- A relative Markdown link with no extension is a page path from the Markdown file's folder: `[Install](./install)`, `./install/`, `../reference/` and `../reference/options/` link those pages in the same version, with or without the number prefixes of their files and folders. A path naming no page fails the build with the Markdown file and the link. A relative link whose last segment has an extension stays a file.
- A `@/` path in a Markdown page's stylesheet, an `@import` or `url()`, stays for MarkupKit to resolve from the project root, in place of resolving beside the Markdown file.

Removed:

- The `markdown` option for markdown-it plugins and Shiki transformers, merged for 0.7.0 and in no published release, is removed: Looma Markdown is built on Expressive Markdown, which keeps markdown-it internal, so content is customized through its open semantic types and attributes. The Markdown guide links to Expressive Markdown's README.

Changed in the repository:

- The browser proof follows a footnote reference to its note and audits the page with axe.
- The installed consumer test configures its site with `markupress.config.ts` and type-checks it against the packed package.
- The browser proof sizes the sidebar from a site stylesheet's `--markupress-sidebar-width`.
- `pnpm build:sites` builds the documentation site and `examples/site`, and `verify:pr` runs it, so CI builds both and checks their links. A push to `main` deploys the documentation site to GitHub Pages.
- The guide's Deploy page publishes a site on GitHub Pages, Vercel, Netlify and any static host, with the base path, the host's Node version, its not-found page, and the git history that dates pages.
- The guide links a site's components from `app/components/` by their path from the project root, `@/app/components/counter.html`, as MarkupKit pages do, and `examples/site` keeps its component there. `@/` in a Markdown page's `<link rel="component">` resolves in development and builds, at the root and under `/v/<id>/`.
- `CHANGELOG.md` is a local path in `threadlabs.config.json`, and the Foundation release runner skips a package npm has never seen, with a message saying how to publish it once and add the trusted publisher.
- The guide's Migrating page maps a Docusaurus or VitePress site's files and URLs, front matter, Markdown, configuration and versions onto Markupress's model, for a one-time conversion.
- The snapshot and installed-consumer tests link their components with `@/`, and a test changes the live component after a snapshot and checks that the snapshot renders its frozen copy.
- The browser proof searches from the keyboard, opens a result on another page, checks that each version's results are its own pages, and audits the dialog with axe; a site test checks the written indexes.

## 0.6.4

- Markupress depends on MarkupKit and HTML Next 1.0.0-alpha.67, and its Looma peer is exactly 0.30.7, the Looma release built with HTML Next 1.0.0-alpha.67. A site's own Looma dependency moves to exactly 0.30.7.
- After following a link to another version's page that loads as a document, back and then forward show that version's page under its URL, even when forward comes as the previous page is still starting. MarkupKit renders the page of the history entry a document starts on.
- The browser proof follows the version link, goes back and then forward, and checks that each page is on screen under its own URL with no console error or warning.

## 0.6.3

- Markupress depends on MarkupKit and HTML Next 1.0.0-alpha.66, and its Looma peer is exactly 0.30.6, the Looma release built with HTML Next 1.0.0-alpha.66. A site's own Looma dependency moves to exactly 0.30.6.
- Following a link to another version whose page defines one of the current page's tags differently, such as its own `<demo-counter>`, loads that page as a document with no console error. It opens at the page's top or its `#fragment`, and takes the place of the history entry the link made, so back returns to the page the link was on.
- The browser proof follows a version link to a page that defines its own component, and fails on any console error or warning during it. It checks that the page opens at its top and that back returns to the page the link was on.

## 0.6.2

- Markupress depends on MarkupKit and HTML Next 1.0.0-alpha.65, and its Looma peer is exactly 0.30.5, the Looma release built with HTML Next 1.0.0-alpha.65. A site's own Looma dependency moves to exactly 0.30.5.
- Server output from HTML Next 1.0.0-alpha.65 names each carrier's component with `<template carrier="<tag>">`, one per component on a root, in place of `<?carrier?>`. A site's own component with content no slot renders writes the new form, which the same build hydrates, and `carrier` on a `<template>` inside a component definition is reserved (`HT027`). The pages the Markupress shell, home layout and theme render are the same HTML as in 0.6.1.
- In a site's own components, a component whose root is the component it forwards a slot to hydrates in place, and a node forwarded into a closed slot is written once.

## 0.6.1

- Markupress depends on MarkupKit and HTML Next 1.0.0-alpha.64, and its Looma peer is exactly 0.30.4, the Looma release built with HTML Next 1.0.0-alpha.64. A site's own Looma dependency moves to exactly 0.30.4.
- In a site's own components, a bound slot prop that is null or that its declared type rejects takes the prop's `default`, and a component that forwards its slot to a child's slot of the same name renders the content once. Toggling a named slot with fallback is faster in compiled output.

## 0.6.0

- Markupress depends on MarkupKit and HTML Next 1.0.0-alpha.63, and its Looma peer is exactly 0.30.3, the Looma release built with HTML Next 1.0.0-alpha.63.
- The shell, home layout and header declare `logo`, `favicon`, `previous` and `next` as props with no default, which read null until a site supplies them. A site with no logo shows its title alone, one with no favicon has no icon link, and the first and last pages show only the pager link they have.

Breaking changes from 0.5.0:

- A site's own Looma dependency moves to exactly 0.30.3, which pins HTML Next 1.0.0-alpha.63. Looma 0.30.3 types an optional field as `?: T | null`, so a site's TypeScript that reads a Looma type handles null there.
- A `nullable` attribute on a `<prop>`, `<state>` or field in a site's own components and layouts fails with HTML Next's `HC013`. Delete it: a prop with a `default`, or a state with a `value`, reads as its type and null clears it back to that value, and one with neither reads null until it is given one. A null write to a state with a `value` reverts it to that value.
- `$else` after a `$if` fails with `HT031`; a site writes the branches as `$when` and `$else` inside `$match`.
- A bound slot prop is checked in full against its declared type, so a value with an undeclared field, a missing `required` field or a field of the wrong type reads as absent and warns `HR007`.

Added:

- A test renders the shell with no logo or favicon, and the first and last pages with only their next and previous links.

## 0.5.0

- Markupress depends on MarkupKit and HTML Next 1.0.0-alpha.58, and its Looma peer is exactly 0.30.0, the Looma release built with HTML Next 1.0.0-alpha.58.

Breaking changes from 0.4.0:

- A site's own Looma dependency moves to exactly 0.30.0, which pins HTML Next 1.0.0-alpha.58.
- HTML Next 1.0.0-alpha.58 reads a slot name as a literal identifier, so a site's own components and layouts name each slot without hyphens and without `from:name`. A scoped slot that passes props declares it with `<slot>` in the component's `<defs>`. `componentRegistry.update` takes the place of `updateComponentProps`.
- Looma 0.30.0 changes components a site's Markdown or layouts may use: `ui-combobox` renders its declared `item` and `option` slots, the `ui-form-field` slot `label-action` is `labelAction`, and `ui-switcher`, `ui-reel` and `ui-cover` lay out from their own container.
- The Markupress shell, home layout and theme render as before.

## 0.4.0

- Markupress depends on MarkupKit and HTML Next 1.0.0-alpha.57, and its Looma peer is exactly 0.29.12, the Looma release built with HTML Next 1.0.0-alpha.57, so an install never pairs it with a Looma built on another HTML Next.

Breaking changes from 0.3.0:

- A site's own Looma dependency moves to exactly 0.29.12, which pins HTML Next 1.0.0-alpha.57.
- Markupress follows MarkupKit's head model: head content is HTML Next head declarations in a component's `<defs>`. Each Markdown page writes its generated `<title>`, description, Open Graph and canonical entries, its `mk:` settings and any `<title>`, `<meta>` or `<link>` its Markdown holds into its page component's `<defs>`; `mk:page` stays at the top of the resource. A rendered title, meta or link carries `data-component-head=""`.
- The site root serves the default version's pages as their canonical copies. Its `/v/<default>/` mount is an MarkupKit alias, so each of its pages has a `<link rel="canonical">` to the root copy, unless its front matter sets `head.canonical`, and `sitemap.xml` lists only the root copies. A version whose directory an earlier version already serves is an alias of it too.
- A `<link rel="stylesheet">` in Markdown becomes an `@import` in the page component's `<style>`, so it styles that page as its own CSS. Any other `<link>` that is not a head declaration fails with HTML Next's `HC025`, naming the Markdown file.
- An explicit `<title>` in Markdown takes the place of the generated title, since a definition declares one title.
- Every page carries MarkupKit's generated Content Security Policy: `script-src 'self'` with the hash of each inline head script, `object-src 'none'` and `base-uri 'none'`. The theme script that applies the saved theme before first paint is hashed, and the shell, code and outline controllers run under the policy. A site script from another origin needs the MarkupKit `csp` option.

To migrate a site:

1. A site layout, `app/layouts/default.html` or `app/layouts/home.html`, moves its `<title>`, `<meta>` and `<link>` elements into its `<defs>`. Write a bound title as `<title>{$title}</title>`, and bind a link's `from:href`, which leaves the link out when it is null, in place of `$if`. A head element outside `<defs>` fails the build. Head entries of Looma components reached through `@threadlabs/looma/...` are left out, so a layout declares the icon it wants, as the Markupress shell does.
2. A site script from another origin, such as analytics, adds its origin to the policy with MarkupKit's `csp` option in `markupkit.config.ts`, such as `csp: { 'script-src': ['https://analytics.example'] }`, and loads from `app/head.js`, which MarkupKit hashes. `csp: false` turns the policy off.

Added:

- While MarkupKit renders a page in place, when `<html>` has `data-mk-navigating`, the theme draws an accent bar along the top of the window, after a moment so a quick navigation never shows it, and without its motion for readers who prefer reduced motion.
- The README documents the Content Security Policy, the `csp` option for a site's own scripts, and head declarations in a site layout.
- The browser proof runs every page in development and production under the generated policy, and fails on any violation.

## 0.3.0

- Markupress depends on MarkupKit and HTML Next 1.0.0-alpha.54, and its Looma peer range is `^0.29.1`, the Looma release built with HTML Next 1.0.0-alpha.54.

Breaking changes from 0.2.0:

- `build` fails on a broken internal link: a link within the site to a page or file missing from the output, or to a `#fragment` naming no element in its page, in any page, the `nav` option or a footer. MarkupKit's check lists each page and link. A `nav` or footer link starting with `/` is checked in every version, so the page it names must be in each one. `linkCheck: "warn"` in the site's `markupkit.config.ts` reports the links as a warning and finishes the build.
- A site's own Looma dependency moves to `^0.29.1`, whose LoomaEditor asks for uploads, mentions, links, slash commands and extensions as HTML Next requests.
- HTML Next keeps whitespace between inline elements in templates as a space, as HTML does, so a site's own components and layouts render the spaces their markup has. The Markupress shell, home layout and theme render as before.

Added:

- The `origin` option, such as `"https://example.com"`, makes `build` write `sitemap.xml` at the base, and the `robots` option writes `robots.txt`, which links the sitemap when `origin` is set. Both set MarkupKit's options of the same names, as `base` does.
- `layout: home` makes a page a home page, read from its Markdown: everything before the first `##` heading is the hero (its `#` heading, a paragraph of only links as `ui-button` actions, an image alone in its paragraph, and the tagline), and each `##` section is a feature card (`ui-card` in a `ui-grid`). The home layout keeps the shell's top navigation and footer. Markupress supplies it as an MarkupKit plugin layout, so a site's `app/layouts/home.html` replaces it.
- The shell shows an "Edit this page" link and the date the page's file last changed, above the previous/next links.
  - The `editLink` option is a URL ending in `/`, and each page's link is that URL followed by its file's path in the project. A page's `editLink` front matter takes its place, and `editLink: false` shows none.
  - The date is the author date of the last commit touching the file, as `YYYY-MM-DD`, read for every page with one `git log` when a build or development server starts. Outside a git checkout pages show no date.
- A layout's `page` data has the resolved `editLink` and `lastUpdated`.
- The shell's top navigation and footer are the `markupress-header` and `markupress-footer` components in `theme/chrome.html`, which the shell and the home layout share.

Changed:

- A layout's `page.editLink` is absent for a page with no edit link, where `editLink: false` front matter used to pass `false`.

Fixed:

- A root-relative Markdown link (`[Tokens](/tokens/)`) is a page path in the page's version under the deployment base, as in the footer and the `nav` option, which share one resolver. With `markdown()` alone it is a path under the base. A root-relative link naming a file (`/report.pdf`) is a public file, as a root-relative image is.
- A site with one version shows no version links in the sidebar.
- The README describes the published package: installing it from npm, then building from source.

## 0.2.0

- Markupress depends on MarkupKit and HTML Next 1.0.0-alpha.52, and its Looma peer range is `^0.28.18`, the Looma release that ships Looma Markdown.
- Markupress renders [Looma Markdown](https://github.com/threadlabs-studio/looma/blob/main/apps/docs/docs/looma-markdown.md), the Markdown LoomaEditor reads and writes. It parses with Looma's markdown-it plugin (`@threadlabs/looma/markdown/markdown-it`) and reads fences, braces and front matter with Looma's shared rules, so a document renders the same HTML in Markupress and LoomaEditor. The test suite renders every case in `@threadlabs/looma/markdown/fixtures` and compares the normalized HTML.

Breaking changes from 0.1.0:

- Heading anchors follow Looma Markdown: NFC, lowercase, letters, numbers and combining marks kept in any script, and every other run one hyphen. Anchors of headings with accented or non-Latin text change: "Über uns" is `über-uns`. Links to those anchors need the new IDs.
- A closing `:::` line closes the innermost open container. `::: tabs` content before its first `== Label` line, and other content in a `::: code-group`, renders before the panels.
- A fence's meta, everything after its language, is on its `<code>` as `data-meta`.
- A folder is a page: its index page's front matter labels, orders and collapses the folder. `_category.yml`, `_category_.yml` and `_category_.json` files are no longer read; move their fields into the folder's `index.md` (`label` becomes `title`, `position` becomes `order`, and `collapsed: true` becomes `navigation: collapsed`). A label for pages with no folder URL is an MarkupKit route group, a folder named in parentheses.
- Front matter keys follow MarkupKit's page metadata. Rename `sidebarPosition` to `order` (MarkupKit `mk:order`), `sidebarHidden: true` to `navigation: hidden` (MarkupKit `mk:navigation`), and `toc` to `outline`. `sidebarLabel` is removed: `title` is the navigation, breadcrumb and pager label (MarkupKit `mk:label`). Each old key fails the build as an unknown field, naming the file and the valid fields.
- `compileMarkdown` no longer returns `label` or `sidebarHidden`, and a layout's `page` data no longer has `label`; read `title` and `frontmatter.navigation`.
- Configuration is conventions first. The options are `title`, `base`, `contentDir`, `outDir`, `versions`, `defaultVersion`, `lineNumbers`, `nav`, `logo` and `favicon`, plus `root`, `host` and `port` in the programmatic API. An unknown option fails with the list of options.
  - `layout` is removed: a site's `app/layouts/default.html` replaces the shell and receives its loader data.
  - `sidebar` is removed: folders, `order` and `navigation` front matter shape every sidebar.
  - `footer` is removed: `_footer.md` in a version's content directory holds a heading per column, a list of links under each, and a copyright paragraph.
  - `social` is removed: `nav` links take an optional `icon`. `nav` dropdowns are removed. The top navigation starts with each top-level folder that has an index page, labelled and ordered by it, and `nav` adds links after them.
  - `versionBadge` is removed: a site with several versions shows the selected version's label.
  - `logo` and `favicon` default to `public/logo.svg` (with `public/logo-dark.svg` for the dark theme) and `public/favicon.svg`.
  - The `SidebarItem` type is removed, and `NavItem` is a link with an optional `icon`. A replacement layout's `nav` items have `icon`, and the `social` prop is removed.
- Snapshots live in `versions/<id>/`, a copy of the project's layout (`versions/v1/docs/`, `versions/v1/public/`), and the folders are the version list: the current version, then snapshots highest number first, labelled by folder name. `versioned_docs/versions.json` is no longer read; move `versioned_docs/<id>/_source/` to `versions/<id>/`, or list the versions in the `versions` option. A snapshot is staged and renamed into place, so a version appears whole. `snapshotVersion` returns the version's `id`, `directory` and `publicDir`, with no `label`.

Added:

- `::toc{depth=2 format=numbered}` renders a table of contents linking the page's headings by their anchors.
- `:chip[Ready]{tone=green}` renders an inline chip in one of the hues `neutral`, `blue`, `green`, `yellow`, `red` and `purple`, and `:mention[Ada]{id=u1}` renders a mention.
- `::: figure Caption` wraps an image in `<figure>` with an inline Markdown caption, and braces after an image set its `width`, `height` and `placement` (`center`, `wrap-left` or `wrap-right`).
- A list whose every item starts with `[ ]` or `[x]` renders as a task list with checkboxes. The theme styles chips, mentions, task lists, the table of contents, figures and placed images.
- The shell's sidebar and outline are named landmarks, "Documentation" and "On this page".
- An index page with front matter and an empty body is a generated index: below its title it lists the pages and folders directly in its folder, each linked with its `description`, from MarkupKit's navigation tree. A replacement layout receives the list as the `contents` prop, and `compileMarkdown` reports it as `generated`.

## 0.1.0

- Markupress is now a thin layer over MarkupKit 1.0.0-alpha.51, with HTML Next 1.0.0-alpha.51 and Looma 0.28.5. HTML Next and Looma are peer dependencies, so a site and its theme share one copy of each. MarkupKit delivers pages as compiled components, so a page ships its components' code rather than the HTML Next live runtime. The `markdown()` MarkupKit plugin translates `.md` files into pages, and `markupress()` adds versioning and the theme; MarkupKit routes, orders, watches, renders, and builds the pages. The CLI runs MarkupKit with both plugins. Markupress's own routing, ordering, link-to-URL logic, file watcher, and generated `.markupress/` application are gone.
- Each Markdown file is its own page component, so diagnostics and relative references name the original file. Front matter becomes MarkupKit page metadata: the sidebar label, `sidebarHidden`, and `aliases`.
- Referenced images and files are served from `/_markupkit/files/` instead of `/_markupress/assets/`.
- Ordering prefixes are MarkupKit's number and dot: rename `01-guide/02-install.md` to `01.guide/02.install.md`. The theme shows MarkupKit's `<mk-breadcrumbs>` above each page and `<mk-pager>` previous/next links below it, styled by a global theme stylesheet (`theme/theme.css`) that MarkupKit adds to every page.
- Looma's tokens and light/dark themes and the document defaults are page-wide through MarkupKit's `css` option, so they reach `:root`; imported into the shell's scoped `<style>`, they never applied. Each Markdown page component imports the documentation typography (`styles/prose.css`, also exported), and `markdown({ styles })` adds stylesheet files to every Markdown page component.
- `markupress snapshot` also mirrors the stylesheets a component imports, which MarkupKit now delivers apart from the component's own CSS.
- A saved dark theme applies before first paint through the plugin's MarkupKit head script, so dark-theme readers no longer see one light frame on each page load.
- `prepareSite` is replaced by `siteOptions`, which returns the MarkupKit options the CLI uses.
- `## Title {#custom-id}` sets a heading's ID. A fence such as `ts title="app/pages/index.ts"` renders its code in `<figure class="code">` with the title as the caption.
- Fenced code is highlighted at build time with Shiki's `github-light-default` and `github-dark-default` themes. Token colors use CSS `light-dark()`, so they follow the theme's color scheme with no client JavaScript. Braces in code stay literal. The theme draws code blocks on Looma's sunken surface (`--ui-surface-sunken`).
- `compileMarkdown` now returns a Promise.
- Containers and GitHub alerts render Looma's shared blocks. `::: note`, `tip`, `info`, `important`, `warning` and `danger` (`caution` is `danger`), with an optional title, and `> [!NOTE]` through `> [!CAUTION]` alerts render `<ui-callout>`. `::: details Title {open}` renders native `<details>`. `::: tabs` and `::: code-group`, with `== Label` panels or a code group's fence titles, render `<ui-tabs>` with a group, which keeps one selection across the page and remembers it. An outer container uses more colons to nest, and any other container name stays text. A page links the Looma components its blocks use, and the theme spaces the blocks and styles the Markdown inside them.
- Code blocks highlight lines from fence meta (`{1,3-5}`) and `// [!code highlight]` comments, and number them with `:line-numbers` or the `lineNumbers` option (`:no-line-numbers` opts out), all at build time. Plain-text fences (`text`) take these features too. Every code block renders as `<figure class="code">` with Copy and Wrap buttons, which a small page controller (`markupress/controllers/code.js`, also exported) shows and handles. Without JavaScript the buttons stay hidden.
- Front matter takes `title`, `description`, `sidebarLabel`, `sidebarHidden`, `sidebarPosition`, `id`, `aliases`, `layout`, `toc`, `head` and `editLink`. `layout` selects an MarkupKit layout by name, or none with `false`. `head` renders `meta`, Open Graph (`og`) and `canonical` elements into the document head. `toc` sets the heading range of the page's outline (`[2, 3]` by default) or empties it with `false`, and `editLink` sets the page's edit URL or `false`. An unknown or mistyped field fails the build with the Markdown file, the field and its expected type.
- `compileMarkdown` returns the page's validated `frontmatter` and its `outline`, the headings in its `toc` range with their `id`, `href`, `label` and `depth`.
- The `layout` option replaces the Markupress shell with a site's own HTML Next layout. A layout receives each loader prop it declares: `title`, `home`, `navigation`, `crumbs`, `previous`, `next`, `versions`, `outline` and `page`, the page's front matter with its resolved title, label and document ID. A folder's `_layout.html` nests inside it, and its loader reads the same data from `parent.markupress`.
- Sidebars are grouped and sectioned. Each top-level folder of a version is a section with its own generated sidebar, and a page at the version's root shows every page. A generated sidebar is MarkupKit's navigation tree, rendered by `<mk-nav>`: each folder below a section is a labelled, collapsible group (native `<details>`), nested as deep as the folders go, and a folder's index page is the group's entry, linked from its summary. A folder's `_category.yml`, or Docusaurus's `_category_.json` or `_category_.yml`, gives its index page a `label` and a whole-number `position`, which become the index page's `sidebarLabel` and `sidebarPosition` unless its front matter sets them, and starts the group closed with `collapsed`; a group holding the current page always starts open. A `_category` file in a folder without an index page fails the build. The `sidebar` option gives a section an explicit sidebar of page paths, links and groups. The `sidebar` loader data has `<mk-nav>`'s tree shape, with `children`.
- The shell has a top navigation bar, configured by `logo` (one image, or one per theme), `title`, `nav` links and dropdowns, a version badge (`versionBadge`, or the selected version's label on a site with several versions) and `social` links. `favicon` sets the site icon. A link path starting with `/` opens that page in the version being read, and a link to the current page or its section is marked current.
- A page's headings appear in an "On this page" outline beside the content on wide screens, as plain fragment links. A small controller (`markupress/controllers/outline.js`, also exported) marks the heading being read with an IntersectionObserver.
- On narrow screens the sidebar is a drawer: a native popover, closed by default, which the Navigation button opens without JavaScript. Following a link in it closes it.
- A `404.md` in the default version's content renders in the shell as MarkupKit's not-found page, with status 404, for every unmatched path, including those under `/v/<id>/`, and builds to `404.html`. It has no URL or sidebar entry of its own.
- The `footer` option adds link columns and a copyright line below every page.
- The loader data that a replacement layout can declare also includes `sidebar`, `nav`, `social`, `footer`, `logo`, `favicon` and `badge`.
- A replacement layout receives exactly the props its component declares, from MarkupKit's `propNames`. The shell declares its navigation item props with open object types, so items with MarkupKit's route-group `group` field pass.
- `sidebarPosition` front matter orders a page among its folder's pages in place of its file's number prefix (MarkupKit `mk:order`), and on a folder's index page it orders the folder.
- The `markupress` command, `buildSite`, `devSite` and `previewSite` load the site's `markupkit.config.ts` or `.js` through MarkupKit's `loadConfig` and add `markupress()` after its plugins, so MarkupKit plugins and options compose with Markupress. `siteOptions(options, markupkit)` merges them; Markupress's `base` and `outDir` win over MarkupKit's, and a config that lists `markupress()` or `markdown()` itself fails with a message to remove it.
- `markdown({ frontmatter })` and `compileMarkdown`'s `frontmatter` option give a page default front matter, which the page's own fields override.
