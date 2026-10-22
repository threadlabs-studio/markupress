---
title: Markupress 0.8.0, Expressive Markdown as the content engine
type: feat
date: 2026-10-22
---

# Markupress 0.8.0: Expressive Markdown as the content engine

## Goal

Markupress's content language is [Expressive Markdown](https://nextwebwg.org/expressive-markdown/language). 0.8.0 renders every page with expressmark's `parse` and `renderHtml`, then runs Markupress's existing HTML Next and HTMLKit step on the rendered tree: link, asset and `@/` resolution, head declarations, native component carriers and code highlighting. Looma's markdown-it renderer (`createLoomaMarkdownIt` in `src/content.ts` and `src/navigation.ts`) leaves Markupress.

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
| Callouts | `::: warning Title` | `::: warning [Title]` | `<section data-type="warning"><header>` | Transformer to `ui-callout` (gap 2) |
| `caution`, `info`, `important` | Aliases and tones | Custom types | `section[data-type]` | Transformer maps tones |
| GitHub alerts | `> [!NOTE]` | Not defined | Quotation with the marker as text | Gap 6 |
| Details | `::: details Title {open}` | `::: details [Title] {open}` | Native `<details>` | None |
| Tabs and code groups | `::: tabs` / `::: code-group`, `== Label` | Consecutive `::: tab [Label]`, `:::: tabs {name=…}` | `section[data-type="tabs"]` | Transformer to grouped `ui-tabs` (gap 2) |
| Figures | `::: figure Caption` | `::: figure [Caption]` | Native `<figure>` | None |
| Image placement | `{placement=wrap-left}` | `::: layout {float=start}` / `{align=center}` | Logical layout CSS | None |
| Table of contents | `::toc{depth=2}` | `::: toc [Title] {depth=2}` placeholder | Empty placeholder | Transformer fills it from gap 3's anchors |
| Chips | `:chip[Ready]{tone=green}` | Same | `span[data-type="chip"][data-tone]` | Theme CSS reads `data-tone` |
| Mentions | `:mention[Ada]{id=u1}` | `@[Ada]#u1` | `span[data-type="mention"][data-ref]` | Theme CSS |
| Code highlighting | Shiki at build time | Code stays literal | `<pre><code class="language-…">` | Async highlight pre-pass keyed by node; transformer returns it (gaps 2 and 4) |
| Code title, highlights, numbers | `title="…"`, `{1,3-5}`, `:line-numbers` | `{title="…" highlight=1,3-5 show-line-numbers}` | `figcaption`, `data-highlight`, `data-show-line-numbers` | Shiki line classes |
| `// [!code highlight]` | Looma code notation | Comments stay in the code | Literal | Markupress keeps handling it |
| Copy and Wrap buttons | `figure.code` with buttons | Renderer's choice | None | Gap 2 |
| Literal braces | Text and code escape `{` | No HTML Next meaning | Raw `{` in text | Gap 4 |
| Native components in Markdown | `<template component>`, custom elements, `<link rel="component">` | Safe HTML profile | Dropped by `parse` | Gap 1 |
| Head elements in Markdown | `<title>`, `<meta>`, `<link>` lifted into `<defs>` | Safe HTML profile | Dropped | Gap 1 |
| Links, images, `@/` | Post-render on the parsed tree | Kept as authored | `href`, `src` as written | Post-step unchanged |
| Home layout | Read from the rendered tree | Same Markdown | Native HTML | Post-step unchanged, with gap 2 for Looma components |
| Footer (`_footer.md`) | Parsed with Looma's markdown-it | Same Markdown | AST | Read the AST |

## Gaps in Expressive Markdown and expressmark

Ordered by how much they block. None has a workaround in Markupress.

1. **`parse` drops raw HTML outside the safe profile.** `<template component>` carriers, custom elements (`<demo-x>`, `<ui-callout>`), `<link rel="component">`, `<title>`, `<meta>` and `<style>` become empty paragraphs in the AST, so HTML Next components in Markdown, the 1.0 headline feature (C9), can't work. Needed: a host-trusted mode that keeps raw HTML blocks and inline HTML as opaque `html` nodes, rendered as written.
2. **`renderHtml` sanitizes all output, transformer output included, with no bypass.** Custom elements, `<button>` and `<input>` are removed (verified), so Looma components, the code Copy and Wrap buttons and task checkboxes can't render, and Shiki's `light-dark()` colors and `--shiki-*` properties need checking under the profile. Needed: a host profile or allowlist option for custom-element tags and attributes, buttons, inputs and the style properties code highlighting writes.
3. **No heading anchors in the output.** `renderHtml` writes only authored IDs, and the AST adds no implicit ones. Needed: the specification's recommended anchor algorithm as an exported function, or a render option that writes the recommended anchors, so anchors, outlines, tables of contents and links agree with the specification and LoomaEditor.
4. **Literal text cannot be told from HTML in the output.** Markupress escapes `{` in Markdown text and code so HTML Next never reads it as an expression, while raw HTML keeps its expressions. `renderHtml` returns one string, and a simple paragraph carries its text as a `value`, so no transformer escapes only the text. Needed: a text-escaping hook applied to every rendered text run and code value, or output that marks passed-through HTML.
5. **The document title renders as an `<h1>`.** Front matter `title` leaves `metadata` and renders first, so a page with a `title` and a `# Heading` has two `<h1>` elements. Needed: a render option that leaves the designated title out, with `document.title` still readable.
6. **GitHub alerts.** Expressive Markdown has no alert form; `> [!TIP]` renders as a quotation. Plan row C4 accepts both alerts and colon containers. Decision needed: Expressive Markdown maps alerts onto its callout types, or Markupress drops them and sites convert alerts once.

A `resolveUrl(url, { kind })` render option is under consideration in Expressive Markdown; Markupress's post-step resolves links, images and `@/` today and would move onto it.

## Order of work

1. Expressive Markdown and expressmark close gaps 1 to 5, and the owner decides gap 6.
2. Markupress renders with `parse` and `renderHtml`, with transformers for callouts, tabs, code, the table of contents, heading links and the footer, and keeps its parse5 post-step.
3. Expressive Markdown fixtures replace the Looma Markdown conformance test.
4. A one-time conversion script rewrites Markupress-specific syntax (the table above), and converts `website/`, `examples/site` and the `create-markupress` starter.
5. The theme's CSS follows the new output (`data-tone`, the footnotes section, `section[data-type]`).
6. Release 0.8.0 with the conversion steps in its changelog.
