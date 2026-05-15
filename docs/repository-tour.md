# Repository Tour

MereKit Link keeps the CLI thin and pushes external boundaries into focused runtime modules.

## Key Files

- `src/run.ts` routes commands and exports the public helper API.
- `src/config/*` loads, normalizes, validates, and generates `mere.link.yaml`.
- `src/sync/projects.ts` plans and applies Mere Projects records and URL links.
- `src/sync/executor-policy.ts` compiles Link surfaces into Executor policy rules and checks resource guards.
- `src/runtime/*` owns JSON, YAML, subprocess, output, path, and Executor HTTP boundaries.
- `src/domain/*` holds shared types, guards, and plugin capability definitions.

## Public Docs

The VitePress site lives under `docs/`.

```sh
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

`pnpm verify` includes `pnpm docs:build`, so docs brokenness blocks release.

## Release Gate

```sh
pnpm verify
```

The gate runs lint, typecheck, tests, coverage, CLI smoke, installed-package smoke, docs build, and an npm package dry run.
