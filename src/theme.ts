import { escapeHTML, literal } from './content.js';

export function themeResource(title: string, base: string): string {
  const controller = 'markupress/controllers/shell.js';
  title = literal(escapeHTML(title));
  return `<link rel="component" href="@nextwebwg/htmlkit/components/navigation.html">
<link rel="component" href="@threadlabs/looma/components/ui-button/ui-button.html">
<template component="markupress-shell" controller="${controller}">
<title>${title}</title><defs>
<prop name="navigation" type="list(object({ href: string, label: string, current: string, depth: number, pageName: string }))" required>Documentation links</prop>
<prop name="versions" type="list(object({ href: string, label: string, current: string, note: string }))" required>Documentation versions</prop>
<state name="menu" type="boolean" value="true"></state>
<state name="dark" type="boolean" value="false"></state></defs>
<div class="site"><a class="skip" href="#documentation-content">Skip to content</a>
<header><a class="brand" href="${base}">${title}</a><div class="actions">
<ui-button variant="ghost" tone="neutral" data-action="menu" from:aria-expanded="$menu" aria-controls="documentation-navigation">Navigation</ui-button>
<ui-button variant="ghost" tone="neutral" data-action="theme" from:aria-pressed="$dark">Dark theme</ui-button></div></header>
<div class="columns"><aside id="documentation-navigation" $if="$menu">
<htmlkit-navigation from:items="$navigation" label="Documentation"></htmlkit-navigation>
<nav class="versions" aria-label="Documentation versions"><strong>Versions</strong><ul><li $each="version of $versions"><a from:href="$version.href" from:aria-current="$version.current" $value="$version.label"></a><small $if="$version.note" $value="$version.note"></small></li></ul></nav>
</aside><main id="documentation-content" tabindex="-1"><slot name="page"></slot></main></div></div>
<style>
@import "@threadlabs/looma/tokens.css";
@import "@threadlabs/looma/theme-light.css";
@import "@threadlabs/looma/theme-dark.css";
@import "markupress/styles/base.css";
:host { display: block; background: var(--ui-surface); color: var(--ui-text); font: 1rem/1.7 system-ui, sans-serif; min-height: 100vh; }
header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--ui-border, #8885); padding: 1rem max(1rem, calc((100vw - 80rem) / 2)); }
.brand { color: inherit; font-size: 1.15rem; font-weight: 700; text-decoration: none; } .actions { display: flex; flex-wrap: wrap; gap: .5rem; }
.columns { display: flex; gap: 3rem; max-width: 80rem; margin: auto; padding: 2rem 1.5rem; } aside { flex: 0 0 15rem; } main { min-width: 0; flex: 1; max-width: 65ch; } .versions { margin-top: 2rem; } nav ul { padding: 0; list-style: none; } nav li { margin: .4rem 0; } nav [data-depth="2"] { padding-left: .75rem; } nav [data-depth="3"] { padding-left: 1.5rem; }
a { color: var(--ui-accent); text-underline-offset: .2em; } a[aria-current="page"] { font-weight: 700; } small { display: block; color: var(--ui-text-muted, inherit); line-height: 1.4; } :focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 3px; }
.skip { position: absolute; top: .5rem; left: 1rem; transform: translateY(-200%); padding: .5rem 1rem; background: var(--ui-surface); z-index: 1; } .skip:focus { transform: none; }
@media (max-width: 640px) { header { align-items: flex-start; flex-direction: column; } .columns { display: block; padding: 1rem; } aside { margin-bottom: 2rem; } }
</style></template>`;
}
