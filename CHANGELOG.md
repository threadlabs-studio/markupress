# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Markupress runs as a live runtime on HTMLKit 1.0.0-alpha.37. Development renders each page from Markdown in memory through HTMLKit's `application.fetch`, and HTMLKit's watcher regenerates the site and reloads open pages after each edit. The generated `.markupress/` application directory and Markupress's own file watcher are gone. Each Markdown file is its own page component, so diagnostics and relative references name the original file. `build` still writes a static site, the only production output for now.
- A saved dark theme applies before first paint through HTMLKit's `app/head.js`, so dark-theme readers no longer see one light frame on each page load.
- `prepareSite` returns HTMLKit application options with `generate()` instead of the path of a generated application.
