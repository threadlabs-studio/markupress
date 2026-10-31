# Markupress

Build a versioned Markdown documentation site with native HTML Next components, MarkupKit routing and a Looma theme. Markupress provides `dev`, `build`, `preview` and `snapshot` commands, and `build` writes a portable static site.

**Documentation: [threadlabs-studio.github.io/markupress](https://threadlabs-studio.github.io/markupress/)**

- **Markdown:** Expressmark standard syntax with footnotes, bracketed callouts, details, adjacent tabs and named list tables.
- **Code blocks:** Shiki highlighting at build time in both themes, titles, line highlights and numbers, copy and wrap.
- **Components:** native HTML Next components in any page, with TypeScript controllers.
- **Navigation:** sections and sidebars from folders, a top navigation, breadcrumbs, an "On this page" outline, a mobile drawer, edit links and last-updated dates.
- **Search:** typo-tolerant local search of each version, with page/content exclusions and keyboard result selection, opened with `/` or Ctrl+K.
- **Versions:** `markupress snapshot v1` records the docs, and readers switch versions on the same document.
- **Theme:** a coordinated light/dark Markupress palette, Looma controls, a home layout, a footer, and site layouts that replace the shell.

## Get started

Use Node 22.22.2 or later in Node 22, or Node 24.15 or later in Node 24. `npm create markupress` starts a site:

```sh
npm create markupress@latest docs
```

Or add Markupress to a project:

```sh
npm install markupress
npx markupress dev       # serve docs/ with live reload
npx markupress build     # write the static site to site/
npx markupress preview   # serve the built site
```

`docs/index.md` is a complete site. The [guide](https://threadlabs-studio.github.io/markupress/guide/getting-started/) covers project structure, writing, navigation, versions, theming and SEO, and the [reference](https://threadlabs-studio.github.io/markupress/reference/) covers configuration, the command line and the API.

## Home pages

Set `layout: home` in Markdown front matter. The h1 and introductory paragraphs form the hero, a paragraph containing only links supplies its actions, and each h2 starts a feature card. The first action uses the theme accent.

An image can sit beside the story. To show live components there instead, import their definitions and mark one top-level wrapper `data-hero-media`:

```html
<link rel="component" href="@/app/components/product-preview.html">

<div data-hero-media>
<product-preview></product-preview>
</div>
```

The media stacks below the story on narrow screens. Its components retain their own styling and behavior.

## Build from source

Build and try the source with pnpm through Corepack. The documentation site is in `website/`, built by Markupress itself, and the example site in `examples/site/` serves at `/manual/`:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build
node dist/cli.js dev --root website
node dist/cli.js dev --root examples/site
corepack pnpm build:sites
```

```sh
corepack pnpm verify:inner
corepack pnpm verify:pr
corepack pnpm exec playwright install chromium
MARKUPRESS_BROWSER_TEST=1 corepack pnpm exec vitest run tests/package.test.ts --maxWorkers=1
```

The package contract packs and installs the actual package, runs its CLI, checks frozen imports and checks controller types. The browser proof exercises production and development controllers under MarkupKit's generated Content Security Policy, failing on any violation, keyboard version selection, reloads, mobile navigation, the home page and an axe accessibility audit. CI runs that browser proof separately, and builds both sites. A push to `main` deploys the documentation site to GitHub Pages.

Foundation pins TypeScript, Vitest, Oxlint and pnpm. [AGENTS.md](AGENTS.md) is the contributor contract; [threadlabs.config.json](threadlabs.config.json) records ownership. The [implementation plan](docs/plans/2026-10-04-1830-feat-markupress-platform-plan.md) defines product boundaries. Merges to main automatically publish a verified patch release through GitHub Actions and the npm environment. A larger version declared in a PR is preserved. Release snapshots keep Markupress and its starter aligned; rerunning the same source resumes the frozen version after a partial publication. The release workflow and runner are locally owned in the Foundation manifest.

## License

[MIT](LICENSE), copyright Threadlabs Studio contributors.

## Theme the whole documentation site

Markupress ships a paired ink-and-paper palette with a cobalt accent, exported from Looma's customizer. The editable recipe is in `theme/looma.theme.json`; its generated CSS is the default theme, loaded in the base cascade layer so a site's overrides take precedence.

Its shell, navigation rows, current selection, focus, prose and controls consume Looma's public semantic properties, so a site can apply a different identity throughout. Use Looma's `--ui-font-sans`, `--ui-font-display` and `--ui-font-mono` for typography. Put site-wide overrides in `app/site.css`, listed in MarkupKit's `css` option.

Keep styling for a new identity at that theme boundary rather than selecting the internals of nested Looma controls. Set `--markupress-background` to add a page-wide texture or gradient; it defaults to `var(--ui-surface)` and can use the same semantic colors.

Without a saved mode, the site follows the operating system and responds when that preference changes. The header uses one Looma CycleButton: activate it to move through Automatic, Light and Dark. Its monitor, sun or moon icon shows the current choice. Explicit Light/Dark choices are remembered; Automatic clears the override and follows the operating system. Header actions reserve separate cells for the adjustable invisible hit-area preference, so their visible buttons stay compact without overlapping targets. The theme uses Looma’s shared controls and contextual navigation colors. In an application that supplies its own mode switch, set `data-theme="light"` or `data-theme="dark"`; nested boundaries apply only to their descendants. Remove the root attribute when using the CSS directly to follow system preference.

The shared shell supports `--markupress-sidebar-width`, `--markupress-content-width`, `--markupress-page-width` and `--markupress-outline-width`. Navigation is rendered by Looma's Disclosure and Nav Item components and uses its `--ui-nav-*`, `--ui-selection-*`, typography, spacing and focus families. Set `sidebarNavigation: 'sections'` for category links with pages listed only beneath the current category. A category opens its overview, or its first page when it has no overview; this mode uses ordinary links without disclosure toggles and works without JavaScript. The default `tree` mode retains nested disclosures. On narrow screens navigation becomes a native popover drawer.

Set `headerNotice` to show a removable status chip before search. Dismissal emits `markupress-header-notice-dismiss` on `window`; the application owns the reset action. `--markupress-header-notice-display` can conditionally hide the chip. Header brand and navigation text share a baseline; gaps follow Looma’s spacing scale.
