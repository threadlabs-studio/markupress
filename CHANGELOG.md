# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Markupress is now a thin layer over HTMLKit 1.0.0-alpha.47, with HTML Next 1.0.0-alpha.47 and Looma 0.28.0. HTMLKit delivers pages as compiled components, so a page ships its components' code rather than the HTML Next live runtime. The `markdown()` HTMLKit plugin translates `.md` files into pages, and `markupress()` adds versioning and the theme; HTMLKit routes, orders, watches, renders, and builds the pages. The CLI runs HTMLKit with both plugins. Markupress's own routing, ordering, link-to-URL logic, file watcher, and generated `.markupress/` application are gone.
- Each Markdown file is its own page component, so diagnostics and relative references name the original file. Front matter becomes HTMLKit page metadata: the sidebar label, `sidebarHidden`, and `aliases`.
- Referenced images and files are served from `/_htmlkit/files/` instead of `/_markupress/assets/`.
- Ordering prefixes are HTMLKit's number and dot: rename `01-guide/02-install.md` to `01.guide/02.install.md`. The theme's navigation is HTMLKit's built-in `<hk-nav>`, with `<hk-breadcrumbs>` above each page and `<hk-pager>` previous/next links below it, styled by a global theme stylesheet (`theme/theme.css`) that HTMLKit adds to every page.
- Looma's tokens and light/dark themes and the document defaults are page-wide through HTMLKit's `css` option, so they reach `:root`; imported into the shell's scoped `<style>`, they never applied. Each Markdown page component imports the documentation typography (`styles/prose.css`, also exported), and `markdown({ styles })` adds stylesheet files to every Markdown page component.
- `markupress snapshot` also mirrors the stylesheets a component imports, which HTMLKit now delivers apart from the component's own CSS.
- A saved dark theme applies before first paint through the plugin's HTMLKit head script, so dark-theme readers no longer see one light frame on each page load.
- `prepareSite` is replaced by `siteOptions`, which returns the HTMLKit options the CLI uses.
- `## Title {#custom-id}` sets a heading's ID. A fence such as `ts title="app/pages/index.ts"` renders its code in `<figure class="code">` with the title as the caption.
- Fenced code is highlighted at build time with Shiki's `github-light-default` and `github-dark-default` themes. Token colors use CSS `light-dark()`, so they follow the theme's color scheme with no client JavaScript. Braces in code stay literal. The theme draws code blocks on Looma's sunken surface (`--ui-surface-sunken`).
- `compileMarkdown` now returns a Promise.
- Containers and GitHub alerts render Looma's shared blocks. `::: note`, `tip`, `info`, `important`, `warning` and `danger` (`caution` is `danger`), with an optional title, and `> [!NOTE]` through `> [!CAUTION]` alerts render `<ui-callout>`. `::: details Title {open}` renders native `<details>`. `::: tabs` and `::: code-group`, with `== Label` panels or a code group's fence titles, render `<ui-tabs>` with a group, which keeps one selection across the page and remembers it. An outer container uses more colons to nest, and any other container name stays text. A page links the Looma components its blocks use, and the theme spaces the blocks and styles the Markdown inside them.
