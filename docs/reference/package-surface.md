# Package Surface

`@merekit/link` publishes a small Node package with one CLI binary.

## Binary

```json
{
  "bin": {
    "mere-link": "dist/run.js"
  }
}
```

The installed-package smoke verifies that the symlinked npm binary runs `--version`, emits the command manifest, and renders shell completion.

Publishing is handled by the `Publish` GitHub Actions workflow. It runs `pnpm release:check`, publishes with npm provenance through Trusted Publishing, and creates the matching GitHub Release after a successful npm publish.

## Bundled Entry Point

`@merekit/cli` bundles Link as an app adapter, so installed root-CLI users can run the same behavior through `mere link ...`.

```sh
npm install -g @merekit/cli
mere link commands --json
mere link config validate --config mere.link.yaml --json
```

That adapter is generated from this package's built `dist/` output. This repository remains the source for Link behavior, docs, and the `mere-link` binary.

## Public Exports

```json
{
  "exports": {
    ".": {
      "types": "./dist/run.d.ts",
      "import": "./dist/run.js"
    }
  }
}
```

The root export exposes the command entrypoint and selected helper functions for downstream command-plane integration.

## Included Files

The package allowlist includes:

- `dist`
- `README.md`
- `LICENSE`
- `NOTICE`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODEBASE.md`
- `DECISIONS.md`
- `docs`

It does not bundle Executor, dependency trees, coverage output, VitePress build artifacts, or local caches.
