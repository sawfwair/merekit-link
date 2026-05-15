# Sync Projects

`sync projects` materializes configured work surfaces into Mere Projects records and URL links.

## Plan

```sh
mere-link sync projects example-client rollout --config mere.link.yaml --json
```

Planning is dry-run. It still requires an explicit Mere Projects app surface with `policy.writes: [sync]`.

## Apply

```sh
mere-link sync projects example-client rollout --config mere.link.yaml --apply --json
```

Apply writes project records and link records through the `mere` CLI.

## Workspace

The workspace comes from:

1. `--workspace`
2. the target `mere` integration's `workspace`
3. `integrations.mere.workspace`

## Existing Records

Attach an existing Mere Projects record with a record surface:

```yaml
surfaces:
  mere-project:
    integration: mere
    kind: record
    id: prj_existing
```

When a configured record exists, Link uses it for link upserts and does not update project narrative fields.
