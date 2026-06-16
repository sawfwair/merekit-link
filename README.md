# MereKit Link

`@merekit/link` is a standalone CLI for declaring and resolving links between work surfaces.

It works in three modes:

- No Mere platform: validate and inspect a local `mere.link.yaml`.
- Partial Mere: combine local URLs, repos, channels, files, and selected Mere apps.
- Full Mere: generate starter YAML from `mere ops workspace-snapshot`.

Built-in integration plugins include `mere`, `executor`, `url`, `local`, and `generic`.

`executor` is the runtime bridge for product integrations. Link keeps the declarative graph and write policy in `mere.link.yaml`; Executor owns tool discovery, schemas, auth, approvals, and invocation for systems such as Monday, SharePoint, GitHub, Slack, OpenAPI, MCP, and GraphQL.

Operator policy adds a neutral capability gate for agent and human operators. When policy is configured, Link enforces operator identity, provider, client, account class, trust tier, environment, and requested capabilities before context export, sync planning/apply, or Executor tool invocation.

## Executor Runtime

The core Link commands work without Executor. The `mere-link executor ...` commands require an [Executor](https://github.com/RhysSullivan/executor)-compatible HTTP runtime.

For local development, install and start Executor separately:

```sh
npm install -g executor
executor web
```

Executor's default local runtime is `http://127.0.0.1:4788`. Link defaults to `http://localhost:4788`, supports both scoped and current unscoped Executor runtimes, and can be overridden with either config or flags:

```yaml
integrations:
  executor:
    plugin: executor
    baseUrl: http://127.0.0.1:4788
```

```sh
mere-link executor sources --executor-base-url http://127.0.0.1:4788 --json
mere-link executor tools search "github issue" --executor-base-url http://127.0.0.1:4788 --json
```

If the runtime requires a bearer token, set `MERE_LINK_EXECUTOR_TOKEN`, declare `tokenEnv` on the Executor integration, or pass `--executor-token-env ENV_NAME`. For non-local Executor URLs declared in config, use `tokenEnv`; Link refuses to forward the global `MERE_LINK_EXECUTOR_TOKEN` to those runtimes.

## Docs

- [Published Docs](https://sawfwair.github.io/merekit-link/)
- [Codebase Map](CODEBASE.md)
- [Design Decisions](DECISIONS.md)
- [Agent Guide](AGENTS.md)
- [Contributing](CONTRIBUTING.md)
- [Operations](docs/operations.md)
- [Security](SECURITY.md)

```sh
npm install -g @merekit/link
mere-link config init --output mere.link.yaml
mere-link config validate --config mere.link.yaml
mere-link context inspect workspace workspace --role work --config mere.link.yaml --json
mere-link policy evaluate workspace workspace --capability project.context.export --operator approved-agent --json
mere-link sync projects --config mere.link.yaml --json
mere-link executor tools search "monday item" --json
mere-link executor policy compile --config mere.link.yaml --json
```

When bundled by `@merekit/cli`, the same command surface is available as:

```sh
npm install -g @merekit/cli
mere link config init --output mere.link.yaml
mere link generate workspace --workspace ws_123 --output mere.link.yaml --yes
mere link policy evaluate workspace workspace --capability project.context.export --operator approved-agent --json
mere link sync projects --config mere.link.yaml --json
mere link executor tools search "monday item" --json
```

`@merekit/cli` publishes the root `mere` command and bundles a generated Link adapter for convenience. Link remains the source package for the command behavior, docs, YAML model, and safety policy; the root CLI discovers the Link command manifest and delegates `mere link ...` through that adapter.

`sync projects` plans Mere Projects records and URL links from configured work surfaces. It is a dry run unless `--apply` is passed, and planning/applying requires a `mere` Projects app surface with `policy.writes: [sync]`.

Existing Mere Projects records can be attached with a project surface such as `mere-project: { integration: mere, kind: record, id: prj_123 }`; Link will use that record for link upserts without touching the project narrative.

Executor-backed integrations can declare product namespaces while retaining Link's surface graph:

```yaml
integrations:
  executor:
    plugin: executor
    runtime: local
    baseUrl: http://localhost:4788
  monday:
    plugin: executor
    namespace: monday
  sharepoint:
    plugin: executor
    namespace: sharepoint

entities:
  example:
    name: Example Organization
    projects:
      rollout:
        name: Rollout
        surfaces:
          planning:
            integration: monday
            kind: board
            id: "1234567890"
            policy:
              writes: [sync]
          docs:
            integration: sharepoint
            kind: site
            id: example.sharepoint.com/sites/project
```

Compile Link policy into deterministic Executor rules before applying:

```sh
mere-link executor policy compile --config mere.link.yaml --json
mere-link executor policy apply --config mere.link.yaml --yes --json
```

Executor reads and writes through Link require a declared surface and matching resource arguments unless the config declares an explicit broad `namespace`, `source`, or exact `tool` surface. Writes also require compiled write policy and `--apply`.
Compiled plans expose Link's local resource checks as `resourceGuards`, made from `ArgumentPredicate` entries such as `boardId equals <declared board>`.

## YAML Shape

```yaml
schemaVersion: 1
operators:
  approved-agent:
    name: Approved Agent
    type: agent
    provider: managed-runtime
    client: agent-shell
    accountClass: org-managed
    trustTier: approved
policy:
  defaultEffect: deny
  rules:
    - id: allow-approved-context
      effect: allow
      capabilities: [project.context.export, sync.plan, repo.documentation.write]
      providers: [managed-runtime]
      clients: [agent-shell]
      accountClasses: [org-managed]
      trustTiers: [approved]
    - id: deny-code-write
      effect: deny
      capabilities: [repo.code.write]
integrations:
  mere:
    plugin: mere
    workspace: ws_123
  executor:
    plugin: executor
  github:
    plugin: executor
    namespace: github
  url:
    plugin: url

entities:
  workspace:
    name: Workspace
    projects:
      workspace:
        name: Workspace
        surfaces:
          work:
            integration: mere
            kind: workspace
            id: ws_123
          code:
            integration: github
            kind: repo
            id: owner/repo
            optional: true
          docs:
            integration: url
            kind: link
            id: https://example.com/docs
            optional: true

links:
  - from: workspace/workspace:work
    to: workspace/workspace:docs
    label: Documentation
```

Evaluate operator policy before exporting context or preparing write payloads:

```sh
mere-link policy taxonomy --json
mere-link policy evaluate workspace workspace --capability project.context.export --operator approved-agent --json
mere-link policy guidance
```

## Development

```sh
pnpm install
nvm use 24
pnpm hooks:install
pnpm lint
pnpm check
pnpm test
pnpm coverage
pnpm smoke
pnpm verify
```

`pnpm verify` is the release gate: lint with zero warnings, typecheck source and tests, run integration tests, enforce coverage, smoke the built CLI, and dry-run the npm package.

## Publish

`@merekit/link` publishes the standalone `mere-link` binary, generated `dist/` files, docs, and package metadata. It does not bundle Executor, local state, dependency trees, test output, coverage artifacts, or secrets.

Use [docs/guides/publish-checklist.md](docs/guides/publish-checklist.md) before a release. The `Publish` GitHub Actions workflow uses npm Trusted Publishing through GitHub Actions OIDC. Configure `@merekit/link` on npm with repository `sawfwair/merekit-link`, workflow filename `publish.yml`, and environment `npm`; no long-lived `NPM_TOKEN` is required.

```sh
pnpm release:check
```

## License

Apache-2.0.
