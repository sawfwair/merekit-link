# Codebase Map

`@merekit/link` is a standalone Node CLI that reads `mere.link.yaml`, resolves entities/projects/surfaces/links, and can plan or apply Mere Projects sync records. The executable entrypoint is `src/run.ts`; keep it as command routing only.

Key modules:

- `src/manifest.ts`: CLI manifest, help text, completion output.
- `src/config/*`: YAML loading, normalization, starter config generation, workspace snapshot shaping.
- `src/sync/projects.ts`: dry-run/apply planning for Mere Projects records and links.
- `src/runtime/*`: argument parsing, paths, output tables, JSON/YAML/subprocess boundaries.
- `src/domain/*`: shared types, plugin capabilities, scalar guards.

Rules for agents:

- Do not call `JSON.parse`, `YAML.parse`, or `spawnSync` outside `src/runtime/*`.
- Sync writes must remain dry-run by default and require `policy.writes: [sync]`.
- Preserve existing Mere Project narrative fields; sync updates only attributes for existing records.
- Run `pnpm verify` before handing off.
