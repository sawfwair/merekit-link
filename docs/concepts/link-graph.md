# Link Graph

The graph answers one question: where does work live?

## Entities

An entity is the owner or customer-facing unit for work. It can be a company, internal team, product line, or workspace.

```yaml
entities:
  example-client:
    name: Example Client
    aliases: [client]
```

Aliases let agents use natural references without relying on exact YAML keys.

## Projects

A project groups related surfaces under an entity.

```yaml
projects:
  rollout:
    name: Rollout
```

When a command receives only an entity, Link requires a project if the entity has more than one. That keeps ambiguous automation out of the write path.

## Surfaces

A surface is one role-specific place where the project exists: a repo, docs site, board, channel, app, file, directory, or product runtime resource.

```yaml
surfaces:
  code:
    integration: github
    kind: repo
    id: owner/repo
  docs:
    integration: url
    kind: link
    id: https://example.com/docs
```

Roles are local to the project. Use names like `work`, `code`, `docs`, `planning`, `discussion`, or `projects-app`.

## Links

Explicit links connect two role surfaces.

```yaml
links:
  - from: example-client/rollout:code
    to: example-client/rollout:docs
    label: Documentation
```

The link endpoint format is:

```txt
entity/project:role
```

## Integrations

Integrations map surface declarations onto plugins.

```yaml
integrations:
  url:
    plugin: url
  github:
    plugin: executor
    namespace: github
```

Built-in plugin kinds are validated before commands run. That gives agents fast failure when a graph drifts.
