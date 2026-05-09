# Operations

## Local checks

```bash
pnpm install
pnpm lint
pnpm check
pnpm test
pnpm coverage
pnpm smoke
pnpm verify
```

`pnpm verify` is the release gate: lint, typecheck, tests, coverage, CLI smoke, and package dry run.

## Sync safety

- `mere-link sync projects` is a dry run unless `--apply` is passed.
- Both planning and applying require a Mere Projects app surface with `policy.writes: [sync]`.
- Existing Mere Projects narrative fields must remain owned by Projects, not Link.

## Release notes

When command shapes change, update `README.md`, `CODEBASE.md`, and any bundled `mere link ...` documentation in the parent command plane.
