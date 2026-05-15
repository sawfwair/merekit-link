# Operator Policy

Operator policy is a neutral capability gate. It answers one question before an agent or human operator receives context or prepares a write: is this operator allowed to use these capabilities for this project?

## Policy Inputs

Link evaluates:

- operator key
- operator type
- provider
- client
- account class
- account id
- trust tier
- environment
- requested capabilities

The shape is intentionally ABAC-like: operator attributes plus requested action capabilities.

## Example

```yaml
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
```

Evaluate it:

```sh
mere-link policy evaluate example-org rollout \
  --capability project.context.export,sync.plan \
  --operator approved-agent \
  --config mere.link.yaml \
  --json
```

## Inheritance

Policy can be declared at the root, entity, or project level. Entity policy inherits root policy by default. Project policy inherits entity policy by default. Set `inherit: false` on a policy block when a lower level should replace the inherited rules.

Explicit deny rules win over allow rules. If no rule matches and `defaultEffect` is `deny`, the capability is denied.

When policy is configured, command paths that export context, plan/apply sync, or invoke Executor tools enforce the matching capability before proceeding.

## Override

`--override` marks one reviewed operation as allowed. It should only be used after human approval and leaves the decision visible in JSON output.
