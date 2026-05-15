# Connect Executor

This guide connects Link to a local Executor runtime and then compiles Link policy for a declared namespace.

## Start Executor

```sh
npm install -g executor
executor web
```

Open the Executor UI, add sources, and confirm the runtime is reachable at `http://127.0.0.1:4788`.

## Declare Runtime And Namespace

```yaml
integrations:
  executor:
    plugin: executor
    baseUrl: http://127.0.0.1:4788
  github:
    plugin: executor
    namespace: github

entities:
  workspace:
    name: Workspace
    projects:
      workspace:
        name: Workspace
        surfaces:
          code:
            integration: github
            kind: repo
            id: owner/repo
            policy:
              writes: [comment]
```

## Discover

```sh
mere-link executor sources --config mere.link.yaml --json
mere-link executor tools search "github issue" --config mere.link.yaml --json
```

## Compile Policy

```sh
mere-link executor policy compile --config mere.link.yaml --json
```

Review the rules before applying them to the runtime.

```sh
mere-link executor policy apply --config mere.link.yaml --yes --json
```

## Invoke Safely

Read paths require a declared namespace.

```sh
mere-link executor invoke read github.issues.list \
  --config mere.link.yaml \
  --data '{"repo":"owner/repo"}' \
  --json
```

Write paths require `--apply` and a matching declared resource.

```sh
mere-link executor invoke write github.issues.comment \
  --config mere.link.yaml \
  --data '{"repo":"owner/repo","issue_number":1,"body":"Linked from MereKit Link."}' \
  --apply \
  --json
```
