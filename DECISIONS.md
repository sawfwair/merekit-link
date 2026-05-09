# Decisions

## Policy-Gated Writes

`sync projects` may plan without writing, but planning and applying both require a Mere Projects app surface with `policy.writes: [sync]`. This is intentional friction: agents should not infer write authority from the presence of a workspace or app id.

## Dry Run By Default

`sync projects` only writes when `--apply` is passed. This keeps the default CLI path inspectable and safe for automation, examples, and agent exploration.

## Preserve Rich Project Fields

When a configured Mere project record already exists, Link updates only sync attributes and leaves narrative fields such as title, dates, outcomes, and descriptions intact. Mere Projects remains the source of truth for editorial project history.

## Typed Runtime Boundaries

External data enters through runtime boundary modules: JSON in `src/runtime/json.ts`, YAML in `src/runtime/yaml.ts`, and `mere` subprocess calls in `src/runtime/mere.ts`. ESLint bans those APIs elsewhere so parsing and error normalization stay centralized.

## TypeScript Pinning

The package stays on TypeScript 5.9.x while the Node engine is `>=22 <26` and the package emits declaration files for public use. Upgrade TypeScript only after `pnpm verify` passes and emitted declarations are checked for downstream compatibility.
