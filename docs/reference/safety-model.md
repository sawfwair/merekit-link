# Safety Model

MereKit Link treats declarative policy as higher authority than runtime affordance. A tool existing somewhere does not mean an agent can use it to write.

## Invariants

- `sync projects` is dry-run unless `--apply` is passed.
- Mere Projects sync requires `policy.writes: [sync]` even for planning.
- Existing Mere Projects narrative fields are not overwritten when a record is linked.
- Executor policy is compiled from declared Link surfaces.
- Executor writes require declared surfaces, matching resource arguments, and `--apply`.
- Link resource guards are local `ArgumentPredicate` checks over invocation arguments.
- Operator policy defaults to deny and explicit deny rules win over allows.
- JSON, YAML, subprocess, and Executor HTTP calls stay in `src/runtime/*`.

## Why Planning Needs Policy

Planning can expose write payloads, generated ids, and target resources. Requiring `policy.writes: [sync]` for planning keeps the config honest before any operator sees an apply command.

## Executor Enforcement Layers

Compiled Executor rules do two things:

- approve reads for declared namespaces
- block or require approval for known write patterns

Writable resource surfaces also compile Link-side `resourceGuards`. Link checks those resource arguments locally before invoking write-capable tools.

## Failure Mode

When policy is missing, Link fails closed. Operators should add the narrowest surface policy that matches the intended write.

For operator policy, use the narrowest capability rule that matches the operator and project. Treat `--override` as a one-operation human approval, not a persistent grant.
