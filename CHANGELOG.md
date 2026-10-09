# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Markupress is now a thin layer over HTMLKit 1.0.0-alpha.41. The `markdown()` HTMLKit plugin translates `.md` files into pages, and `markupress()` adds versioning and the theme; HTMLKit routes, orders, watches, renders, and builds the pages. The CLI runs HTMLKit with both plugins. Markupress's own routing, ordering, link-to-URL logic, file watcher, and generated `.markupress/` application are gone.
- Each Markdown file is its own page component, so diagnostics and relative references name the original file. Front matter becomes HTMLKit page metadata: the sidebar label, `sidebarHidden`, and `aliases`.
- Referenced images and files are served from `/_htmlkit/files/` instead of `/_markupress/assets/`.
- Ordering prefixes are HTMLKit's number and dot: rename `01-guide/02-install.md` to `01.guide/02.install.md`. The theme's navigation is HTMLKit's built-in `<hk-nav>`, with `<hk-breadcrumbs>` above each page and `<hk-pager>` previous/next links below it, styled by a global theme stylesheet (`theme/theme.css`) that HTMLKit adds to every page.
- A saved dark theme applies before first paint through the plugin's HTMLKit head script, so dark-theme readers no longer see one light frame on each page load.
- `prepareSite` is replaced by `siteOptions`, which returns the HTMLKit options the CLI uses.
