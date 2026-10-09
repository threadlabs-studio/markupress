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

Create `docs/01.index.md` and optionally `markupress.config.json`:

```json
{
  "title": "Project documentation",
  "contentDir": "docs",
  "base": "/manual/",
  "outDir": "site"
}
```

Every version needs an `index.md` at its root; a numeric prefix such as `01.index.md` is allowed. `base` starts and ends with `/`. Configuration is JSON. The programmatic `buildSite`, `devSite` and `previewSite` APIs accept the same options plus `root`, `host` and `port`; `siteOptions` returns the HTMLKit options they use.

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
sidebarLabel: Install
id: install
aliases: [/getting-started/]
---
# Installation

[Next steps](03.usage.md#usage)

<link rel="component" href="../../components/counter.html">

<demo-counter></demo-counter>
```

`01.guide/02.install.md` becomes `/v/current/guide/install/`. Numeric prefixes order HTMLKit navigation and disappear from URLs. The unversioned `/guide/install/` alias selects the configured default version. Changing `02.` to `10.` changes ordering without changing the path. Duplicate paths or document IDs fail with both source filenames.

Markdown text and fenced examples are literal, including braces and component syntax. Raw HTML outside fences can declare or use native components. Resource links remain relative to the original Markdown file. A component declared in Markdown is hoisted alongside the generated page carrier; its expressions retain HTML Next semantics. Frontmatter title and description become metadata inside the owning page component. Explicit `<title>`, `<meta>` and non-component `<link>` elements also become page metadata.

Heading IDs are deterministic (`installation`, then `installation-1` for a duplicate). `## Setup {#install}` sets the ID to `install` and removes the marker from the heading; a duplicate still gets a suffix. A custom ID wins: a generated ID skips every custom ID and every ID already used, taking the next free suffix instead. Relative `.md` links resolve to the corresponding version-specific document, retaining fragments and queries; missing documents fail at build time. Relative assets are copied, and image paths starting with `/` resolve from that edition's public directory under the deployment base. Remote links remain unchanged. `sidebarHidden: true` hides a document from navigation while keeping its route available. Aliases do not add duplicate sidebar entries.

A container wraps Markdown in a classed `<div>`. Its name starts with a letter and contains letters, digits, `_` and `-`; any other line stays text. To nest containers, give the outer one more colons:

```markdown
:::: details
Outer content.

::: warning
Inner **Markdown** content.
:::
::::
```

This produces `<div class="details">` containing `<div class="warning">`. The theme does not style container names; a site styles the classes it uses.

Fenced code is highlighted at build time with [Shiki](https://shiki.style), so pages load no highlighting JavaScript. Any language Shiki bundles, such as `html`, `css`, `less`, `js`, `ts`, `tsx`, `jsx`, `json`, `bash`, `vue`, `svelte`, `md` or `yaml`, is loaded the first time a fence uses it. Unknown languages stay plain text. A `title` in the fence's info string adds a caption:

````markdown
```ts title="app/pages/index.ts"
export const count = 1;
```
````

This renders `<figure class="code"><figcaption>app/pages/index.ts</figcaption><pre>…</pre></figure>`. A fence without a title is a plain `<pre>`.

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

HTMLKit resolves `counter.js` to `counter.ts` in development and bundles its JavaScript for production. Vite transpiles; it does not type-check. Install TypeScript and `@nextwebwg/html-next` as direct development dependencies when importing its controller types, and run your project's strict TypeScript check separately. Markupress maintains its controllers with TypeScript 7. Checked JSDoc is an authoring option for your own controllers.

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

The default theme imports Looma's button resources and CSS exports selectively, with HTMLKit's generic navigation component. It includes a skip link, native version links, a responsive navigation toggle and a saved light/dark preference, which an inline head script applies before first paint. It uses the platform's existing runtime.

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
