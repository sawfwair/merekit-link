# Command Map

MereKit Link commands are organized around config, inspection, sync planning, and Executor runtime operations.

<div class="command-grid">
  <a href="/commands/config">
    <strong>config</strong>
    <span>Create, validate, and inspect `mere.link.yaml`.</span>
  </a>
  <a href="/commands/context">
    <strong>context</strong>
    <span>Resolve a single entity/project/role context.</span>
  </a>
  <a href="/commands/sync-projects">
    <strong>sync projects</strong>
    <span>Plan or apply Mere Projects records and URL links.</span>
  </a>
  <a href="/commands/executor">
    <strong>executor</strong>
    <span>Discover tools, compile policy, and invoke runtime tools.</span>
  </a>
  <a href="/commands/policy">
    <strong>policy</strong>
    <span>Evaluate operator identity and capability gates.</span>
  </a>
</div>

## Machine-readable Manifest

```sh
mere-link commands --json
```

The manifest is the command contract used by higher-level agent surfaces.

## Completion

```sh
mere-link completion bash
mere-link completion zsh
mere-link completion fish
```

## Global Flags

Common flags include:

- `--config FILE`
- `--json`
- `--workspace ID`
- `--yes`
- `--apply`
- `--executor-base-url URL`
- `--executor-token-env ENV_NAME`
- `--executor-scope ID`
- `--operator KEY`
- `--capability NAME[,NAME]`
