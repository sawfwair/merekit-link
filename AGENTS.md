# Agent Guide

`@merekit/link` lets agents inspect and maintain links between work surfaces. Treat it as a safe planning tool first and a write tool only when policy explicitly allows writes.

## Start here

- Read `README.md` for the YAML shape and CLI examples.
- Read `CODEBASE.md` for module boundaries.
- Read `DECISIONS.md` before changing write policy, sync semantics, or runtime parsing.

## Safe edit rules

- Keep `sync projects` dry-run by default.
- Require `policy.writes: [sync]` for Mere Projects write planning or applying.
- Keep JSON, YAML, and subprocess boundaries in `src/runtime/*`.
- Keep Executor HTTP/runtime calls in `src/runtime/executor.ts`.
- Do not overwrite rich project narrative fields when linking an existing Mere Projects record.
- Treat Link policy as higher authority than Executor policy; Executor writes still need declared surfaces, matching resource arguments, and `--apply`.

## Verification

Run `pnpm verify` before handing off. Use `pnpm smoke` when command routing, packaging, or completions change.
