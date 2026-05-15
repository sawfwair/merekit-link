# Executor Commands

Executor commands talk to an Executor-compatible HTTP runtime.

## Sources

```sh
mere-link executor sources --executor-base-url http://127.0.0.1:4788 --json
```

Lists sources registered in the configured runtime scope.

## Search Tools

```sh
mere-link executor tools search "github issue" --json
```

Search matches tool id, plugin id, source id, name, and description.

## Describe A Tool

```sh
mere-link executor tools describe github.issues.create --json
```

Returns tool metadata and schema from Executor.

## Compile Policy

```sh
mere-link executor policy compile --config mere.link.yaml --json
```

Compiled rules approve reads for declared namespaces, block known writes by default, and require approval for writes granted by Link surface policy.

Writable resource surfaces include Link-side `resourceGuards`, built from `ArgumentPredicate` entries over invocation arguments.

## Apply Policy

```sh
mere-link executor policy apply --config mere.link.yaml --yes --json
```

Policy apply requires `--yes` because it writes rules into the runtime.

## Invoke

```sh
mere-link executor invoke read github.issues.list \
  --config mere.link.yaml \
  --data '{"repo":"owner/repo"}' \
  --json
```

Read invocation requires a declared surface and matching resource arguments unless the config declares an explicit broad `namespace`, `source`, or exact `tool` surface. Write invocation also requires `--apply`.

```sh
mere-link executor invoke write github.issues.create \
  --config mere.link.yaml \
  --data '{"repo":"owner/repo","title":"Follow up"}' \
  --apply \
  --json
```
