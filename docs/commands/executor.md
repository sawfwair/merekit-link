# Executor Commands

Executor commands talk to an Executor-compatible HTTP runtime. Link supports scoped runtimes and current unscoped runtimes that expose `/api/tools`.

## Sources

```sh
mere-link executor sources --executor-base-url http://127.0.0.1:4788 --json
```

Lists sources registered in the configured runtime. On unscoped runtimes, Link derives source rows from the advertised tool integrations.

## Search Tools

```sh
mere-link executor tools search "github issue" --json
```

Search matches tool id, plugin id, source id, name, and description.

## Describe A Tool

```sh
mere-link executor tools describe github.issues.create --json
```

Returns tool metadata and schema from Executor. If the runtime does not expose a separate schema endpoint, the advertised tool metadata is returned as the schema payload.

## Compile Policy

```sh
mere-link executor policy compile --config mere.link.yaml --json
```

Compiled rules approve reads for declared namespaces, block known writes by default, and require approval for writes granted by Link surface policy.

Writable resource surfaces include Link-side `resourceGuards`, built from `ArgumentPredicate` entries over invocation arguments.

Relay-backed local capabilities compile like any other Executor namespace. For example:

```yaml
integrations:
  localai:
    plugin: executor
    namespace: localai
  imessage:
    plugin: executor
    namespace: imessage

entities:
  personal:
    projects:
      relay:
        surfaces:
          local-ai:
            integration: localai
            kind: source
            id: mere-run
            policy:
              writes: [create, message]
          psi-model:
            integration: localai
            kind: model
            id: psi
            policy:
              writes: [message]
          imessage-line:
            integration: imessage
            kind: source
            id: default
            policy:
              writes: [message]
```

`imessage` writes guard line arguments such as `line_id` or `capability_id`. `localai` runtime surfaces guard the declared runtime capability id, such as `mere-run`; model surfaces guard model arguments such as `model`, `modelId`, or `input.model`.

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
