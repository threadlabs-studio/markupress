---
title: Markupress 0.8.0, Expressive Markdown as the content engine
type: feat
date: 2026-10-22
---

# Markupress 0.8.0: Expressive Markdown as the content engine

## Goal

Markupress's content language is [Expressive Markdown](https://nextwebwg.org/expressive-markdown/language). 0.8.0 renders every page with expressmark's `parse` and `renderHtml`, then runs Markupress's existing HTML Next and MarkupKit step on the rendered tree: link, asset and `@/` resolution, head declarations, native component carriers and code highlighting. Looma's markdown-it renderer (`createLoomaMarkdownIt` in `src/content.ts` and `src/navigation.ts`) leaves Markupress.

Probed against expressmark 0.1.7, which has footnotes and link references (specs #120 and #121, expressmark #16).

## Feature map

| Markupress feature | Today (Looma Markdown) | Expressive Markdown | Expressmark 0.1.7 output | Markupress step |
| --- | --- | --- | --- | --- |
| GFM tables, tasks, strikethrough, autolinks | Same syntax | Same syntax | Native HTML; tasks as `☑`/`☐` text | Task checkboxes need gap 2 |
| Footnotes | `[^1]` | `[^1]`, definitions stay where written | `<sup><a data-footnote-ref>` and `<section data-footnotes aria-label="Footnotes">` | Theme CSS follows the `aria-label` section |
| Link references | Same | Kept, references keep their form | Resolved `<a href>` | Post-step resolves the `href` |
| Front matter | YAML, validated | YAML: `title` is the document title, the rest is `metadata` | Title as a leading `<h1>` | Gap 5 |
| Heading anchors | Generated, Looma rule | Recommended output anchors | Authored `{#id}` only | Gap 3 |
| `{#id}` | Same | Same | `id` | None |
| Callouts | `::: warning Title` | `::: warning [Title]`, and `::: warning Title` as a supported spelling | `<section data-type="warning"><header>` | Transformer to `ui-callout` (gap 2) |
| `caution`, `info`, `important` | Aliases and tones | Custom types | `section[data-type]` | Transformer maps tones |
| Typeless container | None | `::: {.x #id …}` or a bare `:::` opener: a generic container | A plain `<div>` with its attributes | Transformer renders a default `ui-callout`, keeping its classes, id and other attributes (owner, 2026-10-22) |
| GitHub alerts | `> [!NOTE]` | A supported spelling of callouts; the AST records the form | The callout node | Transformer to `ui-callout` |
| Details | `::: details Title {open}` | `::: details [Title] {open}`, and the unbracketed spelling | Native `<details>` | None |
| Tabs and code groups | `::: tabs pm` / `::: code-group`, `== Label` | Consecutive `::: tab [Label]`, `:::: tabs {group=…}`; `::: code-group` reads as a container | `section[data-type="tabs"]` | Transformer to grouped `ui-tabs` (gap 2) |
| Figures | `::: figure Caption` | `::: figure [Caption]`, and the unbracketed spelling | Native `<figure>` | None |
| Image placement | `{placement=wrap-left}` | Image attributes, kept as written; `::: layout {float=start}` / `{align=center}` | Logical layout CSS | Transformer reads `placement` |
| Table of contents | `::toc{depth=2}` | A `toc` leaf with attributes; `::: toc [Title] {depth=2}` placeholder | Empty placeholder | Transformer fills it from gap 3's anchors |
| Chips | `:chip[Ready]{tone=green}` | Same | `span[data-type="chip"][data-tone]` | Theme CSS reads `data-tone` |
| Mentions | `:mention[Ada]{id=u1}` | `@[Ada]#u1`; `:mention` is converted | `span[data-type="mention"][data-ref]` | Theme CSS |
| Code highlighting | Shiki at build time | Code stays literal | `<pre><code class="language-…">` | Async highlight pre-pass keyed by node; transformer returns it (gaps 2 and 4) |
| Code title, highlights, numbers | `title="…"`, `{1,3-5}`, `:line-numbers` | `{title="…" highlight=1,3-5 show-line-numbers}`; Markupress's spelling stays in the code node's `meta` | `figcaption`, `data-highlight`, `data-show-line-numbers` | Shiki line classes |
| `// [!code highlight]` | Looma code notation | Comments stay in the code | Literal | Markupress keeps handling it |
| Copy and Wrap buttons | `figure.code` with buttons | Renderer's choice | None | Gap 2 |
| Literal braces | Text and code escape `{` | No HTML Next meaning | Raw `{` in text | Gap 4 |
| Native components in Markdown | `<template component>`, custom elements, `<link rel="component">` | Safe HTML profile | Dropped by `parse` | Gap 1 |
| Head elements in Markdown | `<title>`, `<meta>`, `<link>` lifted into `<defs>` | Safe HTML profile | Dropped | Gap 1 |
| Links, images, `@/` | Post-render on the parsed tree | Kept as authored | `href`, `src` as written | Post-step unchanged |
| Home layout | Read from the rendered tree | Same Markdown | Native HTML | Post-step unchanged, with gap 2 for Looma components |
| Footer (`_footer.md`) | Parsed with Looma's markdown-it | Same Markdown | AST | Read the AST |

## Gaps in Expressive Markdown and expressmark

The owner decided all six on 2026-10-22, and expressmark 0.1.10 builds them:

1. **Raw HTML:** a trusted-host profile keeps raw HTML, so native component carriers, custom elements, `<link rel="component">`, head elements and `<style>` reach the page.
2. **Render profile:** an allowlist admits custom elements, controls and code-highlighting styles in `renderHtml` output.
3. **Heading anchors:** `headingIds` writes the recommended anchors.
4. **Literal text:** an `escapeText` hook runs after the sanitizer on marked text runs, so Markupress escapes `{` in text and code only.
5. **Document title:** an option leaves the title `<h1>` out, and `document.title` stays readable.
6. **GitHub alerts:** a supported spelling of callouts, producing the callout node with its authored form recorded.

Whenever Expressive Markdown reads more than one spelling, the AST stores the authored form and writers write it back.

## Conversion

The one-time conversion script rewrites only what Expressive Markdown does not read:

| Markupress spelling | Expressive Markdown |
| --- | --- |
| `== Label` panels inside `::: tabs` | A `::: tab [Label]` container per panel |
| `:mention[Label]{id=ref}` | `@[Label]#ref` |
| `::: tabs pm` (a selection name) | `:::: tabs {group=pm}`, as expressmark writes it |

Unbracketed container titles, GitHub alerts, `::: code-group`, `::toc{…}`, fence info such as `{1,3-5} title="…" :line-numbers`, chips and image `placement` are read as written.

## Order of work

1. Pin expressmark exactly (0.1.10, then the release with typeless containers and the `.class` and `#id` shorthand).
2. Markupress renders with `parse` and `renderHtml`, with transformers for callouts, tabs, code, the table of contents, heading links and the footer, and keeps its parse5 post-step.
3. Expressive Markdown fixtures replace the Looma Markdown conformance test.
4. A one-time conversion script rewrites Markupress-specific syntax (the table above), and converts `website/`, `examples/site` and the `create-markupress` starter.
5. The theme's CSS follows the new output (`data-tone`, the footnotes section, `section[data-type]`).
6. Release 0.8.0 with the conversion steps in its changelog.
