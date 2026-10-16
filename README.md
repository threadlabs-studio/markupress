# Markupress

Build a versioned Markdown documentation site with native HTML Next components, HTMLKit routing and a Looma theme. Markupress provides `build`, `dev`, `preview` and `snapshot` commands. Production output is a portable static directory; controllers enhance the rendered HTML in the browser.

## Get started

Markupress is published on npm as `markupress`. Use Node 22.22.2 or later in Node 22, or Node 24.15 or later in Node 24:

```sh
npm install markupress
npx markupress dev       # serve docs/ with live reload
npx markupress build     # write the static site to site/
npx markupress preview   # serve the built site
```

`docs/index.md` is a complete site. Markupress is a thin layer over HTMLKit: it translates Markdown and manages versions, and HTMLKit routes, orders, renders, watches and builds the pages. The dev server reloads open pages after any edit, addition or deletion. `build` writes a static site, which is the production output.

## Author a site

`@nextwebwg/html-next` and `@threadlabs/looma` are peer dependencies, so a site shares one copy of each with its own components. npm installs them with Markupress. Pages link Looma's components by package name, so a pnpm site adds both as its own dependencies:

```sh
pnpm add markupress @nextwebwg/html-next @threadlabs/looma
```

A site needs no configuration. `docs/index.md` is a complete site, and `markupress dev` serves it. Files in known places shape the rest:

| File | Is |
| --- | --- |
| `docs/index.md` | The version home, which every version needs. A number prefix such as `01.index.md` is allowed. |
| `docs/<folder>/index.md` | The folder's page and its metadata (see [Folders](#navigation-logo-and-footer)). Each top-level folder with an index page is a section: a top navigation link with its own sidebar. |
| `docs/404.md` | The not-found page. |
| `docs/_footer.md` | The footer: a heading per column, a list of links under each, and a copyright paragraph. |
| `public/logo.svg`, `public/logo-dark.svg` | The logo before the title, and its dark-theme version. |
| `public/favicon.svg` | The site icon. |
| `app/layouts/default.html` | A layout that replaces the Markupress shell (see [Layouts](#layouts)). |
| `app/layouts/home.html` | A layout that replaces the home layout (see [Home page](#home-page)). |
| `htmlkit.config.ts` | HTMLKit options and plugins. |
| `versions/<id>/` | A recorded version, written by `markupress snapshot` (see [Versions](#versions)). |

Pages and their front matter come next, and `markupress.config.json` comes last: plain JSON data for the title, the base path and a few more settings (see [Configuration](#configuration)).

The `markupress` command and these APIs also load the site's `htmlkit.config.ts` (or `.js`) with HTMLKit's `loadConfig`, and add `markupress()` after its plugins, so HTMLKit plugins and options compose with Markupress:

```ts
// htmlkit.config.ts
import { defineConfig } from '@nextwebwg/htmlkit';
import { sitemap } from './plugins/sitemap.js';

export default defineConfig({ plugins: [sitemap()], redirects: { '/start/': '/guide/install/' } });
```

`base` and `outDir` from `markupress.config.json` or the command line win over the HTMLKit config's; without either, they are `/` and `site`. `markupress()` includes the `markdown()` plugin, so the HTMLKit config lists neither.

The same pieces work as HTMLKit plugins. `markupress(options)` adds versioned documentation with this theme. `markdown()` alone makes any HTMLKit site's `.md` files into pages, with no versions or theme:

```ts
import { defineConfig } from '@nextwebwg/htmlkit';
import { markdown } from 'markupress';

export default defineConfig({ plugins: [markdown()] });
```

```markdown
---
title: Installation
description: Install the project and run your first example.
id: install
aliases: [/getting-started/]
---
# Installation

[Next steps](03.usage.md#usage)

<link rel="component" href="../../components/counter.html">

<demo-counter></demo-counter>
```

`01.guide/02.install.md` becomes `/v/current/guide/install/`. Numeric prefixes order HTMLKit navigation and disappear from URLs. The unversioned `/guide/install/` alias selects the configured default version. Changing `02.` to `10.` changes ordering without changing the path. Duplicate paths or document IDs fail with both source filenames.

Markdown text and fenced examples are literal, including braces and component syntax. Raw HTML outside fences can declare or use native components. Resource links remain relative to the original Markdown file. A component declared in Markdown is hoisted alongside the generated page carrier; its expressions retain HTML Next semantics. Explicit `<title>`, `<meta>` and non-component `<link>` elements also become page metadata.

### Front matter

Front matter is a YAML mapping. Each field becomes HTMLKit page metadata or page data, and an unknown or mistyped field fails the build with the Markdown file's path, the field and the expected type.

| Field | Type | Effect |
| --- | --- | --- |
| `title` | string | The document `<title>`, the navigation, breadcrumb and pager label (HTMLKit `hk:label`), and `page.title`. Defaults to the first heading, then the file name. On a folder's index page it labels the folder. |
| `description` | string | `<meta name="description">`, and the page's line in its folder's generated index. |
| `order` | whole number | The page's place among its folder's pages, in place of its file's number prefix (HTMLKit `hk:order`). On a folder's index page it places the whole folder, and on the version home it is an error. |
| `navigation` | `hidden` or `collapsed` | `hidden` leaves the page out of navigation and keeps its route (HTMLKit `hk:navigation`). On a folder's index page, `collapsed` starts the folder's sidebar group closed. |
| `id` | string | The document identity across versions, independent of the file name and route. |
| `aliases` | list of route paths | Further URLs serving the page, relative to its version (HTMLKit `hk:alias`). |
| `layout` | string or `false` | An HTMLKit layout, `app/layouts/<name>.html`, in place of the site's layout for this page (HTMLKit `hk:layout`). `home` is Markupress's [home page](#home-page). `false` renders the page with no layout. |
| `outline` | `false` or `[min, max]` | The heading levels in the page's "On this page" outline, `[2, 3]` by default. `false` gives an empty outline. |
| `head` | mapping | `meta` (name to content), `og` (Open Graph property without `og:`, to content) and `canonical` (a URL), rendered into the document head. |
| `editLink` | URL or `false` | The page's "Edit this page" URL, in place of the one the [`editLink` option](#edit-link-and-last-updated) gives. `false` shows none. |

```yaml
---
title: Installation
outline: [2, 4]
editLink: https://github.com/org/repo/edit/main/docs/01.guide/02.install.md
head:
  meta: { keywords: "install, setup" }
  og: { image: https://example.com/social.png, type: article }
  canonical: https://example.com/guide/install/
---
```

Number prefixes order pages, and `order` takes the place of a file's prefix: `order: 2` on `install.md` orders it as `02.install.md` would. Pages with the same number sort by name.

Every heading has an anchor, derived by the Looma Markdown rule: the text is normalized to NFC and lowercased, letters, numbers and combining marks in any script stay, and every other run of characters becomes one hyphen. "Über uns" is `über-uns`, "設定 と 使い方" is `設定-と-使い方`, and a duplicate takes the first free suffix (`installation-1`). `## Setup {#install}` sets the ID to `install` and removes the marker from the heading. A custom ID is reserved for its heading, so a generated ID skips it. Relative `.md` links resolve to the corresponding version-specific document, retaining fragments and queries; missing documents fail at build time. A link starting with `/` is a page path in the page's version, as in the footer and the `nav` option, so `[Tokens](/tokens/)` opens `/v/<id>/tokens/` under the deployment base; with `markdown()` alone it is a path under the base. A root-relative link naming a file, such as `/report.pdf`, is a file in the public directory. Relative assets are copied, and image paths starting with `/` resolve from that edition's public directory under the deployment base. Remote links remain unchanged. `navigation: hidden` hides a document from navigation while keeping its route available. Aliases do not add duplicate sidebar entries.

Markupress renders [Looma Markdown](https://github.com/threadlabs-studio/looma/blob/main/apps/docs/docs/looma-markdown.md): CommonMark with GitHub Flavored Markdown (tables, task lists, strikethrough and autolinks), plus Looma's blocks and inline elements. It parses with Looma's markdown-it plugin and is tested against Looma Markdown's conformance fixtures, so a document reads the same in Markupress, Looma's components and LoomaEditor. A container's name is matched without regard to case, and the rest of the opening line is its title:

````markdown
::: warning Before you upgrade
Back up your data first.
:::

> [!TIP]
> Alerts take the tones NOTE, TIP, IMPORTANT, WARNING and CAUTION.

::: details Show the output {open}
Starts expanded.
:::

::: code-group
```sh title="pnpm"
pnpm add markupress
```

```sh title="npm"
npm install markupress
```
:::

::: tabs
== Examples
Usage examples.

== API
The reference.
:::

::toc{depth=2}

Status :chip[Ready]{tone=green}, owned by :mention[Ada Lovelace]{id=u1}.

- [x] Read the changelog
- [ ] Run the migration

::: figure The build, from *source* to release
![The build pipeline](./pipeline.svg){width=640 placement=center}
:::
````

| Markdown | Renders |
| --- | --- |
| `::: note`, `tip`, `info`, `important`, `warning`, `danger` or `caution`, with an optional title | `<ui-callout tone="…" heading="Title">`. `caution` is `danger`, and `note` is the muted aside. |
| `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` alone on a quote's first line | An untitled `<ui-callout>`: NOTE is `note` and CAUTION is `danger`. |
| `::: details Title`, with `{open}` to start expanded | Native `<details><summary>Title</summary>`, which opens without JavaScript. The title defaults to "Details". |
| `::: tabs` with `== Label` panels | `<ui-tabs group="tabs">`, one `<section aria-label="Label">` per panel. |
| `::: code-group` with a fence per panel | `<ui-tabs group="code-group">`, each panel labelled by its fence's `title`, or its language. `== Label` panels also work. |
| `::: figure Caption` | `<figure>` with the caption, inline Markdown, as its `<figcaption>`. |
| `::toc{depth=2 format=numbered}` | A table of contents linking the page's headings by their anchors. `depth` is 1 to 3 (default 3), and `format` is `plain`, `bulleted` or `numbered`. |
| `:chip[Label]{tone=green}` | An inline chip. Its tone is a hue: `neutral` (the default), `blue`, `green`, `yellow`, `red` or `purple`. |
| `:mention[Name]{id=u1}` | A mention of the entity `u1`, shown as `@Name`. |
| `- [x] Done` | A task list, when every item of the list starts with `[ ]` or `[x]`. |
| `![Alt](./image.svg){width=640 height=360 placement=wrap-left}` | An image with its size in CSS pixels and a placement: `center`, `wrap-left` or `wrap-right`. |

Tabs in one group keep one selection across the page, matched by label, and remember it for the next visit: choosing "npm" in one code group switches every code group. `::: tabs name` or `::: code-group name` sets the group. Without JavaScript every panel shows. Any other container name stays text. A closing `:::` closes the innermost open container, and a fence's content is code, so a `:::` line inside a fence stays code. Give an outer container more colons (`::::` around `:::`) so the nesting shows in the source. Titles and labels are literal text.

A page links the Looma components its blocks use by package name, as the theme links `ui-button`, so `@threadlabs/looma` resolves from the site. The Markupress theme spaces the blocks and styles the Markdown inside them.

Fenced code is highlighted at build time with [Shiki](https://shiki.style), so pages load no highlighting JavaScript. Any language Shiki bundles, such as `html`, `css`, `less`, `js`, `ts`, `tsx`, `jsx`, `json`, `bash`, `vue`, `svelte`, `md` or `yaml`, is loaded the first time a fence uses it. Unknown languages stay plain text. A `title` in the fence's info string adds a caption:

````markdown
```ts title="app/pages/index.ts"
export const count = 1;
```
````

Each code block renders as `<figure class="code">`, with the title as its `<figcaption>`.

The fence's info string also highlights and numbers lines, at build time with no client JavaScript:

````markdown
```ts {1,3-4} :line-numbers
const a = 1;
const b = 2; // [!code highlight]
const c = 3;
const d = 4;
```
````

- `{1,3-4}` highlights lines 1, 3 and 4, with or without a space after the language (```` ```ts{1} ````).
- A `// [!code highlight]` comment at the end of a line highlights that line, and the comment is removed. `#`, `--`, `/* */` and `<!-- -->` comments work too. `[!code highlight:3]` covers three lines, and a marker alone on its line applies to the lines after it.
- `:line-numbers` numbers the lines. The `lineNumbers: true` option, in `markupress.config.json`, `markupress()` or `markdown()`, numbers every block, and `:no-line-numbers` opts a block out.
- Line highlighting and numbers apply to languages Shiki highlights and to plain text (`text`, `txt`, `plain` or `plaintext`). A fence with an unknown language or no language stays escaped text, without its `[!code highlight]` comments.

Every code block has Copy and Wrap buttons. Copy puts the code on the clipboard, without line numbers or highlight comments. Wrap toggles line wrapping. They are native buttons, reached with Tab, and a page with code loads a small controller (`markupress/controllers/code.js`) that handles them through one delegated listener. The buttons stay hidden until that controller runs, so without JavaScript a code block is only its code. The theme shows them while the block is hovered or holds focus, and always on touch screens.

Highlighting uses the `github-light-default` and `github-dark-default` themes. Each token's color is `light-dark(light, dark)`, so it follows the page's `color-scheme`. The Markupress theme sets the color scheme from its dark-theme button or the reader's system preference through Looma's `[data-theme]` themes, so code switches with the rest of the page. On another HTMLKit site, set `color-scheme: light dark` to follow the system, or set `color-scheme` on `[data-theme]` as Looma does. Each token also carries `--shiki-light` and `--shiki-dark`, so a site can switch with any selector instead, for example `.dark .shiki span { color: var(--shiki-dark) !important; }`. Browsers without `light-dark()` show unhighlighted text. The site's stylesheet owns the code block's background; the Markupress theme uses Looma's sunken surface (`--ui-surface-sunken`). There, comments measure 3.98:1 in the light theme and 4.42:1 in the dark theme, and light-theme function names 4.42:1, below the 4.5:1 the other token colors reach.

## TypeScript controllers

Maintain controllers in strict ESM TypeScript, with `.js` references in HTML:

```html
<template component="demo-counter" controller="./counter.js">
  <defs><state name="count" type="number" value="0"></state></defs>
  <div><button>Increment</button><output>{$count}</output></div>
</template>
```

```ts
// counter.ts
import type { ComponentHost } from '@nextwebwg/html-next/runtime';

export default function counter(host: ComponentHost): void {
  host.on('connect', () => {
    const button = host.root.querySelector('button')!;
    const click = () => { host.state.count = Number(host.state.count) + 1; };
    button.addEventListener('click', click);
    return () => button.removeEventListener('click', click);
  });
}
```

HTMLKit resolves `counter.js` to `counter.ts` in development and bundles its JavaScript for production. Vite transpiles; it does not type-check. Install TypeScript as a development dependency when importing HTML Next's controller types, and run your project's strict TypeScript check separately. Markupress maintains its controllers with TypeScript 7. Checked JSDoc is an authoring option for your own controllers.

## Versions

Record active docs without overwriting an existing edition:

```sh
markupress snapshot v1
markupress build
```

The command validates a build and writes `versions/v1/`, a copy of the project's layout: `versions/v1/docs/` and `versions/v1/public/`. It stages the copy in a `.`-prefixed folder and renames it into place, so a version appears whole. The folders in `versions/` are the version list: the current version first, then each snapshot, highest number first (`v10`, `v2`, `v1`), labelled by its folder name. It mirrors Markdown, public assets and project-local component, controller, stylesheet and asset dependencies, preserving relative imports. Existing snapshots are never replaced. Keep those files in version control. Package imports continue to use the project's installed dependencies and lockfile; snapshots freeze authored sources rather than vendoring npm packages.

Use relative project-local imports for snapshot content. Absolute filesystem imports and remote resources retain their external ownership. If a snapshot process crashes, check that it has stopped before removing its `versions/.snapshot-lock` directory; the next snapshot replaces any `.<id>-pending` folder it left.

The `versions` option sets the versions, their order and their labels in place of the folder list:

```json
{
  "versions": [
    { "id": "current", "label": "Next", "directory": "docs" },
    { "id": "v1", "label": "Version 1", "directory": "versions/v1/docs", "publicDir": "versions/v1/public" }
  ],
  "defaultVersion": "v1"
}
```

A site with several versions shows their links in the sidebar and the selected version's label beside the title. Version IDs are URL slugs; they need not follow SemVer. A document's `id` identifies it across versions independently of its filename, route and generated component name. The version selector links to that identity in the other version, even if its route changed. If it is absent, the selector explains the fallback and links to that version's home. Selection lives in the URL and survives reloads.

## Theme and migration inputs

The default theme imports Looma's button and badge resources and CSS exports selectively. Its shell has a skip link, a top navigation bar, a grouped sidebar per section, native version links, an "on this page" outline, an edit link and last-updated date, a footer and a saved light/dark preference, which an inline head script applies before first paint. It uses the platform's existing runtime.

Styles follow the component boundaries. Looma's tokens, its light and dark themes and the document defaults (`styles/base.css`) are page-wide, delivered through HTMLKit's `css` option. Each Markdown page component imports the documentation typography (`styles/prose.css`), so it styles that page and stops at any component the page embeds. The shell's own `<style>` styles the header, sidebar, columns and footer. `theme/theme.css` is page-wide too, because HTMLKit's built-in breadcrumbs and pager have no styles of their own and no component's scoped style reaches them; it also picks the logo for the theme in use. With `markdown()` alone, `markdown({ styles: [file] })` makes every Markdown page component import the given stylesheet files.

### Navigation, logo and footer

The shell around the pages comes from the content. **Top navigation.** Each top-level folder with an index page is a section, linked from the top navigation by its index page's `title`, in navigation order. The `nav` option adds links after the sections. A link to the page being read, or to a section holding it, is marked current. **Logo and icon.** `public/logo.svg` is the logo, `public/logo-dark.svg` replaces it in the dark theme, and `public/favicon.svg` is the site icon. **Badge.** A site with several versions shows the selected version's label beside the title. **Footer.** `_footer.md` in a version's content directory is that version's footer. HTMLKit routes no file whose name starts with `_`, so the footer has no URL of its own:

```markdown
## Docs

- [Tokens](/tokens/)
- [Proposal](https://nextwebwg.org/declarative-components/)

## Project

- [GitHub](https://github.com/threadlabs-studio/looma)

Copyright 2026 Threadlabs Studio contributors.
```

Each heading starts a column, and each item in the list below it is a link. A paragraph after the lists is the copyright line. Anything else in the file fails the build with the file's path.

In the footer and the `nav` option, an `href` starting with `/` is a page path in the version being read, so `/components/` opens that version's components. Other links stay as written.

**Sidebars.** Each top-level folder of a version is a section with its own sidebar, generated from the folder's pages; a page at the version's root shows every page. Folders, `order` and `navigation` front matter shape every sidebar.

**Folders.** A folder is a page: its index page (`index.md`, or `01.index.md` with a number prefix) is the folder's entry, at the folder's URL, and its front matter is the folder's metadata. A generated sidebar is HTMLKit's navigation tree, rendered by `<hk-nav>`: each folder below the section is a labelled group, a native `<details>` that collapses without JavaScript, nested as deep as the folders go, and its summary links to the index page.

```markdown
---
title: Forms              # labels the folder in the sidebar, breadcrumbs and pager
description: Form controls.
order: 3                  # places the folder among its siblings like a 03. folder prefix
navigation: collapsed     # starts the group closed, except on the pages inside it
---
```

A group starts open unless its index page says `navigation: collapsed`, and a group holding the current page always starts open. A folder without an index page is labelled by its name. To group pages under a label with no folder URL of its own, use an HTMLKit route group: a folder named in parentheses, such as `03.(Getting started)/`, labels and orders its pages and adds no URL segment. Navigation, breadcrumbs and the previous/next links follow the same order.

**Generated index.** An index page with front matter and an empty body lists its folder: below its `title` as the heading, each page and folder directly inside it links to that page with its `description`, in navigation order. A route group's pages appear in its place, and hidden pages stay out. The list comes from HTMLKit's navigation tree, so it follows every page added, renamed or reordered.

**Outline.** A page with headings in its `outline` range (h2 and h3 by default) shows them in an "On this page" outline beside the content on wide screens. The links are plain fragment links. A small controller (`markupress/controllers/outline.js`, also exported) marks the heading being read with `aria-current="location"`, using an IntersectionObserver; without JavaScript only that marking is missing.

**Narrow screens.** Below 769px the sidebar is a drawer: a native popover, closed until the Navigation button opens it, and it opens without JavaScript. Escape or a tap outside closes it, and following a link in it closes it.

**Not found.** A `404.md` in the default version's content directory is the site's not-found page (HTMLKit's not-found page, R7). It renders in the shell for every unmatched path, including those under `/v/<id>/`, with status 404 in `dev` and `preview`, and `build` writes it to `404.html`. It is no page of its version, so it has no URL of its own and no sidebar entry.

### Home page

`layout: home` makes a page a home page: a hero and feature cards, full width between the shell's top navigation and footer. The page's Markdown is the data, so it reads the same anywhere Markdown renders:

```markdown
---
layout: home
---
# Markupress

Versioned documentation from Markdown, with native HTML Next components.

![](/hero.svg)

[Get started](01.guide/01.install.md) [GitHub](https://github.com/threadlabs-studio/markupress)

## Components in Markdown

Declare an HTML Next component in a page and use it on the next line.

## Versions

`markupress snapshot v1` records the docs as they stand.
```

| Markdown | Is |
| --- | --- |
| Everything before the first `##` heading | The hero. |
| The `#` heading | The hero's title. Without one, the page's `title` is. |
| A paragraph of only links | The actions: a `ui-button` link each, the first solid and the rest outlined. |
| An image alone in its paragraph | The hero image, beside the text on wide screens. |
| Any other paragraph | The tagline. |
| Each `##` heading and everything up to the next | A feature card, a Looma `ui-card` in a `ui-grid`. A card holds any Markdown: lists, code, links, images. |

The hero and cards use Looma's components and `--ui-*` tokens, in both themes. `app/layouts/home.html` replaces the home layout as an ordinary HTMLKit layout, with its own `home.server.ts` loader when it needs data. The page keeps its hero and card structure, so the site's layout supplies only the frame and styles.

### Edit link and last updated

Each page in the shell ends with an "Edit this page" link and the date its file last changed, above the previous/next links.

**Edit link.** The `editLink` option is a URL ending in `/`, and each page's link is that URL followed by the page file's path in the project. For a site at `examples/site/` in a GitHub repository:

```json
{ "editLink": "https://github.com/threadlabs-studio/markupress/edit/main/examples/site/" }
```

`docs/01.guide/01.authoring.md` links to `…/edit/main/examples/site/docs/01.guide/01.authoring.md`, and a snapshot's page to its file in `versions/<id>/`. A page's own `editLink` front matter takes its place, and `editLink: false` shows none.

**Last updated.** A page's date is the author date of the last commit that touched its file, as `YYYY-MM-DD` in a `<time>` element. It needs no configuration: one `git log` call reads the dates of every page when a build or development server starts. Outside a git checkout, or for a file with no commit yet, the page shows no date. A shallow clone dates every file by its oldest fetched commit, so a CI build that shows dates fetches the full history (`fetch-depth: 0` in `actions/checkout`).

### Layouts

`app/layouts/default.html` replaces the Markupress shell with the site's own HTML Next layout for every documentation page, as it is the default layout of the site's other HTMLKit pages. The layout renders `<slot name="page">` where the page goes, and receives Markupress's loader data as props. It receives each prop it declares with `<prop>`, so it declares only the data it uses:

```html
<template component="site-layout"><defs>
<prop name="navigation" type="list(object({ href: string, label: string, current: string, ... }))" required>Links</prop>
<prop name="outline" type="list(object({ href: string, label: string, depth: number, ... }))" required>On this page</prop>
<prop name="page" type="object({ title: string, editLink?: string, ... })" required>Page metadata</prop></defs>
<div class="site">
  <nav><a $each="item of $navigation" from:href="$item.href" from:aria-current="$item.current">{$item.label}</a></nav>
  <main><slot name="page"></slot></main>
  <aside><a $each="heading of $outline" from:href="$heading.href">{$heading.label}</a></aside>
</div>
</template>
```

| Prop | Value |
| --- | --- |
| `title` | The site title (`title` option, default "Documentation"). |
| `home` | The site's base URL. |
| `navigation` | HTMLKit navigation items for the selected version: `href`, `label`, `current` (`"page"` or `"false"`), `depth` and `pageName`. |
| `sidebar` | The page's section sidebar, in `<hk-nav>`'s tree shape: entries with `label`, `current`, `open`, `depth` and `children`, and an `href` on a page. A folder with an index page has both `href` and `children`. Pass it to `<hk-nav from:items="$sidebar">`. |
| `nav` | The sections, then the `nav` option's links: each has `label`, `href`, `current` and `icon` (a URL, or `""`). |
| `footer` | `_footer.md`'s `columns`, each a `title` and `items` of links with `label`, `href` and `current`, and its `copyright`. |
| `logo`, `favicon`, `badge` | The logo's `light` and `dark` URLs, the icon URL (both `null` when absent), and the badge text. |
| `crumbs` | Navigation items from the version home down to this page. |
| `previous`, `next` | The neighbouring navigation items, absent at either end. |
| `versions` | Version links: `href`, `label`, `current` and `note`, which explains a fallback to that version's home. |
| `outline` | The page's headings in its `outline` range: `id`, `href` (`#id`), `label` and `depth`. |
| `contents` | A generated index's entries, `label`, `href` and `description`, and an empty list on every other page. |
| `page` | The page's front matter, plus its resolved `title` and document `id`, its `editLink` (absent when it has none), and `lastUpdated`, the `YYYY-MM-DD` date its file last changed in git (absent outside git). |

Markupress gives the layout its loader data, so the layout has no `default.server.ts` of its own. A folder's `_layout.html` inside a version's content wraps that folder's pages inside the site layout, as in any HTMLKit site. Its `_layout.server.ts` loader reads all of the data above from `parent.markupress`:

```ts
export function load({ parent }) { return { props: { section: parent.markupress.page.title } }; }
```

A layout receives exactly the props its component declares, which HTMLKit gives the loader as `propNames`. Declare navigation items with an open object type, which ends in `...`, so items keep passing as HTMLKit adds fields such as a route group's `group`.

HTMLKit plugins compose with Markupress through the site's `htmlkit.config.ts`, which the `markupress` command loads (see [Author a site](#author-a-site)).

Existing Markdown, HTML/CSS/Less/JavaScript/TypeScript examples, local assets, heading anchors and route aliases are migration inputs. The installed consumer fixture checks those under a nested base. A live Jess/Less documentation migration and visual/content parity comparison remain separate work.

## Configuration

`markupress.config.json` is plain JSON data, read by the `markupress` command. Every key is optional:

```json
{
  "title": "Looma",
  "base": "/looma/",
  "nav": [
    { "label": "HTML Next", "href": "https://nextwebwg.org/declarative-components/" },
    { "label": "GitHub", "href": "https://github.com/threadlabs-studio/looma", "icon": "/github.svg" }
  ]
}
```

| Option | Default | Does |
| --- | --- | --- |
| `title` | `"Documentation"` | The site title in the top bar. |
| `base` | `/` | The URL path the site is served under. It starts and ends with `/`. |
| `contentDir` | `docs` | The current version's content directory. |
| `outDir` | `site` | Where `build` writes the static site. |
| `versions`, `defaultVersion` | the folders in `versions/`, `current` | The versions and their order and labels, and the version the site root serves (see [Versions](#versions)). |
| `lineNumbers` | `false` | Numbers the lines of every code block. |
| `nav` | none | Links after the sections in the top navigation: `{ "label", "href" }`, with an optional `icon` image shown in place of the label. |
| `logo` | `public/logo.svg` and `public/logo-dark.svg` | One image path, or `{ "light", "dark" }`, in place of the logo files. |
| `favicon` | `public/favicon.svg` | The site icon's path, in place of the icon file. |
| `editLink` | none | A URL ending in `/`, which each page's file path follows to make its "Edit this page" link (see [Edit link and last updated](#edit-link-and-last-updated)). |

Image paths starting with `/` are files in `public/`. An unknown key fails with the list of options. The programmatic `buildSite`, `devSite` and `previewSite` APIs, and the `markupress()` plugin, take the same options plus `root`, `host` and `port`; `siteOptions` returns the HTMLKit options they use.

## Verification and contribution

Build and try the source with pnpm through Corepack. The example site serves at `/manual/`; open a version-specific link directly to see a reload keep the selected version:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build
node dist/cli.js dev --root examples/site
node dist/cli.js build --root examples/site
node dist/cli.js preview --root examples/site
```

```sh
corepack pnpm verify:inner
corepack pnpm verify:pr
corepack pnpm exec playwright install chromium
MARKUPRESS_BROWSER_TEST=1 corepack pnpm exec vitest run tests/package.test.ts --maxWorkers=1
```

The package contract packs and installs the actual package, runs its CLI, checks frozen imports and checks controller types. The browser proof exercises production and development controllers, keyboard version selection, reloads, mobile navigation, the home page and an axe accessibility audit. CI runs that browser proof separately.

Foundation pins TypeScript, Vitest, Oxlint and pnpm. [AGENTS.md](AGENTS.md) is the contributor contract; [threadlabs.config.json](threadlabs.config.json) records ownership. The [implementation plan](docs/plans/2026-10-04-1830-feat-markupress-platform-plan.md) defines product boundaries. Publishing uses the protected GitHub release workflow and npm environment.

## License

[MIT](LICENSE), copyright Threadlabs Studio contributors.
