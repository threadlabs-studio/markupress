# Markupress

Build a versioned Markdown documentation site with native HTML Next components, HTMLKit routing and a Looma theme. Markupress provides `dev`, `build`, `preview` and `snapshot` commands, and `build` writes a portable static site.

**Documentation: [threadlabs-studio.github.io/markupress](https://threadlabs-studio.github.io/markupress/)**

- **Markdown:** GitHub Flavored Markdown with footnotes, callouts, details, tabs and code groups, shared with Looma's components and LoomaEditor.
- **Code blocks:** Shiki highlighting at build time in both themes, titles, line highlights and numbers, copy and wrap.
- **Components:** native HTML Next components in any page, with TypeScript controllers.
- **Navigation:** sections and sidebars from folders, a top navigation, breadcrumbs, an "On this page" outline, a mobile drawer, edit links and last-updated dates.
- **Versions:** `markupress snapshot v1` records the docs, and readers switch versions on the same document.
- **Theme:** Looma's light and dark themes, a home layout, a footer, and site layouts that replace the shell.

## Get started

Use Node 22.22.2 or later in Node 22, or Node 24.15 or later in Node 24:

```sh
npm install markupress
npx markupress dev       # serve docs/ with live reload
npx markupress build     # write the static site to site/
npx markupress preview   # serve the built site
```

`docs/index.md` is a complete site. The [guide](https://threadlabs-studio.github.io/markupress/guide/getting-started/) covers project structure, writing, navigation, versions, theming and SEO, and the [reference](https://threadlabs-studio.github.io/markupress/reference/) covers configuration, the command line and the API.

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

The package contract packs and installs the actual package, runs its CLI, checks frozen imports and checks controller types. The browser proof exercises production and development controllers under HTMLKit's generated Content Security Policy, failing on any violation, keyboard version selection, reloads, mobile navigation, the home page and an axe accessibility audit. CI runs that browser proof separately, and builds both sites. A push to `main` deploys the documentation site to GitHub Pages.

Foundation pins TypeScript, Vitest, Oxlint and pnpm. [AGENTS.md](AGENTS.md) is the contributor contract; [threadlabs.config.json](threadlabs.config.json) records ownership. The [implementation plan](docs/plans/2026-10-04-1830-feat-markupress-platform-plan.md) defines product boundaries. Publishing uses the protected GitHub release workflow and npm environment.

## License

[MIT](LICENSE), copyright Threadlabs Studio contributors.
