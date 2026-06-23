# YAML Shape

`mere.link.yaml` is the source of truth for the graph.

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
      capabilities: [project.context.export, sync.plan]
      providers: [managed-runtime]
      clients: [agent-shell]
      accountClasses: [org-managed]
      trustTiers: [approved]
integrations:
  mere:
    plugin: mere
    workspace: ws_123
  executor:
    plugin: executor
    baseUrl: http://127.0.0.1:4788
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

links:
  - from: workspace/workspace:code
    to: workspace/workspace:docs
    label: Documentation
```

## Integration Fields

| Field | Meaning |
| --- | --- |
| `plugin` | Built-in plugin: `mere`, `executor`, `url`, `local`, or `generic`. |
| `workspace` | Optional workspace or tenant identifier used by some plugins. |
| `namespace` | Executor namespace for product integrations. |
| `baseUrl` | Executor HTTP runtime URL. |
| `tokenEnv` | Environment variable that contains a bearer token for a local Executor runtime. Non-local config URLs require `--executor-token-env`. |

## Operator Fields

| Field | Meaning |
| --- | --- |
| `name` | Human-readable operator name. |
| `type` | Operator class, such as `agent`, `human`, or `external`. |
| `provider` | Runtime or model/tool provider. |
| `client` | Client surface, such as `codex`, `claude-code`, or `browser`. |
| `accountClass` | Account class, such as `org-managed`, `customer-managed`, `personal`, or `unknown`. |
| `accountId` | Optional account or workspace identifier. |
| `trustTier` | Trust tier, such as `approved`, `conditional`, `blocked`, or `unknown`. |
| `environment` | Execution environment, defaulting to `local-cli`. |

## Policy Fields

| Field | Meaning |
| --- | --- |
| `defaultEffect` | `deny` or `allow`; default is `deny`. |
| `inherit` | Set to `false` on entity/project policy to replace inherited rules. |
| `notes` | Optional human review notes. |
| `rules[].effect` | `allow` or `deny`. Deny wins when multiple rules match. |
| `rules[].capabilities` | Requested capabilities such as `project.context.export` or `repo.code.write`; `*` matches all. |
| `rules[].operators` | Optional operator key filters. |
| `rules[].providers`, `clients`, `accountClasses`, `trustTiers`, `environments` | Optional operator attribute filters. |
| `rules[].reason` | Explanation shown in policy decisions. |

## Surface Fields

| Field | Meaning |
| --- | --- |
| `integration` | Key in `integrations`. |
| `kind` | Resource kind supported by that plugin. |
| `id` | Stable resource id, URL, repo slug, board id, or app id. |
| `name` | Optional display name. |
| `optional` | Marks a surface as non-blocking for context. |
| `policy.writes` | Declared write capabilities for this surface. |

## Link Endpoints

```txt
entity/project:role
```

Endpoints are normalized and validated. Unknown entities, projects, or roles fail validation.
