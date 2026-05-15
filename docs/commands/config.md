# Config Commands

Config commands create and inspect the graph file.

## Init

```sh
mere-link config init --output mere.link.yaml
```

Use `--workspace` and `--name` to seed a workspace-oriented file.

```sh
mere-link config init --workspace ws_123 --name "Example Org" --output mere.link.yaml
```

Link refuses to overwrite an existing file unless `--yes` is passed.

## Validate

```sh
mere-link config validate --config mere.link.yaml
mere-link config validate --config mere.link.yaml --json
```

Validation checks integration plugins, surface kinds, write policies, aliases, and link endpoints.

## Inspect

```sh
mere-link config inspect --config mere.link.yaml
mere-link config inspect --config mere.link.yaml --json
```

The JSON output includes a summary and normalized config.

## Generate From A Workspace Snapshot

```sh
mere-link generate workspace --workspace ws_123 --output mere.link.yaml --yes
```

For offline or repeatable tests, use a saved snapshot file:

```sh
mere-link generate workspace --snapshot-file snapshot.json --output mere.link.yaml --yes
```
