# MereKit Link

`@merekit/link` is a standalone CLI for declaring and resolving links between work surfaces.

It works in three modes:

- No Mere platform: validate and inspect a local `mere.link.yaml`.
- Partial Mere: combine local URLs, repos, channels, files, and selected Mere apps.
- Full Mere: generate starter YAML from `mere ops workspace-snapshot`.

Built-in integration plugins include `mere`, `monday`, `slack`, `github-cli`, `linear`, `jira`, `url`, `local`, and `generic`.

```sh
npm install -g @merekit/link
mere-link config init --output mere.link.yaml
mere-link config validate --config mere.link.yaml
mere-link context inspect workspace workspace --role work --config mere.link.yaml --json
mere-link sync projects --config mere.link.yaml --json
```

When bundled by `@merekit/cli`, the same command surface is available as:

```sh
mere link config init --output mere.link.yaml
mere link generate workspace --workspace ws_123 --output mere.link.yaml --yes
mere link sync projects --config mere.link.yaml --json
```

`sync projects` plans Mere Projects records and URL links from configured work surfaces. It is a dry run unless `--apply` is passed, and planning/applying requires a `mere` Projects app surface with `policy.writes: [sync]`.

Existing Mere Projects records can be attached with a project surface such as `mere-project: { integration: mere, kind: record, id: prj_123 }`; Link will use that record for link upserts without touching the project narrative.

## YAML Shape

```yaml
schemaVersion: 1
integrations:
  mere:
    plugin: mere
    workspace: ws_123
  github:
    plugin: github-cli
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
