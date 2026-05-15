# Publish Checklist

Use this before making the repository public or publishing a package.

## Verify

```sh
pnpm verify
```

The verification gate includes:

- lint with zero warnings
- source and test typecheck
- test suite
- coverage thresholds
- CLI smoke
- installed package smoke
- VitePress docs build
- npm package dry run

## Scan

```sh
gitleaks detect --source . --redact --no-banner
gitleaks dir . --redact --no-banner
pnpm audit --prod
```

## Inspect Package Contents

```sh
npm pack --dry-run --ignore-scripts --json
```

Check that the tarball contains docs, `dist`, package metadata, and license files. It should not contain local caches, test output, databases, keys, archives, or vendored dependency trees.

## Public Metadata

Confirm:

- `private` is `false`
- `license` is `Apache-2.0`
- package `repository`, `bugs`, and `homepage` point at the intended public repo
- `README.md`, `SECURITY.md`, and `CONTRIBUTING.md` are included in package contents
- Executor is documented as a separate runtime dependency, not a bundled dependency
- if Link command shapes changed, the `@merekit/cli` bundled adapter was regenerated and `pnpm check:adapters` passed in `~/mere/mere-cli-public`
