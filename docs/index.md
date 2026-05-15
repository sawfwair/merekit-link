---
layout: home
hero:
  name: MereKit Link
  text: Declare the work graph. Gate the writes.
  tagline: A small CLI for agents that need to inspect, explain, and safely maintain links across projects, repos, docs, apps, and Executor-backed tools.
  actions:
    - theme: brand
      text: Start Linking
      link: /getting-started
    - theme: alt
      text: Read The Safety Model
      link: /reference/safety-model
features:
  - title: YAML first
    details: Keep project surfaces in a readable `mere.link.yaml` that works with or without the full Mere platform.
  - title: Dry-run by default
    details: Sync commands plan first, require explicit policy, and only write when an operator passes `--apply`.
  - title: Runtime boundary
    details: Executor-backed integrations stay behind a narrow HTTP/runtime layer with compiled policy and resource checks.
  - title: Operator policy
    details: Evaluate operator identity, trust tier, environment, and requested capabilities before sharing context or planning writes.
---

<div class="link-rail">
  <div class="link-card">
    <strong>Inspect</strong>
    <p>Validate a graph, list surfaces, and fetch one project context without touching external systems.</p>
  </div>
  <div class="link-card">
    <strong>Plan</strong>
    <p>Turn declared surfaces into Mere Projects records and URL links with a machine-readable dry run.</p>
  </div>
  <div class="link-card">
    <strong>Apply</strong>
    <p>Write only after Link policy, Executor policy, matching resource arguments, and `--apply` all agree.</p>
  </div>
</div>

## The Short Version

MereKit Link is a link graph for operational work. It tells an agent where a project lives, which surfaces matter, and which writes are allowed.

It is intentionally boring at the dangerous edge: default commands inspect, sync planning is dry-run, and writes need declared policy. That makes it useful as a public tool and as an agent-facing command surface.

## First Useful Command

```sh
npm install -g @merekit/link
mere-link config init --output mere.link.yaml
mere-link config validate --config mere.link.yaml --json
mere-link context inspect workspace workspace --role work --config mere.link.yaml --json
```

Already using the public Mere command plane?

```sh
npm install -g @merekit/cli
mere link config init --output mere.link.yaml
mere link config validate --config mere.link.yaml --json
```

The standalone `mere-link` package owns Link behavior. The root `mere` CLI bundles a generated adapter so the same commands are available as `mere link ...`.

## Learn The Shape

- [Getting Started](/getting-started) builds a starter graph and validates it.
- [Link Graph](/concepts/link-graph) explains entities, projects, surfaces, and links.
- [Write Policy](/concepts/write-policy) shows how dry-run, `policy.writes`, and `--apply` combine.
- [Operator Policy](/concepts/operator-policy) shows how identity and capabilities are evaluated.
- [Executor Runtime](/concepts/executor-runtime) explains the optional external runtime.
- [Use With Mere CLI](/guides/use-with-mere-cli) explains why the standalone and bundled entrypoints both exist.
