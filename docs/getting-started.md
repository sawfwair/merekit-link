# Getting Started

MereKit Link starts from a single YAML file. You can use it as a standalone inspector, as a Mere workspace helper, or as the policy layer in front of Executor-backed product integrations.

## Install

```sh
npm install -g @merekit/link
mere-link --version
```

If you already use the public Mere command plane, install `@merekit/cli` instead and run the same Link commands under `mere link`:

```sh
npm install -g @merekit/cli
mere link config init --output mere.link.yaml
mere link config validate --config mere.link.yaml --json
```

The standalone `@merekit/link` package remains the source package for Link behavior and docs. The `@merekit/cli` package bundles a generated Link adapter so operators can keep one root `mere` entrypoint across apps.

For local development inside this repo:

```sh
pnpm install
pnpm verify
```

## Create A Config

```sh
mere-link config init --output mere.link.yaml
```

That creates a small graph with one workspace entity, one workspace project, and a few starter surfaces.

## Validate And Inspect

```sh
mere-link config validate --config mere.link.yaml --json
mere-link entities list --config mere.link.yaml --json
mere-link projects list workspace --config mere.link.yaml --json
mere-link surfaces list workspace workspace --config mere.link.yaml --json
```

Use `context inspect` when an agent needs a single project context.

```sh
mere-link context inspect workspace workspace --role work --config mere.link.yaml --json
```

## Evaluate Operator Policy

Operator policy is optional in the YAML, but when used it gives agents a neutral preflight before exporting context or preparing writes.

```sh
mere-link policy taxonomy --json
mere-link policy evaluate workspace workspace --capability project.context.export --operator approved-agent --config mere.link.yaml --json
```

## Add A Surface

```yaml
schemaVersion: 1
integrations:
  url:
    plugin: url
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
          docs:
            integration: url
            kind: link
            id: https://example.com/docs
          code:
            integration: github
            kind: repo
            id: owner/repo
            optional: true
```

Run validation again after every shape change.

```sh
mere-link config validate --config mere.link.yaml
```

## Next Steps

- [Map the link graph](/concepts/link-graph)
- [Evaluate operator policy](/concepts/operator-policy)
- [Add write policy](/concepts/write-policy)
- [Connect Executor](/guides/connect-executor)
- [Use with Mere CLI](/guides/use-with-mere-cli)
