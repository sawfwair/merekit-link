# Executor Runtime

The core Link commands work without Executor. The `mere-link executor ...` commands need a separate [Executor](https://github.com/RhysSullivan/executor)-compatible HTTP runtime.

## What Link Uses Executor For

Executor owns tool discovery, schemas, approvals, auth, and invocation for external systems. Link owns graph identity and write policy.

Link supports both Executor runtime shapes currently in use:

- Scoped runtimes with `/api/scope` and `/api/scopes/:scope/...`.
- Current unscoped runtimes with `/api/tools` and core policy tools invoked through `/api/executions`.

That split keeps the public package small:

- `@merekit/link` does not bundle Executor.
- `@merekit/link` has no npm dependency on Executor.
- Executor-backed commands talk to an HTTP runtime at command time.

## Local Runtime

Install and start Executor separately.

```sh
npm install -g executor
executor web
```

Executor's default local runtime is `http://127.0.0.1:4788`. Link defaults to `http://localhost:4788`.

## Configure Link

Use config:

```yaml
integrations:
  executor:
    plugin: executor
    baseUrl: http://127.0.0.1:4788
```

Or use flags:

```sh
mere-link executor sources --executor-base-url http://127.0.0.1:4788 --json
```

## Token Auth

If the runtime requires a bearer token, Link can read it from an environment variable.

```sh
export MERE_LINK_EXECUTOR_TOKEN=...
mere-link executor sources --json
```

For local runtimes, you can also declare the token env var in config:

```yaml
integrations:
  executor:
    plugin: executor
    baseUrl: https://executor.example.com
    tokenEnv: EXAMPLE_EXECUTOR_TOKEN
```

Or pass it at the command line:

```sh
mere-link executor sources --executor-token-env EXAMPLE_EXECUTOR_TOKEN --json
```

When a non-local Executor URL comes from `mere.link.yaml`, pass `--executor-token-env` after verifying the destination. Link will not forward either the global `MERE_LINK_EXECUTOR_TOKEN` or a config-selected `tokenEnv` to a non-local config URL.
