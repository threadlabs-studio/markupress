---
id: authoring
sidebarLabel: Author a page
---
# Author a page

Use Markdown for prose and native component resources for interactive examples.

<link rel="component" href="../../components/counter.html">

<demo-counter></demo-counter>

## Controller references

Keep the source in `counter.ts` and reference `counter.js` in HTML.

```html
<template component="demo-counter" controller="./counter.js">
  <!-- Component content -->
</template>
```

## Versions

Run `markupress snapshot v1` before changing these docs. The version links preserve this page's `authoring` identity across route changes.
