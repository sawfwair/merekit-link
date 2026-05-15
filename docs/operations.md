# Operations

## Local checks

```bash
pnpm install
nvm use 24
pnpm lint
pnpm check
pnpm test
pnpm coverage
pnpm smoke
pnpm verify
```

`pnpm verify` is the release gate: lint, typecheck, tests, coverage, CLI smoke, installed-package smoke, docs build, and package dry run.

For release-facing changes, run the full publish preflight:

```bash
pnpm release:check
```

`pnpm release:check` adds npm audit to the normal verification gate.

## Sync safety

- `mere-link sync projects` is a dry run unless `--apply` is passed.
- Both planning and applying require a Mere Projects app surface with `policy.writes: [sync]`.
- When operator policy is configured, planning requires `sync.plan` and applying requires both `sync.plan` and `sync.apply`.
- Existing Mere Projects narrative fields must remain owned by Projects, not Link.

## Executor safety

- Tool reads and writes require Link-side resource argument matches unless a broad namespace/source/tool surface is declared.
- Tool writes require `--apply`.
- Policy apply requires `--yes`.
- Policy apply fails closed when existing runtime policies conflict with the compiled Link plan.

## Release notes

When command shapes change, update `README.md`, `CODEBASE.md`, and any bundled `mere link ...` documentation in the parent command plane.

## Docs

The `Docs` GitHub Actions workflow builds VitePress and deploys `docs/.vitepress/dist` to GitHub Pages on pushes to `main`. In repository settings, set Pages to deploy from GitHub Actions.

## Publishing

`@merekit/link` publishes from GitHub Actions through npm Trusted Publishing. Configure the npm package for repository `sawfwair/merekit-link`, workflow filename `publish.yml`, and environment `npm`. The workflow runs on `main` and publishes only when `package.json` is newer than the npm registry version.

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
