# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Markupress is now a thin layer over HTMLKit 1.0.0-alpha.41. The `markdown()` HTMLKit plugin translates `.md` files into pages, and `markupress()` adds versioning and the theme; HTMLKit routes, orders, watches, renders, and builds the pages. The CLI runs HTMLKit with both plugins. Markupress's own routing, ordering, link-to-URL logic, file watcher, and generated `.markupress/` application are gone.
- Each Markdown file is its own page component, so diagnostics and relative references name the original file. Front matter becomes HTMLKit page metadata: the sidebar label, `sidebarHidden`, and `aliases`.
- Referenced images and files are served from `/_htmlkit/files/` instead of `/_markupress/assets/`.
- Ordering prefixes are HTMLKit's number and dot: rename `01-guide/02-install.md` to `01.guide/02.install.md`. The theme's navigation is HTMLKit's built-in `<hk-nav>`, with `<hk-breadcrumbs>` above each page and `<hk-pager>` previous/next links below it, styled by a global theme stylesheet (`theme/theme.css`) that HTMLKit adds to every page.
- A saved dark theme applies before first paint through the plugin's HTMLKit head script, so dark-theme readers no longer see one light frame on each page load.
- `prepareSite` is replaced by `siteOptions`, which returns the HTMLKit options the CLI uses.
- `## Title {#custom-id}` sets a heading's ID. `::: name` … `:::` wraps Markdown in `<div class="name">`, and an outer container uses more colons to nest. A fence such as `ts title="app/pages/index.ts"` renders its code in `<figure class="code">` with the title as the caption.
- Fenced code is highlighted at build time with Shiki's `github-light-default` and `github-dark-default` themes. Token colors use CSS `light-dark()`, so they follow the theme's color scheme with no client JavaScript. Braces in code stay literal. The theme draws code blocks on the page surface with a border, because the highlighting colors keep 4.5:1 contrast there.
- `compileMarkdown` now returns a Promise.
