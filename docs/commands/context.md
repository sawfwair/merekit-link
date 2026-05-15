# Context Commands

Context commands are read-only. They help agents orient themselves before making plans.

## List Entities

```sh
mere-link entities list --config mere.link.yaml --json
```

## List Projects

```sh
mere-link projects list --config mere.link.yaml --json
mere-link projects list example-client --config mere.link.yaml --json
```

## List Surfaces

```sh
mere-link surfaces list --config mere.link.yaml --json
mere-link surfaces list example-client rollout --config mere.link.yaml --json
```

## List Links

```sh
mere-link links list --config mere.link.yaml --json
```

## Inspect One Context

```sh
mere-link context inspect example-client rollout --role docs --config mere.link.yaml --json
```

Use this before acting on a project. It resolves aliases, checks ambiguity, and returns the selected entity, project, and optional role surface.
