# MereKit Link

`@merekit/link` is a standalone CLI for declaring and resolving links between work surfaces.

It works in three modes:

- No Mere platform: validate and inspect a local `mere.link.yaml`.
- Partial Mere: combine local URLs, repos, channels, files, and selected Mere apps.
- Full Mere: generate starter YAML from `mere ops workspace-snapshot`.

Built-in integration plugins include `mere`, `executor`, `url`, `local`, and `generic`.

`executor` is the runtime bridge for product integrations. Link keeps the declarative graph and write policy in `mere.link.yaml`; Executor owns tool discovery, schemas, auth, approvals, and invocation for systems such as Monday, SharePoint, GitHub, Slack, OpenAPI, MCP, and GraphQL.

## Docs

- [Codebase Map](CODEBASE.md)
- [Design Decisions](DECISIONS.md)
- [Agent Guide](AGENTS.md)
- [Operations](docs/operations.md)

```sh
npm install -g @merekit/link
mere-link config init --output mere.link.yaml
mere-link config validate --config mere.link.yaml
mere-link context inspect workspace workspace --role work --config mere.link.yaml --json
mere-link sync projects --config mere.link.yaml --json
mere-link executor tools search "monday item" --json
mere-link executor policy compile --config mere.link.yaml --json
```

When bundled by `@merekit/cli`, the same command surface is available as:

```sh
mere link config init --output mere.link.yaml
mere link generate workspace --workspace ws_123 --output mere.link.yaml --yes
mere link sync projects --config mere.link.yaml --json
```

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
  acme:
    name: Acme
    projects:
      rollout:
        name: Rollout
        surfaces:
          planning:
            integration: monday
            kind: board
            id: "18204749659"
            policy:
              writes: [sync]
          docs:
            integration: sharepoint
            kind: site
            id: sawfwair.sharepoint.com/sites/acme
```

Compile Link policy into deterministic Executor rules before applying:

```sh
mere-link executor policy compile --config mere.link.yaml --json
mere-link executor policy apply --config mere.link.yaml --yes --json
```

Executor writes through Link require a declared surface, compiled write policy, matching resource arguments, and `--apply`.

## YAML Shape

```yaml
schemaVersion: 1
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

## Development

```sh
pnpm install
pnpm hooks:install
pnpm lint
pnpm check
pnpm test
pnpm coverage
pnpm smoke
pnpm verify
```

`pnpm verify` is the release gate: lint with zero warnings, typecheck source and tests, run integration tests, enforce coverage, smoke the built CLI, and dry-run the npm package.

## License

Apache-2.0.
