# Markupress

Build a versioned Markdown documentation site with native HTML Next components, HTMLKit routing and a Looma theme. Markupress provides `build`, `dev`, `preview` and `snapshot` commands. Production output is a portable static directory; controllers enhance the rendered HTML in the browser.

The npm package `markupress@0.0.1` only reserves the name. The implementation below is being prepared for the first product release.

## Try the source build

Use Node 22.22.2 or later in Node 22, or Node 24.15 or later in Node 24, and pnpm through Corepack:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build
node dist/cli.js dev --root examples/site
node dist/cli.js build --root examples/site
node dist/cli.js preview --root examples/site
```

The example serves at `/manual/`. Open a version-specific link directly to verify that a reload preserves the selected version. Markupress is a thin layer over HTMLKit: it translates Markdown and manages versions, and HTMLKit routes, orders, renders, watches and builds the pages. The dev server reloads open pages after any edit, addition or deletion. `build` writes a static site, which is the only production output for now.

## Author a site

`@nextwebwg/html-next` and `@threadlabs/looma` are peer dependencies, so a site shares one copy of each with its own components. npm installs them with Markupress. Pages link Looma's components by package name, so a pnpm site adds both as its own dependencies:

```sh
pnpm add markupress @nextwebwg/html-next @threadlabs/looma
```

Create `docs/01.index.md` and optionally `markupress.config.json`:

```json
{
  "title": "Project documentation",
  "contentDir": "docs",
  "base": "/manual/",
  "outDir": "site"
}
```

Every version needs an `index.md` at its root; a numeric prefix such as `01.index.md` is allowed. `base` starts and ends with `/`. `layout` names a layout component that replaces the Markupress shell (see [Layouts](#layouts)). Configuration is JSON. The programmatic `buildSite`, `devSite` and `previewSite` APIs accept the same options plus `root`, `host` and `port`; `siteOptions` returns the HTMLKit options they use.

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
| `layout` | string or `false` | An HTMLKit layout, `app/layouts/<name>.html`, in place of the site's layout for this page (HTMLKit `hk:layout`). `false` renders the page with no layout. |
| `outline` | `false` or `[min, max]` | The heading levels in the page's "On this page" outline, `[2, 3]` by default. `false` gives an empty outline. |
| `head` | mapping | `meta` (name to content), `og` (Open Graph property without `og:`, to content) and `canonical` (a URL), rendered into the document head. |
| `editLink` | URL or `false` | The page's "Edit this page" URL, as `page.editLink` for the layout. `false` asks the layout to show none. |

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

Heading IDs are deterministic (`installation`, then `installation-1` for a duplicate). `## Setup {#install}` sets the ID to `install` and removes the marker from the heading; a duplicate still gets a suffix. A custom ID wins: a generated ID skips every custom ID and every ID already used, taking the next free suffix instead. Relative `.md` links resolve to the corresponding version-specific document, retaining fragments and queries; missing documents fail at build time. Relative assets are copied, and image paths starting with `/` resolve from that edition's public directory under the deployment base. Remote links remain unchanged. `navigation: hidden` hides a document from navigation while keeping its route available. Aliases do not add duplicate sidebar entries.

Containers and GitHub alerts render [Looma's shared blocks](https://github.com/threadlabs-studio/looma/blob/main/apps/docs/docs/shared-blocks.md), so a block looks the same in Markupress, Looma's components and LoomaEditor. The container name is matched without regard to case, and the rest of the opening line is its title:

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
````

| Markdown | Renders |
| --- | --- |
| `::: note`, `tip`, `info`, `important`, `warning`, `danger` or `caution`, with an optional title | `<ui-callout tone="…" heading="Title">`. `caution` is `danger`, and `note` is the muted aside. |
| `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` alone on a quote's first line | An untitled `<ui-callout>`: NOTE is `note` and CAUTION is `danger`. |
| `::: details Title`, with `{open}` to start expanded | Native `<details><summary>Title</summary>`, which opens without JavaScript. The title defaults to "Details". |
| `::: tabs` with `== Label` panels | `<ui-tabs group="tabs">`, one `<section aria-label="Label">` per panel. |
| `::: code-group` with a fence per panel | `<ui-tabs group="code-group">`, each panel labelled by its fence's `title`. `== Label` panels also work. |

Tabs in one group keep one selection across the page, matched by label, and remember it for the next visit: choosing "npm" in one code group switches every code group. `::: tabs name` or `::: code-group name` sets the group. Without JavaScript every panel shows. Any other container name stays text. To nest containers, give the outer one more colons (`::::` around `:::`). Titles and labels are literal text.

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
- These features apply to languages Shiki highlights and to plain text (`text`, `txt`, `plain` or `plaintext`). A fence with an unknown language or no language stays escaped text.

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

The command validates a build and writes `versioned_docs/v1/`, then atomically appends its descriptor to `versioned_docs/versions.json`. It mirrors Markdown, public assets and project-local component, controller, stylesheet and asset dependencies, preserving relative imports. Existing snapshots are never replaced. Keep those files in version control. Package imports continue to use the project's installed dependencies and lockfile; snapshots freeze authored sources rather than vendoring npm packages.

Use relative project-local imports for snapshot content. Absolute filesystem imports and remote resources retain their external ownership. If a snapshot process crashes, check that it has stopped before removing its `versioned_docs/.snapshot-lock` directory and recovering any incomplete destination.

For explicit versions, configure their order and labels:

```json
{
  "versions": [
    { "id": "current", "label": "Next", "directory": "docs" },
    { "id": "v1", "label": "Version 1", "directory": "versioned_docs/v1/_source/docs", "publicDir": "versioned_docs/v1/_source/public" }
  ],
  "defaultVersion": "v1"
}
```

Version IDs are URL slugs; they need not follow SemVer. A document's `id` identifies it across versions independently of its filename, route and generated component name. The version selector links to that identity in the other version, even if its route changed. If it is absent, the selector explains the fallback and links to that version's home. Selection lives in the URL and survives reloads.

## Theme and migration inputs

The default theme imports Looma's button and badge resources and CSS exports selectively. Its shell has a skip link, a top navigation bar, a grouped sidebar per section, native version links, an "on this page" outline, a footer and a saved light/dark preference, which an inline head script applies before first paint. It uses the platform's existing runtime.

Styles follow the component boundaries. Looma's tokens, its light and dark themes and the document defaults (`styles/base.css`) are page-wide, delivered through HTMLKit's `css` option. Each Markdown page component imports the documentation typography (`styles/prose.css`), so it styles that page and stops at any component the page embeds. The shell's own `<style>` styles the header, sidebar, columns and footer. `theme/theme.css` is page-wide too, because HTMLKit's built-in breadcrumbs and pager have no styles of their own and no component's scoped style reaches them; it also picks the logo for the theme in use. With `markdown()` alone, `markdown({ styles: [file] })` makes every Markdown page component import the given stylesheet files.

### Navigation, logo and footer

`markupress.config.json` (or `markupress()`) configures the shell around the pages:

```json
{
  "title": "Looma",
  "logo": { "light": "/img/mark.svg", "dark": "/img/mark-dark.svg" },
  "favicon": "/favicon.svg",
  "versionBadge": "v0.28",
  "nav": [
    { "label": "Get started", "href": "/" },
    { "label": "Components", "href": "/components/" },
    { "label": "Resources", "items": [{ "label": "HTML Next", "href": "https://nextwebwg.org/declarative-components/" }] }
  ],
  "social": [{ "label": "GitHub", "href": "https://github.com/threadlabs-studio/looma", "icon": "/img/github.svg" }],
  "sidebar": {
    "/": ["/", { "label": "Foundations", "items": ["/architecture/", "/tokens/"] }],
    "/editor/": ["/editor/", { "label": "Tables", "href": "/editor/#tables" }]
  },
  "footer": {
    "columns": [{ "title": "Docs", "items": [{ "label": "Tokens", "href": "/tokens/" }] }],
    "copyright": "Copyright 2026 Threadlabs Studio contributors."
  }
}
```

| Option | Does |
| --- | --- |
| `logo` | An image before the title: one path, or `{ "light", "dark" }`, one per theme. Paths starting with `/` are files in `public/`. |
| `favicon` | The site icon, a `<link rel="icon">` on every page. |
| `versionBadge` | The badge text beside the title. Without it, a site with several versions shows the selected version's label. |
| `nav` | Top navigation links, and dropdowns (`{ "label", "items" }`), which are native `<details>`. A link to the page being read, or to a section holding it, is marked current. |
| `social` | Links at the end of the top bar, each shown as its `icon` image, labelled by `label`, or as its label. |
| `sidebar` | Explicit sidebars by section path. |
| `footer` | Link columns (`{ "title", "items" }`) and a `copyright` line. |

An `href` starting with `/` is a page path in the version being read, so `/components/` opens that version's components. Other links stay as written.

**Sidebars.** Each top-level folder of a version is a section with its own sidebar, generated from the folder's pages; a page at the version's root shows every page. A `sidebar` entry replaces the generated sidebar of the section at its path. Its entries are page paths, which take the page's label, links (`{ "label", "href" }`), and groups (`{ "label", "items", "collapsed" }`, where `"collapsed": true` starts the group closed). A path such as `/editor/` that names a page also makes that page a section. A page path that names no page fails the build.

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

### Layouts

`"layout": "theme/layout.html"` in `markupress.config.json`, or `markupress({ layout })`, replaces the Markupress shell with a site's own HTML Next layout for every documentation page. The layout renders `<slot name="page">` where the page goes, and receives Markupress's loader data as props. It receives each prop it declares with `<prop>`, so it declares only the data it uses:

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
| `sidebar` | The page's section sidebar, in `<hk-nav>`'s tree shape: entries with `label`, `current`, `open`, `depth` and `children`, and an `href` on a page or link. A folder with an index page has both `href` and `children`; a configured group has no `href`. Pass it to `<hk-nav from:items="$sidebar">`. |
| `nav`, `social`, `footer` | The resolved `nav`, `social` and `footer` options: links have `label`, `href` and `current`, a dropdown has `items`, and a social link has its `icon` URL. |
| `logo`, `favicon`, `badge` | The logo's `light` and `dark` URLs, the icon URL (both `null` when unset), and the badge text. |
| `crumbs` | Navigation items from the version home down to this page. |
| `previous`, `next` | The neighbouring navigation items, absent at either end. |
| `versions` | Version links: `href`, `label`, `current` and `note`, which explains a fallback to that version's home. |
| `outline` | The page's headings in its `outline` range: `id`, `href` (`#id`), `label` and `depth`. |
| `contents` | A generated index's entries, `label`, `href` and `description`, and an empty list on every other page. |
| `page` | The page's front matter, plus its resolved `title` and document `id`. |

A folder's `_layout.html` inside a version's content wraps that folder's pages inside the site layout, as in any HTMLKit site. Its `_layout.server.ts` loader reads all of the data above from `parent.markupress`:

```ts
export function load({ parent }) { return { props: { section: parent.markupress.page.title } }; }
```

A layout receives exactly the props its component declares, which HTMLKit gives the loader as `propNames`. Declare navigation items with an open object type, which ends in `...`, so items keep passing as HTMLKit adds fields such as a route group's `group`.

HTMLKit plugins compose with Markupress through the site's `htmlkit.config.ts`, which the `markupress` command loads (see [Author a site](#author-a-site)).

Existing Markdown, HTML/CSS/Less/JavaScript/TypeScript examples, local assets, heading anchors and route aliases are migration inputs. The installed consumer fixture checks those under a nested base. A live Jess/Less documentation migration and visual/content parity comparison remain separate work.

## Verification and contribution

```sh
corepack pnpm verify:inner
corepack pnpm verify:pr
corepack pnpm exec playwright install chromium
MARKUPRESS_BROWSER_TEST=1 corepack pnpm exec vitest run tests/package.test.ts --maxWorkers=1
```

The package contract packs and installs the actual package, runs its CLI, checks frozen imports and checks controller types. The browser proof exercises production and development controllers, keyboard version selection, reloads, mobile navigation and an axe accessibility audit. CI runs that browser proof separately.

Foundation pins TypeScript, Vitest, Oxlint and pnpm. [AGENTS.md](AGENTS.md) is the contributor contract; [threadlabs.config.json](threadlabs.config.json) records ownership. The [implementation plan](docs/plans/2026-10-04-1830-feat-markupress-platform-plan.md) defines product boundaries. Publishing uses the protected GitHub release workflow and npm environment.

## License

[MIT](LICENSE), copyright Threadlabs Studio contributors.
