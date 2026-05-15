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

## Parent CLI Adapter

`@merekit/cli` bundles Link as a generated adapter. After changing commands, flags, command risk, or manifest shape, refresh the parent command-plane checkout:

```bash
cd ~/mere/mere-cli-public
pnpm build:adapters
pnpm check:adapters
```

Before publishing either package, compare:

```bash
mere-link commands --json
MERE_CLI_SOURCE=bundled mere link commands --json
```

The command lists should match for Link. If they do not, regenerate the adapter before release.
