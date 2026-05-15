# Contributing

Thanks for helping improve MereKit Link.

## Development

```sh
pnpm install
pnpm verify
```

`pnpm verify` is the release gate. It runs linting, typechecking, tests, coverage, CLI smoke checks, an installed-package smoke check, and an npm package dry run.

Use `pnpm smoke` for command-routing changes and `pnpm smoke:package` for package, bin, or export changes.

## Safety Rules

- Keep `sync projects` dry-run by default.
- Keep Mere Projects sync gated by `policy.writes: [sync]`.
- Keep Executor writes gated by declared surfaces, matching resource arguments, and `--apply`.
- Keep JSON, YAML, subprocess, and Executor HTTP boundaries in `src/runtime/*`.
- Do not overwrite rich project narrative fields when linking an existing Mere Projects record.

## Pull Requests

Keep changes focused and update `README.md`, `CODEBASE.md`, or `DECISIONS.md` when command behavior, policy semantics, or runtime boundaries change.
