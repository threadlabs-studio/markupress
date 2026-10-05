# Markupress

Versioned Markdown documentation built on HTMLKit and native declarative components, with a Looma theme.

Markupress is under development. The npm package `markupress@0.0.1` reserves the name; it does not contain the documentation generator. This repository establishes the development baseline and [implementation plan](docs/plans/2026-10-04-1830-feat-markupress-platform-plan.md).

## Product direction

- Markdown supports native declarative components and resource dependency links.
- Documentation versions have immutable snapshots and version-aware links and navigation.
- HTMLKit owns ordered file routes and the reusable navigation component. Markupress supplies documentation policy and the Looma theme.
- Maintained controllers use strict ESM TypeScript 7. HTML references their emitted `.js` names; development and production resolution must be verified before this convention is documented as supported.
- Existing Markdown, code examples, assets, anchors, and route aliases remain migration inputs.

## Development

Use a supported Node 22 or 24 LTS release and pnpm through Corepack:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm verify:pr
```

Foundation pins TypeScript, Vitest, Oxlint, and pnpm. [AGENTS.md](AGENTS.md) is the canonical contributor contract; the [Foundation manifest](threadlabs.config.json) records ownership.

Publishing uses the approval-gated GitHub release workflow and npm environment. No product release is ready yet.

## License

[MIT](LICENSE), copyright Threadlabs Studio contributors.
