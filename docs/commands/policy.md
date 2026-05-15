# Policy Commands

Policy commands evaluate neutral operator capabilities from `mere.link.yaml`.

## evaluate

```sh
mere-link policy evaluate example-org rollout \
  --capability project.context.export \
  --operator approved-agent \
  --config mere.link.yaml \
  --json
```

Use comma-separated capabilities for multi-capability preflight:

```sh
mere-link policy evaluate example-org rollout \
  --capability project.context.export,sync.plan \
  --operator approved-agent \
  --json
```

Inline operator attributes are available when the operator is not declared in YAML:

```sh
mere-link policy evaluate example-org rollout \
  --capability repo.code.review \
  --operator-provider managed-runtime \
  --operator-client agent-shell \
  --operator-account-class org-managed \
  --operator-trust-tier approved \
  --json
```

The command exits nonzero when the policy denies the requested capability set, while still printing the decision payload with `--json`.

## taxonomy

```sh
mere-link policy taxonomy --json
```

Prints the neutral capability list and policy attribute frame.

## guidance

```sh
mere-link policy guidance
```

Prints agent guidance and supported `MERE_LINK_OPERATOR_*` identity environment variables.
