# Write Policy

MereKit Link is a safe planning tool first. Write authority is declared, narrow, and explicit.

<div class="policy-stack">
  <div class="policy-step">
    <code>1</code>
    <span>The config must declare a surface for the target resource.</span>
  </div>
  <div class="policy-step">
    <code>2</code>
    <span>The surface must include the matching `policy.writes` capability.</span>
  </div>
  <div class="policy-step">
    <code>3</code>
    <span>The operator must pass `--apply` for write-capable command paths.</span>
  </div>
  <div class="policy-step">
    <code>4</code>
    <span>Executor writes must also satisfy Link resource guards before invocation.</span>
  </div>
</div>

## Dry-run Is The Default

`sync projects` plans records and links without writing.

```sh
mere-link sync projects example-client rollout --config mere.link.yaml --json
```

The plan includes project payloads, generated links, target workspace, policy surface, and action counts.

## Sync Requires Link Policy

Planning and applying Mere Projects sync both require a Mere Projects app surface with `policy.writes: [sync]`.

```yaml
surfaces:
  projects-app:
    integration: mere
    kind: app
    id: projects
    policy:
      writes: [sync]
```

That requirement is deliberate: the presence of an app id is not enough to grant write authority.

## Apply Is Separate

```sh
mere-link sync projects example-client rollout --config mere.link.yaml --apply --json
```

Existing Mere Projects records are linked without overwriting rich narrative fields.

## Executor Writes Need Resource Matches

Executor-backed reads and writes require a declared surface and matching resource arguments. Writes also require compiled Link policy and `--apply`.

Compiled plans call these checks `resourceGuards`. Each guard contains `ArgumentPredicate` entries such as `boardId equals <declared board>`, and Link accepts the invocation when a writable surface guard matches the supplied arguments. Policy apply sends those guards to Executor and fails closed if an existing runtime policy is missing them.

```sh
mere-link executor invoke write monday.items.update \
  --config mere.link.yaml \
  --data '{"boardId":"1234567890"}' \
  --apply \
  --json
```

If the board id does not match any declared writable Link surface, Link denies the invocation before the Executor call.

## Operator Policy Is A Preflight

Surface policy answers "is this resource allowed for this tool call?" Operator policy answers "is this operator allowed to use this capability for this project?"

```sh
mere-link policy evaluate example-client rollout \
  --capability sync.plan \
  --operator approved-agent \
  --json
```

When operator policy is configured, Link enforces it before exporting context, preparing or applying sync payloads, and invoking runtime tools.
