# Repository guidance

## Authority and product boundaries

- README.md and checked-in plans define the product; threadlabs.config.json defines repository ownership. CLAUDE.md imports this file.
- Markupress is a public MIT documentation product, published as the unscoped npm package `markupress`.
- HTMLKit owns routing, general navigation, rendering, and browser adoption. Markupress owns Markdown, documentation versions, navigation labels and policy, and its Looma theme.
- Use the public HTML Next proposal for declarative component semantics. Do not introduce another component parser or runtime.
- Keep document identity, URL paths, and component names separate. Preserve code examples literally and resolve dependency links relative to their original source.

## Implementation

- Use strict ESM TypeScript 7, pnpm through Corepack, and Foundation's maintained Node LTS range and resolved pins.
- Controllers are authored in TypeScript and referenced as `.js` from HTML. Verify this through installed development and production consumers before claiming support.
- Use Oxlint and project-owned CSS. Never add Prettier or Tailwind.
- Audit native browser mechanisms before adding runtime behavior. Use Looma native component resources selectively rather than importing a second auto-registering runtime.
- Explain non-obvious boundaries and invariants beside code; keep cross-cutting rationale in linked design docs. Avoid comments that merely repeat identifiers.

## Safe work and Compound Engineering

- Preserve unrelated changes and never rewrite pushed history without explicit authorization.
- Preview Foundation plans and review their exact digest, ownership, modules, and verification cost before application.
- Check ownership before editing. Change Foundation templates for managed paths; preserve local paths and stop on ambiguous ownership.
- Use a single agent and the current model by default. Cross-model review is off unless explicitly requested. Keep automatic PR babysitting enabled.
- Keep plans under docs/plans and durable verified learnings under docs/solutions. Record execution progress outside plan documents.
- Public templates and fixtures must not expose private project context.

## Verification and release

- Run focused tests and `corepack pnpm verify:inner` during development; run `corepack pnpm verify:pr` before handoff. Report results, skips, and remaining judgment.
- Exercise packed installed consumers rather than relying on workspace resolution.
- Run one foreground Playwright runner per repository with `--workers=1` locally.
- Publish only through the protected, human-approved release workflow. The 0.0.1 npm reservation is immutable; a baseline scaffold is not a product release.
