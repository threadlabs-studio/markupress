# Default design system

`looma.theme.json` is Markupress's editable Looma customizer recipe. `looma.theme.css` is the complete exported CSS, including Looma's shared derivation rules and both color modes.

To change the design, import the recipe into Looma's customizer, adjust it, and export both files together. Keep the generated CSS intact. `styles/base.css` imports it into the base cascade layer so a site's own theme can override it regardless of stylesheet order.

Colors, typography, focus and control geometry belong to Looma's `--ui-*` properties. Markupress's `--markupress-*` properties size its documentation layout. The website's `app/site.css` composes the homepage and adjusts its layout widths.
